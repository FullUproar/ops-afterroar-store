import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { mapRows } from "@/lib/import/parser";
import { executeImport } from "@/lib/import/executor";

/* ------------------------------------------------------------------ */
/*  POST /api/import/[id]/dry-run — execute without writing             */
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

    // The full CSV rows need to be sent in the request body for dry-run
    // (We don't store the full CSV server-side to avoid bloating the DB)
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

    const result = await executeImport(storeId, entityType, mappedRows, true);

    await db.posImportJob.update({
      where: { id },
      data: {
        dry_run_summary: JSON.parse(JSON.stringify(result)),
        status: "previewing",
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      ...result,
      total_rows: body.rows.length,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
