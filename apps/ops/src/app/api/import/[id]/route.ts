import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/import/[id] — job status                                   */
/* ------------------------------------------------------------------ */
export async function GET(
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

    return NextResponse.json(job);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/import/[id] — update field mapping                       */
/* ------------------------------------------------------------------ */
export async function PATCH(
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
    if (job.status === "committed") {
      return NextResponse.json({ error: "Cannot modify committed import" }, { status: 400 });
    }

    const body = await request.json();

    const updated = await db.posImportJob.update({
      where: { id },
      data: {
        field_mapping: body.field_mapping ?? job.field_mapping,
        status: "mapping",
        updated_at: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/import/[id] — cancel/delete import job                  */
/* ------------------------------------------------------------------ */
export async function DELETE(
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

    await db.posImportJob.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
