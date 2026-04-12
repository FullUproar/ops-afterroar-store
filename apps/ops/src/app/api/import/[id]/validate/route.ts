import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { mapRows } from "@/lib/import/parser";
import { validateRows } from "@/lib/import/validators";

/* ------------------------------------------------------------------ */
/*  POST /api/import/[id]/validate — run validation on mapped data      */
/* ------------------------------------------------------------------ */
export async function POST(
  _request: NextRequest,
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

    const fieldMappingData = job.field_mapping as Record<string, unknown>;
    const mapping = (fieldMappingData.mapping ?? {}) as Record<string, string>;
    const transforms = (fieldMappingData.transforms ?? {}) as Record<string, string>;

    // Re-parse the preview data (stored as raw rows)
    const previewRows = job.preview_data as Record<string, string>[];
    // For full validation, we need all rows — but we only store preview (first 5).
    // For now, validate what we have. Full validation happens at dry-run time.

    const mappedRows = mapRows(previewRows, mapping, transforms);
    const entityType = job.entity_type as "inventory" | "customers";
    const validation = validateRows(mappedRows, entityType);

    await db.posImportJob.update({
      where: { id },
      data: {
        validation_errors: JSON.parse(JSON.stringify(validation.errors)),
        status: validation.errorCount === 0 ? "validated" : "mapping",
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      errors: validation.errors,
      error_count: validation.errorCount,
      warning_count: validation.warningCount,
      status: validation.errorCount === 0 ? "validated" : "has_errors",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
