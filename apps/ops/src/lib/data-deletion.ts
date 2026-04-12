import { prisma } from "@/lib/prisma";
import { enqueueHQ } from "@/lib/hq-outbox";

/* ------------------------------------------------------------------ */
/*  GDPR / CCPA Customer Data Deletion Engine                          */
/*                                                                     */
/*  Anonymizes personal data while preserving financial records for    */
/*  tax/audit compliance. The customer row stays (referential          */
/*  integrity) but all PII is scrubbed.                                */
/* ------------------------------------------------------------------ */

export interface DeletionReport {
  customer_id: string;
  anonymized: boolean;
  notes_deleted: number;
  ledger_entries_preserved: number;
  orders_preserved: number;
  hq_notified: boolean;
  completed_at: string;
}

/**
 * Delete (anonymize) all personal data for a customer.
 *
 * - PII fields are scrubbed on the customer record
 * - Customer notes are hard-deleted
 * - Financial records (ledger, orders, trade-ins) are kept but point
 *   to the now-anonymized customer record
 * - Gift cards have their `purchased_by_customer_id` nulled
 * - HQ is notified via outbox if the customer was linked to Afterroar
 */
export async function deleteCustomerData(
  storeId: string,
  customerId: string,
): Promise<DeletionReport> {
  // 1. Verify the customer exists and belongs to this store
  const customer = await prisma.posCustomer.findFirst({
    where: { id: customerId, store_id: storeId },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  if (customer.deletion_requested) {
    throw new Error("Customer data has already been deleted");
  }

  const afterroarUserId = customer.afterroar_user_id;

  // 2. Count records we'll preserve (for the report)
  const [ledgerCount, orderCount, notesCount] = await Promise.all([
    prisma.posLedgerEntry.count({
      where: { customer_id: customerId, store_id: storeId },
    }),
    prisma.posOrder.count({
      where: { customer_id: customerId, store_id: storeId },
    }),
    prisma.posCustomerNote.count({
      where: { customer_id: customerId, store_id: storeId },
    }),
  ]);

  // 3. Run all mutations in a transaction
  await prisma.$transaction(async (tx) => {
    // a) Anonymize the customer record
    await tx.posCustomer.update({
      where: { id: customerId },
      data: {
        name: "Deleted Customer",
        email: null,
        phone: null,
        afterroar_user_id: null,
        notes: null,
        tags: [],
        deleted_at: new Date(),
        deletion_requested: true,
      },
    });

    // b) Hard-delete all customer notes
    await tx.posCustomerNote.deleteMany({
      where: { customer_id: customerId, store_id: storeId },
    });

    // c) Null out gift card purchaser link
    await tx.$executeRawUnsafe(
      `UPDATE pos_gift_cards SET purchased_by_customer_id = NULL WHERE purchased_by_customer_id = $1 AND store_id = $2`,
      customerId,
      storeId,
    );

    // Financial records (ledger_entries, orders, trade_ins, returns,
    // loyalty_entries, event_checkins, tabs, consignment_items, preorders,
    // game_checkouts, tournament_players) keep their customer_id pointing
    // to the now-anonymized customer record. This preserves referential
    // integrity and financial audit trails.
  });

  // 4. HQ bridge notification (fire-and-forget, outside transaction)
  let hqNotified = false;
  if (afterroarUserId) {
    await enqueueHQ(storeId, "customer_deletion", {
      afterroar_user_id: afterroarUserId,
      customer_id: customerId,
      reason: "gdpr_ccpa_deletion_request",
    });
    hqNotified = true;
  }

  return {
    customer_id: customerId,
    anonymized: true,
    notes_deleted: notesCount,
    ledger_entries_preserved: ledgerCount,
    orders_preserved: orderCount,
    hq_notified: hqNotified,
    completed_at: new Date().toISOString(),
  };
}
