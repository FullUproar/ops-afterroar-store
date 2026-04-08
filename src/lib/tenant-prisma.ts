import { prisma } from "./prisma";

/* ------------------------------------------------------------------ */
/*  Tenant-Scoped Prisma Client                                        */
/*  Uses Prisma Client Extensions to auto-inject store_id on all       */
/*  pos_* model queries. This is the structural defense layer —        */
/*  even if a route forgets to add store_id, queries are scoped.       */
/* ------------------------------------------------------------------ */

// Models that have a direct store_id column
const TENANT_MODELS = [
  "posStore",
  "posStaff",
  "posCustomer",
  "posCustomerNote",
  "posInventoryItem",
  "posSupplier",
  "posEvent",
  "posLedgerEntry",
  "posTradeIn",
  "posReturn",
  "posGiftCard",
  "posLocation",
  "posInventoryLevel",
  "posTransfer",
  "posPreorder",
  "posPromotion",
  "posLoyaltyEntry",
  "posImportJob",
  "posCertification",
  "posGameCheckout",
  "posPurchaseOrder",
  "posStockCount",
  "posTournament",
  "posOrder",
  "posTab",
  "posMenuItem",
  "posMenuModifier",
  "posConsignmentItem",
  "posTimeEntry",
  "posOperationalLog",
  "posMobileSession",
  "posAccessCodeAttempt",
  "posAllocationPool",
  "posInventoryHold",
] as const;

type TenantModel = (typeof TENANT_MODELS)[number];

function isTenantModel(model: string | undefined): model is TenantModel {
  return TENANT_MODELS.includes(model as TenantModel);
}

export type TenantPrismaClient = ReturnType<typeof getTenantClient>;

/**
 * Returns a Prisma client that automatically scopes all pos_* queries
 * to the given store_id. Child models (PosEventCheckin, PosTradeInItem,
 * PosReturnItem) are scoped through their parent FK relationships.
 */
export function getTenantClient(storeId: string) {
  if (!storeId) {
    throw new Error("SECURITY: getTenantClient called without storeId");
  }

  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (isTenantModel(model)) {
            args.where = { ...args.where, store_id: storeId };
            // DIAGNOSTIC: log to verify extension is running
            if (model === "posCustomer") {
              console.log(`[TENANT] ${model}.findMany scoped to store_id=${storeId}, where=`, JSON.stringify((args as Record<string, unknown>).where).slice(0, 200));
            }
          }
          const results = await query(args);
          // SECURITY: warn if any results leak from another store
          if (isTenantModel(model) && Array.isArray(results) && results.length > 0) {
            const leaked = (results as Array<Record<string, unknown>>).filter(
              (r) => r.store_id && r.store_id !== storeId,
            );
            if (leaked.length > 0) {
              console.error(
                `[TENANT ISOLATION BREACH] ${model}.findMany returned ${leaked.length} rows ` +
                `from wrong store(s). Expected store_id=${storeId}.`,
              );
            }
          }
          return results;
        },
        async findFirst({ model, args, query }) {
          if (isTenantModel(model)) {
            args.where = { ...args.where, store_id: storeId };
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          // findUnique requires exact unique fields — we can't inject store_id
          // into the where clause directly. We verify after fetch and LOG any breach.
          const result = await query(args);
          if (isTenantModel(model) && result) {
            const record = result as Record<string, unknown>;
            if (record.store_id && record.store_id !== storeId) {
              console.error(
                `[TENANT ISOLATION BREACH] ${model}.findUnique returned record from ` +
                `store_id=${record.store_id}, expected=${storeId}. ` +
                `Query: ${JSON.stringify((args as Record<string, unknown>).where).slice(0, 200)}`
              );
              return null;
            }
          }
          return result;
        },
        async count({ model, args, query }) {
          if (isTenantModel(model)) {
            args.where = { ...args.where, store_id: storeId };
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (isTenantModel(model)) {
            args.where = { ...args.where, store_id: storeId };
          }
          return query(args);
        },
        async create({ model, args, query }) {
          if (isTenantModel(model) && model !== "posStore") {
            const data = args.data as Record<string, unknown>;
            if (!data.store_id) {
              data.store_id = storeId;
            }
          }
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (isTenantModel(model) && model !== "posStore") {
            const dataArray = Array.isArray(args.data) ? args.data : [args.data];
            for (const item of dataArray) {
              const record = item as Record<string, unknown>;
              if (!record.store_id) {
                record.store_id = storeId;
              }
            }
          }
          return query(args);
        },
        async update({ model, args, query }) {
          if (isTenantModel(model)) {
            const where = args.where as Record<string, unknown>;
            where.store_id = storeId;
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (isTenantModel(model)) {
            args.where = { ...args.where, store_id: storeId };
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (isTenantModel(model)) {
            const where = args.where as Record<string, unknown>;
            where.store_id = storeId;
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (isTenantModel(model)) {
            args.where = { ...args.where, store_id: storeId };
          }
          return query(args);
        },
      },
    },
  });
}
