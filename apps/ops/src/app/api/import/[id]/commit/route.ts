import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { mapRows } from "@/lib/import/parser";
import { executeImport } from "@/lib/import/executor";

/* ------------------------------------------------------------------ */
/*  POST /api/import/[id]/commit — commit the import (write to DB)      */
/* ------------------------------------------------------------------ */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db, storeId } = await requirePermission("store.settings");

    const job = await db.posImportJob.findFirst({
      where: { id },
    });
    if (!job) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 });
    }
    if (job.status === "committed") {
      return NextResponse.json({ error: "Import already committed" }, { status: 400 });
    }

    let body: { rows: Record<string, string>[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const fieldMappingData = job.field_mapping as Record<string, unknown>;
    const mapping = (fieldMappingData.mapping ?? {}) as Record<string, string>;
    const transforms = (fieldMappingData.transforms ?? {}) as Record<string, string>;

    const mappedRows = mapRows(body.rows, mapping, transforms);
    const entityType = job.entity_type as "inventory" | "customers";

    // Execute for real
    const result = await executeImport(storeId, entityType, mappedRows, false);

    // Update job status
    await db.posImportJob.update({
      where: { id },
      data: {
        status: result.errors.length > 0 ? "partial" : "committed",
        dry_run_summary: JSON.parse(JSON.stringify(result)),
        committed_at: new Date(),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      ...result,
      total_rows: body.rows.length,
      status: result.errors.length > 0 ? "partial" : "committed",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
