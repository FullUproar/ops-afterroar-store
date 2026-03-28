import { notFound } from "next/navigation";

/**
 * Public receipt page — no auth required.
 * Displays a receipt by token. Currently shows "not found" since we don't
 * have receipt persistence yet. Infrastructure is ready for when we add
 * a pos_receipt table.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // TODO: Look up receipt by token from pos_receipt table
  // For now, always show not found
  const receipt = null;

  if (!receipt) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm mx-auto space-y-4">
          <div className="text-6xl text-gray-300 dark:text-gray-700">
            {"\uD83E\uDDFE"}
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Receipt Not Found
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This receipt link may have expired or is no longer available.
            If you need a copy of your receipt, please contact the store.
          </p>
          <div className="pt-4 text-xs text-gray-400 dark:text-gray-600">
            Powered by Afterroar
          </div>
        </div>
      </div>
    );
  }

  // Future: render full receipt view here
  // return <ReceiptView receipt={receipt} />;
}

export function generateMetadata() {
  return {
    title: "Receipt — Afterroar",
    robots: "noindex",
  };
}
