import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { aiExtractFromText } from "@/lib/import/ai-validator";

/* ------------------------------------------------------------------ */
/*  POST /api/import/ai-extract                                         */
/*  AI-powered extraction from messy formats: pasted text, PDFs,        */
/*  unknown CSVs, or any unstructured data a store owner brings.        */
/*                                                                      */
/*  "Bring us whatever you've got — we'll figure it out."               */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("store.settings");

    let body: {
      text: string;
      entity_type: "inventory" | "customers";
      context?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { text, entity_type, context } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (!entity_type) {
      return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    try {
      const result = await aiExtractFromText(text, entity_type, context);

      return NextResponse.json({
        headers: result.headers,
        rows: result.rows,
        row_count: result.rows.length,
        confidence: result.confidence,
        notes: result.notes,
        token_usage: result.tokenUsage,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `AI extraction failed: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
