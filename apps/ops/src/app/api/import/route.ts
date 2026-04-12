import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { parseCSV, autoMapFields, hashContent } from "@/lib/import/parser";
import { getFieldMapTemplate } from "@/lib/import/field-maps";

/* ------------------------------------------------------------------ */
/*  GET /api/import — list import jobs for store                        */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requirePermission("store.settings");

    const jobs = await db.posImportJob.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        source_system: true,
        entity_type: true,
        status: true,
        file_name: true,
        row_count: true,
        created_at: true,
        committed_at: true,
      },
    });

    return NextResponse.json(jobs);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/import — create import job + upload CSV                   */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, db, storeId } = await requirePermission("store.settings");

    let body: {
      source_system: string;
      entity_type: "inventory" | "customers";
      file_name: string;
      csv_content: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { source_system, entity_type, file_name, csv_content } = body;

    if (!source_system || !entity_type || !file_name || !csv_content) {
      return NextResponse.json(
        { error: "source_system, entity_type, file_name, and csv_content are required" },
        { status: 400 }
      );
    }

    // Hash for idempotency
    const fileHash = await hashContent(csv_content);

    // Check for duplicate import
    const existing = await db.posImportJob.findFirst({
      where: { file_hash: fileHash },
    });
    if (existing) {
      return NextResponse.json(
        { id: existing.id, status: existing.status, deduplicated: true },
        { status: 200 }
      );
    }

    // Parse CSV
    const parsed = parseCSV(csv_content);
    if (parsed.rowCount === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Auto-detect field mapping
    const template = getFieldMapTemplate(source_system, entity_type);
    const { fieldMapping, transforms } = autoMapFields(parsed.headers, template);

    // Create job
    const job = await db.posImportJob.create({
      data: {
        store_id: storeId,
        staff_id: staff.id,
        source_system,
        entity_type,
        status: "mapping",
        file_name,
        file_hash: fileHash,
        row_count: parsed.rowCount,
        field_mapping: { mapping: fieldMapping, transforms, headers: parsed.headers },
        preview_data: parsed.rows.slice(0, 5),
      },
    });

    return NextResponse.json(
      {
        id: job.id,
        status: job.status,
        row_count: parsed.rowCount,
        headers: parsed.headers,
        auto_mapping: fieldMapping,
        transforms,
        unmapped_headers: parsed.headers.filter((h) => !fieldMapping[h]),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
