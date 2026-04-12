import { NextRequest, NextResponse } from "next/server";
import {
  generateShopifyProducts,
  generateShopifyCustomers,
  generateBinderPOSExport,
  generateSquareExport,
  generateGenericCSV,
} from "@/lib/import/samples/generate";

/* ------------------------------------------------------------------ */
/*  GET /api/import/samples?system=shopify&type=inventory               */
/*  Returns a sample CSV for demo/testing purposes.                     */
/*  No auth required — this is a sales tool.                            */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const system = url.searchParams.get("system") ?? "generic";
  const type = url.searchParams.get("type") ?? "inventory";

  let csv: string;
  let filename: string;

  switch (`${system}_${type}`) {
    case "shopify_inventory":
      csv = generateShopifyProducts();
      filename = "shopify-products-sample.csv";
      break;
    case "shopify_customers":
      csv = generateShopifyCustomers();
      filename = "shopify-customers-sample.csv";
      break;
    case "binderpos_inventory":
      csv = generateBinderPOSExport();
      filename = "binderpos-inventory-sample.csv";
      break;
    case "square_inventory":
      csv = generateSquareExport();
      filename = "square-items-sample.csv";
      break;
    default:
      csv = generateGenericCSV();
      filename = "generic-inventory-sample.csv";
      break;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
