"use client";

import { useState, useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

const TEST_BARCODES = [
  { name: "MTG Foundations Play Booster Box", upc: "195166253602" },
  { name: "Pokemon Prismatic Evolutions ETB", upc: "820650853517" },
  { name: "Lorcana Shimmering Skies Booster Box", upc: "4050368983862" },
  { name: "Wingspan (Board Game)", upc: "644216627721" },
  { name: "Catan (Board Game)", upc: "029877030712" },
  { name: "Ticket to Ride", upc: "824968717912" },
  { name: "Drip Coffee", upc: "000000000001" },
  { name: "Monster Energy", upc: "070847811169" },
  { name: "Dragon Shield Matte Sleeves", upc: "5706569100056" },
  { name: "Ultra Pro Eclipse Sleeves", upc: "074427152642" },
];

function BarcodeImage({ upc, width = 2, height = 60 }: { upc: string; width?: number; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      // Use CODE128 which supports any length
      JsBarcode(svgRef.current, upc, {
        format: "CODE128",
        width,
        height,
        displayValue: false,
        margin: 4,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // Fallback: just show the number
    }
  }, [upc, width, height]);

  return <svg ref={svgRef} />;
}

interface SeedResult {
  name: string;
  upc: string;
  matched: boolean;
  updated: boolean;
  inventoryName?: string;
}

export default function TestBarcodesPage() {
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SeedResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/test-barcodes/seed", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black print-barcodes">
      <div className="text-center py-8 border-b-2 border-black">
        <h1 className="text-2xl font-bold tracking-tight">Afterroar Store Ops</h1>
        <p className="text-lg text-gray-600 mt-1">Test Barcodes</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-6 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing..." : "Sync to Inventory"}
          </button>
          <p className="text-sm text-gray-500">
            Adds these UPC barcodes to matching inventory items in your store.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {results && (
          <div className="mt-4 space-y-1">
            <div className="text-sm font-semibold text-gray-700">Sync Results:</div>
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${
                  r.updated ? "bg-green-50 text-green-800" : r.matched ? "bg-yellow-50 text-yellow-800" : "bg-gray-50 text-gray-500"
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${r.updated ? "bg-green-500" : r.matched ? "bg-yellow-500" : "bg-gray-300"}`} />
                <span className="font-mono text-xs">{r.upc}</span>
                <span>{r.name}</span>
                {r.updated && r.inventoryName && <span className="text-green-600">{" -> "}{r.inventoryName}</span>}
                {!r.matched && <span className="text-gray-400 italic">no match</span>}
                {r.matched && !r.updated && <span className="text-yellow-600 italic">already set</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 gap-4 print:gap-3">
          {TEST_BARCODES.map((item) => (
            <div
              key={item.upc}
              className="border-2 border-black rounded-lg p-4 print:p-3 flex flex-col items-center justify-center text-center break-inside-avoid"
            >
              <div className="text-sm font-semibold mb-2 leading-tight">{item.name}</div>
              <BarcodeImage upc={item.upc} width={2} height={50} />
              <div className="mt-1 text-lg font-mono font-bold tracking-[0.1em] select-all">{item.upc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center py-6 border-t border-gray-300 text-sm text-gray-500 print:text-gray-700">
        Print this page and keep near your POS terminal for testing.
      </div>

      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
