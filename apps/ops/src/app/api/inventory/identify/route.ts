import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/inventory/identify — AI product identification            */
/*  Takes a photo (base64 data URL) and identifies the product.         */
/*  Returns a search query + description to feed back into checkout.    */
/*                                                                      */
/*  "Tyler doesn't know what this statuette is. Claude does."           */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    await requireStaff();

    let body: { image: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { image } = body;
    if (!image) {
      return NextResponse.json({ error: "image is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        query: null,
        description: "AI identification not configured",
      });
    }

    // Extract base64 data and media type from data URL
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Invalid image format. Expected base64 data URL." },
        { status: 400 }
      );
    }

    const mediaType = match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const imageData = match[2];

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageData,
              },
            },
            {
              type: "text",
              text: `You are a product identifier for a game store. This store sells: TCG cards (Magic, Pokemon, Yu-Gi-Oh), board games, miniatures, figurines (Funko Pop, anime figures, etc.), accessories (sleeves, dice, playmats), sealed product (booster boxes, starter decks), and café items.

Identify this product. Return JSON:
{
  "query": "search term to find this in inventory (e.g. 'Funko Pop Pikachu' or 'Dragon Shield sleeves')",
  "description": "brief description for the cashier (e.g. 'Funko Pop! Vinyl — Pikachu #353, Pokemon series')",
  "estimated_price_range": "$10-15",
  "category": "miniature|accessory|board_game|tcg_single|sealed|food_drink|other",
  "confidence": "high|medium|low"
}

If you can't identify it, return:
{
  "query": null,
  "description": "Unable to identify — suggest selling as unlisted item",
  "confidence": "none"
}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");
      const parsed = JSON.parse(jsonMatch[0]);

      return NextResponse.json({
        query: parsed.query ?? null,
        description: parsed.description ?? "Could not identify",
        estimated_price_range: parsed.estimated_price_range ?? null,
        category: parsed.category ?? "other",
        confidence: parsed.confidence ?? "low",
      });
    } catch {
      return NextResponse.json({
        query: null,
        description: text.slice(0, 200) || "Could not identify this item",
        confidence: "none",
      });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
