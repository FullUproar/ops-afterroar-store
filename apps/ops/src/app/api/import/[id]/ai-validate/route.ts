import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { mapRows } from "@/lib/import/parser";
import { validateRows } from "@/lib/import/validators";
import { aiValidateImport } from "@/lib/import/ai-validator";

/* ------------------------------------------------------------------ */
/*  POST /api/import/[id]/ai-validate                                   */
/*  Runs both deterministic + AI validation on the import data.         */
/*  The AI layer catches what rules miss: anomalies, patterns, quality. */
/* ------------------------------------------------------------------ */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requirePermission("store.settings");

    const job = await db.posImportJob.findFirst({
      where: { id },
    });
    if (!job) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }

    // Parse rows from request body
    let body: { rows: Record<string, string>[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const fieldMappingData = job.field_mapping as Record<string, unknown>;
    const mapping = (fieldMappingData.mapping ?? {}) as Record<string, string>;
    const transforms = (fieldMappingData.transforms ?? {}) as Record<string, string>;
    const entityType = job.entity_type as "inventory" | "customers";

    // Apply mapping
    const mappedRows = mapRows(body.rows, mapping, transforms);

    // Layer 1: Deterministic validation
    const deterministicResult = validateRows(mappedRows, entityType);

    // Layer 2: AI validation (runs in parallel-safe manner)
    let aiResult;
    try {
      aiResult = await aiValidateImport(entityType, mappedRows, job.source_system);
    } catch (err) {
      // AI validation failure should not block the import
      aiResult = {
        anomalies: [],
        suggestions: [{
          type: "mapping" as const,
          message: `AI validation unavailable: ${err instanceof Error ? err.message : "unknown error"}`,
          affectedRows: [],
        }],
        confidence: -1, // Indicates AI was not available
        summary: "AI validation could not run — deterministic checks only",
        tokenUsage: { input: 0, output: 0 },
      };
    }

    // Combine results
    const combinedErrors = [
      ...deterministicResult.errors.map((e) => ({
        source: "rules" as const,
        ...e,
      })),
      ...aiResult.anomalies.map((a) => ({
        source: "ai" as const,
        row: a.row ?? 0,
        field: a.field ?? "",
        message: a.message,
        severity: a.severity,
        suggestedFix: a.suggestedFix,
      })),
    ];

    // Update job with validation results
    await db.posImportJob.update({
      where: { id },
      data: {
        validation_errors: JSON.parse(JSON.stringify(combinedErrors)),
        status: deterministicResult.errorCount === 0 ? "validated" : "mapping",
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      // Deterministic results
      deterministic: {
        errors: deterministicResult.errors,
        error_count: deterministicResult.errorCount,
        warning_count: deterministicResult.warningCount,
      },
      // AI results
      ai: {
        anomalies: aiResult.anomalies,
        suggestions: aiResult.suggestions,
        confidence: aiResult.confidence,
        summary: aiResult.summary,
        token_usage: aiResult.tokenUsage,
      },
      // Combined
      total_issues: combinedErrors.length,
      blocking_issues: combinedErrors.filter((e) => e.severity === "error").length,
      data_quality_score: aiResult.confidence >= 0 ? aiResult.confidence : null,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
