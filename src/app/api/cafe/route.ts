import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/types";
import { getDefaultTaxRate } from "@/lib/tax";
import { getStoreSettings } from "@/lib/store-settings-shared";

/* ------------------------------------------------------------------ */
/*  Cafe / Tab API                                                     */
/*  GET: list open tabs                                                */
/*  POST: actions (open_tab, add_item, update_item_status, close_tab) */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();
    const status = request.nextUrl.searchParams.get("status") || "open";

    const tabs = await db.posTab.findMany({
      where: { store_id: storeId, status },
      orderBy: { opened_at: "desc" },
      include: {
        items: { orderBy: { created_at: "asc" } },
        customer: { select: { name: true } },
      },
      take: 100,
    });

    return NextResponse.json(tabs);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requireStaff();
    const body = await request.json();
    const action = body.action as string;

    // ---- OPEN TAB ----
    if (action === "open_tab") {
      const tab = await db.posTab.create({
        data: {
          store_id: storeId,
          customer_id: body.customer_id || null,
          staff_id: staff.id,
          event_id: body.event_id || null,
          table_label: body.table_label || null,
          notes: body.notes || null,
        },
      });
      return NextResponse.json(tab, { status: 201 });
    }

    // ---- ADD ITEM TO TAB ----
    if (action === "add_item") {
      const { tab_id, name, price_cents, quantity, modifiers, notes } = body;
      if (!tab_id || !name) {
        return NextResponse.json({ error: "tab_id and name required" }, { status: 400 });
      }

      const tab = await db.posTab.findFirst({ where: { id: tab_id, store_id: storeId, status: "open" } });
      if (!tab) {
        return NextResponse.json({ error: "Tab not found or closed" }, { status: 404 });
      }

      const item = await db.posTabItem.create({
        data: {
          tab_id,
          name: name.trim(),
          price_cents: price_cents || 0,
          quantity: quantity || 1,
          modifiers: modifiers || null,
          notes: notes || null,
        },
      });

      // Update tab subtotal
      const itemTotal = (price_cents || 0) * (quantity || 1);
      await db.posTab.update({
        where: { id: tab_id },
        data: { subtotal_cents: { increment: itemTotal } },
      });

      return NextResponse.json(item, { status: 201 });
    }

    // ---- ADD INVENTORY ITEM TO TAB (retail purchase on same tab) ----
    if (action === "add_inventory_item") {
      const { tab_id, inventory_item_id, quantity: qty } = body;
      if (!tab_id || !inventory_item_id) {
        return NextResponse.json({ error: "tab_id and inventory_item_id required" }, { status: 400 });
      }

      const tab = await db.posTab.findFirst({ where: { id: tab_id, store_id: storeId, status: "open" } });
      if (!tab) return NextResponse.json({ error: "Tab not found or closed" }, { status: 404 });

      const invItem = await db.posInventoryItem.findFirst({
        where: { id: inventory_item_id, store_id: storeId },
        select: { id: true, name: true, price_cents: true },
      });
      if (!invItem) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

      const itemQty = qty || 1;
      const item = await db.posTabItem.create({
        data: {
          tab_id,
          name: invItem.name,
          price_cents: invItem.price_cents,
          quantity: itemQty,
          item_type: "retail",
          inventory_item_id: invItem.id,
          status: "served",
        },
      });

      await db.posTab.update({
        where: { id: tab_id },
        data: { subtotal_cents: { increment: invItem.price_cents * itemQty } },
      });

      return NextResponse.json(item, { status: 201 });
    }

    // ---- SET TABLE FEE ----
    if (action === "set_table_fee") {
      const { tab_id, fee_type, fee_cents } = body;
      if (!tab_id || !fee_type) {
        return NextResponse.json({ error: "tab_id and fee_type required" }, { status: 400 });
      }

      await db.posTab.update({
        where: { id: tab_id },
        data: { table_fee_type: fee_type, table_fee_cents: fee_cents || 0 },
      });

      if (fee_cents && fee_cents > 0) {
        await db.posTabItem.create({
          data: {
            tab_id,
            name: `Table Fee (${fee_type})`,
            price_cents: fee_cents,
            quantity: 1,
            item_type: "table_fee",
            status: "served",
          },
        });
        await db.posTab.update({
          where: { id: tab_id },
          data: { subtotal_cents: { increment: fee_cents } },
        });
      }

      return NextResponse.json({ success: true });
    }

    // ---- WAIVE TABLE FEE ----
    if (action === "waive_table_fee") {
      const { tab_id } = body;
      if (!tab_id) return NextResponse.json({ error: "tab_id required" }, { status: 400 });

      const tab = await db.posTab.findFirst({
        where: { id: tab_id, store_id: storeId, status: "open" },
        include: { items: true },
      });
      if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });

      const feeItem = tab.items.find((i) => i.item_type === "table_fee");
      if (feeItem) {
        await db.posTabItem.delete({ where: { id: feeItem.id } });
        await db.posTab.update({
          where: { id: tab_id },
          data: { subtotal_cents: { decrement: feeItem.price_cents }, table_fee_waived: true },
        });
      } else {
        await db.posTab.update({ where: { id: tab_id }, data: { table_fee_waived: true } });
      }

      return NextResponse.json({ success: true });
    }

    // ---- AGE VERIFY ----
    if (action === "age_verify") {
      const { tab_id } = body;
      if (!tab_id) return NextResponse.json({ error: "tab_id required" }, { status: 400 });
      await db.posTab.update({ where: { id: tab_id }, data: { age_verified: true } });
      return NextResponse.json({ success: true });
    }

    // ---- UPDATE ITEM STATUS (KDS) ----
    if (action === "update_item_status") {
      const { item_id, status: newStatus } = body;
      if (!item_id || !newStatus) {
        return NextResponse.json({ error: "item_id and status required" }, { status: 400 });
      }

      const updated = await db.posTabItem.update({
        where: { id: item_id },
        data: {
          status: newStatus,
          ...(newStatus === "served" ? { served_at: new Date() } : {}),
        },
      });

      return NextResponse.json(updated);
    }

    // ---- CLOSE TAB ----
    if (action === "close_tab") {
      const { tab_id, payment_method } = body;
      if (!tab_id) {
        return NextResponse.json({ error: "tab_id required" }, { status: 400 });
      }

      const tab = await db.posTab.findFirst({
        where: { id: tab_id, store_id: storeId, status: "open" },
        include: { items: true },
      });
      if (!tab) {
        return NextResponse.json({ error: "Tab not found or already closed" }, { status: 404 });
      }

      // Calculate total with tax
      const subtotal = tab.items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
      const store = await db.posStore.findFirst({ where: { id: storeId }, select: { settings: true } });
      const settings = getStoreSettings((store?.settings ?? {}) as Record<string, unknown>);
      const taxRate = settings.tax_rate_percent || getDefaultTaxRate();
      const taxCents = Math.round(subtotal * (taxRate / 100));
      const totalCents = subtotal + taxCents;

      // Create ledger entry
      const itemNames = tab.items.map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ""}`).join(", ");
      // SECURITY: use tenant-scoped db for ledger writes
      const ledgerEntry = await db.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "sale",
          customer_id: tab.customer_id,
          staff_id: staff.id,
          event_id: tab.event_id,
          amount_cents: totalCents,
          description: `Tab: ${itemNames}`,
          metadata: JSON.parse(JSON.stringify({
            tab_id: tab.id,
            table_label: tab.table_label,
            payment_method: payment_method || "cash",
            items: tab.items.map((i) => ({
              name: i.name,
              price_cents: i.price_cents,
              quantity: i.quantity,
              modifiers: i.modifiers,
            })),
            tax_cents: taxCents,
            source: "cafe",
          })),
        },
      });

      // Deduct inventory for retail items on the tab
      const retailItems = tab.items.filter((i) => i.item_type === "retail" && i.inventory_item_id);
      for (const ri of retailItems) {
        await db.posInventoryItem.updateMany({
          where: { id: ri.inventory_item_id!, store_id: storeId },
          data: { quantity: { decrement: ri.quantity } },
        });
      }

      // Close tab
      await db.posTab.update({
        where: { id: tab_id },
        data: {
          status: "closed",
          subtotal_cents: subtotal,
          tax_cents: taxCents,
          total_cents: totalCents,
          ledger_entry_id: ledgerEntry.id,
          closed_at: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        total_cents: totalCents,
        ledger_entry_id: ledgerEntry.id,
      });
    }

    // ---- KDS VIEW (pending cafe items only — exclude retail/fee) ----
    if (action === "kds") {
      const items = await db.posTabItem.findMany({
        where: {
          status: { in: ["pending", "in_progress"] },
          item_type: "cafe", // Only cafe items need kitchen prep
          tab: { status: "open" },
        },
        include: {
          tab: { select: { table_label: true, customer: { select: { name: true } } } },
        },
        orderBy: { created_at: "asc" },
      });

      return NextResponse.json(items);
    }

    // ---- TRANSFER TAB (move to different table) ----
    if (action === "transfer_tab") {
      const { tab_id, new_table_label } = body;
      if (!tab_id) return NextResponse.json({ error: "tab_id required" }, { status: 400 });

      const tab = await db.posTab.findFirst({ where: { id: tab_id, store_id: storeId, status: "open" } });
      if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });

      const oldTable = tab.table_label;
      await db.posTab.update({
        where: { id: tab_id },
        data: { table_label: new_table_label || null, transferred_from: oldTable },
      });

      return NextResponse.json({ success: true, from: oldTable, to: new_table_label });
    }

    // ---- SPLIT TAB (move selected items to a new tab) ----
    if (action === "split_tab") {
      const { tab_id, item_ids } = body as { tab_id: string; item_ids: string[] };
      if (!tab_id || !item_ids?.length) {
        return NextResponse.json({ error: "tab_id and item_ids required" }, { status: 400 });
      }

      const tab = await db.posTab.findFirst({
        where: { id: tab_id, store_id: storeId, status: "open" },
        include: { items: true },
      });
      if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });

      const itemsToMove = tab.items.filter((i) => item_ids.includes(i.id));
      if (itemsToMove.length === 0) return NextResponse.json({ error: "No matching items" }, { status: 400 });

      const movedSubtotal = itemsToMove.reduce((s, i) => s + i.price_cents * i.quantity, 0);

      // Create new tab
      const newTab = await db.posTab.create({
        data: {
          store_id: storeId,
          staff_id: staff.id,
          table_label: tab.table_label ? `${tab.table_label} (split)` : "Split",
          parent_tab_id: tab.id,
          customer_id: tab.customer_id,
          event_id: tab.event_id,
          subtotal_cents: movedSubtotal,
        },
      });

      // Move items
      for (const item of itemsToMove) {
        await db.posTabItem.update({
          where: { id: item.id },
          data: { tab_id: newTab.id },
        });
      }

      // Update original tab subtotal
      await db.posTab.update({
        where: { id: tab_id },
        data: { subtotal_cents: { decrement: movedSubtotal } },
      });

      return NextResponse.json({ success: true, new_tab_id: newTab.id });
    }

    // ---- MENU ITEMS CRUD ----
    if (action === "get_menu") {
      const menuItems = await db.posMenuItem.findMany({
        where: { store_id: storeId },
        orderBy: [{ category: "asc" }, { sort_order: "asc" }, { name: "asc" }],
      });
      const modifiers = await db.posMenuModifier.findMany({
        where: { store_id: storeId },
        orderBy: { sort_order: "asc" },
      });
      return NextResponse.json({ menu_items: menuItems, modifiers });
    }

    if (action === "add_menu_item") {
      const { name, category, price_cents, description, age_restricted } = body;
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const item = await db.posMenuItem.create({
        data: {
          store_id: storeId,
          name: name.trim(),
          category: category || "other",
          price_cents: price_cents || 0,
          description: description || null,
          age_restricted: !!age_restricted,
        },
      });
      return NextResponse.json(item, { status: 201 });
    }

    if (action === "add_modifier") {
      const { name, options, required, multi_select, applies_to } = body;
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const modifier = await db.posMenuModifier.create({
        data: {
          store_id: storeId,
          name: name.trim(),
          options: options || [],
          required: !!required,
          multi_select: !!multi_select,
          applies_to: applies_to || [],
        },
      });
      return NextResponse.json(modifier, { status: 201 });
    }

    // ---- ADD FROM MENU (with modifiers) ----
    if (action === "add_menu_to_tab") {
      const { tab_id, menu_item_id, modifiers: selectedMods, quantity: qty } = body;
      if (!tab_id || !menu_item_id) {
        return NextResponse.json({ error: "tab_id and menu_item_id required" }, { status: 400 });
      }

      const tab = await db.posTab.findFirst({ where: { id: tab_id, store_id: storeId, status: "open" } });
      if (!tab) return NextResponse.json({ error: "Tab not found" }, { status: 404 });

      const menuItem = await db.posMenuItem.findFirst({ where: { id: menu_item_id, store_id: storeId } });
      if (!menuItem) return NextResponse.json({ error: "Menu item not found" }, { status: 404 });

      // Age check
      if (menuItem.age_restricted && !tab.age_verified) {
        return NextResponse.json({ error: "Age verification required for this item", age_verification_required: true }, { status: 403 });
      }

      // Calculate modifier price additions
      let modifierTotal = 0;
      const modifierNames: string[] = [];
      if (selectedMods && Array.isArray(selectedMods)) {
        for (const mod of selectedMods as Array<{ name: string; price_cents: number }>) {
          modifierTotal += mod.price_cents || 0;
          modifierNames.push(mod.name);
        }
      }

      const totalPrice = menuItem.price_cents + modifierTotal;
      const itemQty = qty || 1;

      const item = await db.posTabItem.create({
        data: {
          tab_id,
          name: menuItem.name,
          price_cents: totalPrice,
          quantity: itemQty,
          modifiers: modifierNames.length > 0 ? modifierNames.join(", ") : null,
          item_type: "cafe",
        },
      });

      await db.posTab.update({
        where: { id: tab_id },
        data: { subtotal_cents: { increment: totalPrice * itemQty } },
      });

      // Auto-waive table fee check
      const settings = getStoreSettings((await db.posStore.findFirst({ where: { id: storeId }, select: { settings: true } }))?.settings as Record<string, unknown> ?? {});
      const freeThreshold = (settings.cafe_free_threshold_cents as number) || 0;
      if (freeThreshold > 0 && !tab.table_fee_waived) {
        const updatedTab = await db.posTab.findFirst({
          where: { id: tab_id },
          select: { subtotal_cents: true },
        });
        if (updatedTab && updatedTab.subtotal_cents >= freeThreshold) {
          // Auto-waive
          const feeItems = await db.posTabItem.findMany({
            where: { tab_id, item_type: "table_fee" },
          });
          for (const fi of feeItems) {
            await db.posTabItem.delete({ where: { id: fi.id } });
            await db.posTab.update({
              where: { id: tab_id },
              data: { subtotal_cents: { decrement: fi.price_cents }, table_fee_waived: true },
            });
          }
        }
      }

      return NextResponse.json(item, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
