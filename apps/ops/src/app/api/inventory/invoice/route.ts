import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/inventory/invoice — AI-extract items from an invoice      */
/*  Accepts: pasted text, CSV content, or base64 image of a packing    */
/*  list / distributor invoice.                                         */
/*                                                                      */
/*  Returns structured item list ready for the receiving flow.          */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("inventory.adjust");

    let body: {
      text?: string;
      image?: string; // base64 data URL
      source_hint?: string; // "alliance", "acd", "phd", etc.
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.text && !body.image) {
      return NextResponse.json(
        { error: "Either text or image is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        items: [],
        error: "AI not configured",
      });
    }

    const client = new Anthropic({ apiKey });

    // Build the message content
    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

    if (body.image) {
      const match = body.image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: match[2],
          },
        });
      }
    }

    const sourceHint = body.source_hint
      ? `This is from distributor: ${body.source_hint}. `
      : "";

    content.push({
      type: "text",
      text: `You are an inventory receiving assistant for a game store. ${sourceHint}Extract every product from this ${body.image ? "invoice/packing list image" : "invoice text"}.

${body.text ? `INVOICE TEXT:\n${body.text.slice(0, 10000)}` : ""}

For each product, return:
- name: full product name
- quantity: number of units
- cost_cents: wholesale/cost price per unit in cents (if shown)
- price_cents: suggested retail price in cents (if shown, or estimate MSRP)
- sku: SKU or item number (if shown)
- barcode: UPC/EAN (if shown)
- category: one of tcg_single, sealed, board_game, miniature, accessory, food_drink, other

Return JSON:
{
  "items": [
    {
      "name": "product name",
      "quantity": 6,
      "cost_cents": 1600,
      "price_cents": 2200,
      "sku": "ABC123",
      "barcode": "123456789012",
      "category": "sealed"
    }
  ],
  "invoice_reference": "Invoice #12345 if visible",
  "distributor": "Alliance Game Distributors if identifiable",
  "confidence": "high|medium|low",
  "notes": "any issues or uncertainties"
}

Extract EVERYTHING you can see. Better to include uncertain items than miss them — the user will review before confirming.`,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");
      const parsed = JSON.parse(jsonMatch[0]);

      return NextResponse.json({
        items: parsed.items ?? [],
        invoice_reference: parsed.invoice_reference ?? null,
        distributor: parsed.distributor ?? null,
        confidence: parsed.confidence ?? "medium",
        notes: parsed.notes ?? null,
        token_usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      });
    } catch {
      return NextResponse.json({
        items: [],
        notes: "Could not parse invoice. Try pasting the text instead of an image.",
        confidence: "none",
      });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
