import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const GOD_ADMIN = "info@fulluproar.com";

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== GOD_ADMIN) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(`<!DOCTYPE html>
<html><body style="font-family:system-ui;background:#0a0a0a;color:#fff;padding:40px;text-align:center">
<h2>Run Pending Migrations</h2>
<p style="color:#999">032: Add hold_type to pos_tabs (POS unification)</p>
<button onclick="fetch('/api/admin/migrate',{method:'POST'}).then(r=>r.json()).then(d=>{document.getElementById('r').textContent=JSON.stringify(d,null,2)}).catch(e=>{document.getElementById('r').textContent='Error: '+e})" style="padding:12px 32px;background:#FF8200;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:bold">
Run Migration
</button>
<pre id="r" style="margin-top:20px;text-align:left;background:#1a1a2e;padding:16px;border-radius:8px;color:#4ade80"></pre>
</body></html>`, {
    headers: { "Content-Type": "text/html" },
  });
}

/**
 * POST /api/admin/migrate — run pending migrations
 * GOD MODE only. Runs raw SQL migrations against the database.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.email !== GOD_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: string[] = [];

  try {
    // 032: Add hold_type to pos_tabs
    await prisma.$executeRawUnsafe(
      `ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS hold_type TEXT DEFAULT 'cafe'`
    );
    results.push("032a: hold_type added");

    await prisma.$executeRawUnsafe(
      `ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parked_by_staff_id TEXT`
    );
    results.push("032b: parked_by_staff_id added");

    await prisma.$executeRawUnsafe(
      `ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parked_at TIMESTAMPTZ`
    );
    results.push("032c: parked_at added");

    // 033: Catalog enrichment — universal product metadata
    const catalogFields = [
      "publisher TEXT", "distributor TEXT", "release_year INT", "msrp_cents INT",
      "bgg_id TEXT", "bgg_rating DECIMAL(3,1)", "bgg_weight DECIMAL(3,2)",
      "min_players INT", "max_players INT", "min_play_time INT", "max_play_time INT",
      "min_age INT", "mechanics TEXT", "themes TEXT",
      "contents_description TEXT", "cards_per_pack INT", "packs_per_box INT",
    ];
    for (const field of catalogFields) {
      const [name] = field.split(" ");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS ${field}`
      );
    }
    results.push("033: catalog enrichment fields added");

    // 034: Staff invite tokens
    const inviteFields = [
      "invite_token TEXT",
      "invite_expires_at TIMESTAMPTZ",
      "invite_accepted_at TIMESTAMPTZ",
    ];
    for (const field of inviteFields) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE pos_staff ADD COLUMN IF NOT EXISTS ${field}`
      );
    }
    results.push("034: staff invite fields added");

    // 035: Inventory allocation + holds
    await prisma.$executeRawUnsafe(`ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS online_allocation INT DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS pos_inventory_holds (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL REFERENCES pos_inventory_items(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES pos_customers(id),
        staff_id TEXT NOT NULL REFERENCES pos_staff(id),
        quantity INT NOT NULL DEFAULT 1,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        held_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        fulfilled_at TIMESTAMPTZ,
        released_at TIMESTAMPTZ
      )
    `);
    results.push("035: inventory allocation + holds table added");

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed", results },
      { status: 500 }
    );
  }
}
