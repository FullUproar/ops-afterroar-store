/* ------------------------------------------------------------------ */
/*  Data Certification Checks                                           */
/*  Verify isolation, integrity, completeness, and consistency.         */
/* ------------------------------------------------------------------ */

import { prisma } from "@/lib/prisma";

export interface CheckResult {
  name: string;
  category: "isolation" | "integrity" | "completeness" | "consistency";
  status: "pass" | "fail" | "warn";
  details: string;
  count?: number;
}

/** Run all certification checks for a store */
export async function runAllChecks(storeId: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Run all checks in parallel where possible
  const [
    isolation1, isolation2, isolation3,
    integrity1, integrity2,
    consistency1,
  ] = await Promise.all([
    checkCustomerLedgerIsolation(storeId),
    checkEventCheckinIsolation(storeId),
    checkStaffLedgerIsolation(storeId),
    checkCreditBalanceIntegrity(storeId),
    checkOrphanedLedgerEntries(storeId),
    checkInventoryConsistency(storeId),
  ]);

  results.push(isolation1, isolation2, isolation3);
  results.push(integrity1, integrity2);
  results.push(consistency1);

  return results;
}

/** Check: no customer has ledger entries from another store */
async function checkCustomerLedgerIsolation(storeId: string): Promise<CheckResult> {
  const leaked = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM pos_ledger_entries le
    JOIN pos_customers c ON le.customer_id = c.id
    WHERE c.store_id = ${storeId}
    AND le.store_id != ${storeId}
  `;

  const count = Number(leaked[0]?.count ?? 0);
  return {
    name: "Customer Ledger Isolation",
    category: "isolation",
    status: count === 0 ? "pass" : "fail",
    details: count === 0
      ? "All customer ledger entries belong to the correct store"
      : `${count} ledger entries reference customers from another store`,
    count,
  };
}

/** Check: no event checkins reference customers from another store */
async function checkEventCheckinIsolation(storeId: string): Promise<CheckResult> {
  const leaked = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM pos_event_checkins ec
    JOIN pos_events e ON ec.event_id = e.id
    JOIN pos_customers c ON ec.customer_id = c.id
    WHERE e.store_id = ${storeId}
    AND c.store_id != ${storeId}
  `;

  const count = Number(leaked[0]?.count ?? 0);
  return {
    name: "Event Check-in Isolation",
    category: "isolation",
    status: count === 0 ? "pass" : "fail",
    details: count === 0
      ? "All event check-ins reference same-store customers"
      : `${count} check-ins reference customers from another store`,
    count,
  };
}

/** Check: no ledger entries reference staff from another store */
async function checkStaffLedgerIsolation(storeId: string): Promise<CheckResult> {
  const leaked = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM pos_ledger_entries le
    JOIN pos_staff s ON le.staff_id = s.id
    WHERE le.store_id = ${storeId}
    AND s.store_id != ${storeId}
  `;

  const count = Number(leaked[0]?.count ?? 0);
  return {
    name: "Staff Ledger Isolation",
    category: "isolation",
    status: count === 0 ? "pass" : "fail",
    details: count === 0
      ? "All ledger entries reference same-store staff"
      : `${count} ledger entries reference staff from another store`,
    count,
  };
}

/** Check: customer credit balances match ledger history */
async function checkCreditBalanceIntegrity(storeId: string): Promise<CheckResult> {
  const mismatches = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH ledger_credits AS (
      SELECT customer_id,
             COALESCE(SUM(credit_amount_cents), 0) as ledger_balance
      FROM pos_ledger_entries
      WHERE store_id = ${storeId}
      AND customer_id IS NOT NULL
      GROUP BY customer_id
    )
    SELECT COUNT(*) as count
    FROM pos_customers c
    LEFT JOIN ledger_credits lc ON c.id = lc.customer_id
    WHERE c.store_id = ${storeId}
    AND c.credit_balance_cents != COALESCE(lc.ledger_balance, 0)
    AND (c.credit_balance_cents > 0 OR COALESCE(lc.ledger_balance, 0) != 0)
  `;

  const count = Number(mismatches[0]?.count ?? 0);
  return {
    name: "Credit Balance Integrity",
    category: "integrity",
    status: count === 0 ? "pass" : "warn",
    details: count === 0
      ? "All customer credit balances match ledger history"
      : `${count} customers have credit balances that don't match their ledger entries`,
    count,
  };
}

/** Check: no orphaned ledger entries (referencing non-existent customers) */
async function checkOrphanedLedgerEntries(storeId: string): Promise<CheckResult> {
  const orphaned = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM pos_ledger_entries le
    WHERE le.store_id = ${storeId}
    AND le.customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pos_customers c WHERE c.id = le.customer_id
    )
  `;

  const count = Number(orphaned[0]?.count ?? 0);
  return {
    name: "Orphaned Ledger Entries",
    category: "integrity",
    status: count === 0 ? "pass" : "warn",
    details: count === 0
      ? "No orphaned ledger entries found"
      : `${count} ledger entries reference non-existent customers`,
    count,
  };
}

/** Check: inventory quantities are non-negative */
async function checkInventoryConsistency(storeId: string): Promise<CheckResult> {
  const negative = await prisma.posInventoryItem.count({
    where: { store_id: storeId, quantity: { lt: 0 } },
  });

  return {
    name: "Inventory Quantity Consistency",
    category: "consistency",
    status: negative === 0 ? "pass" : "warn",
    details: negative === 0
      ? "All inventory quantities are non-negative"
      : `${negative} items have negative quantities`,
    count: negative,
  };
}
