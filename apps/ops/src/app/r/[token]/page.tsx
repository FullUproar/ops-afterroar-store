import { ReceiptView } from "./receipt-view";

/**
 * Public receipt page — no auth required.
 * The token in the URL is the access control.
 * Always renders in light mode for the customer's phone.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReceiptView token={token} />;
}

export function generateMetadata() {
  return {
    title: "Receipt - Afterroar",
    robots: "noindex",
  };
}
