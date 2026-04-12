"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";

const SCANNER_MODELS = [
  {
    group: "A",
    models: ["BCST-70", "BCST-40", "BCST-41", "BCST-42 (Yellow)"],
    steps: [
      'Scan the "Enter Setup" barcode from your manual',
      'Scan the "Bluetooth Mode (HID)" barcode',
      "Open Bluetooth settings on your device",
      "Find your Inateck scanner and tap to pair",
      "Scanner beeps on successful connection",
    ],
    manuals: [
      { model: "BCST-70", url: "https://www.inateckoffice.com/pages/bcst-70-barcode-scanner-support-page" },
    ],
  },
  {
    group: "B",
    models: ["BCST-54", "BCST-55", "BCST-73", "BCST-71", "BCST-42 (Green)", "BCST-43", "P7"],
    steps: [
      'Scan the "Enter to Setup" barcode from your manual',
      'Scan the "Bluetooth Pairing (HID)" barcode',
      'Scan the "Exit and Save" barcode',
      "Open Bluetooth settings on your device",
      "Find your Inateck scanner and tap to pair",
    ],
    manuals: [
      { model: "BCST-73", url: "https://www.inateckoffice.com/pages/bcst-73-barcode-scanner-support-page" },
      { model: "BCST-54", url: "http://files.inateck.com/BCST-54_Complete%20Manual_EN.pdf" },
      { model: "BCST-43", url: "https://files.inateck.com/BCST-43_Complete%20Manual_EN.pdf" },
    ],
  },
  {
    group: "C",
    models: ["BCST-50", "BCST-52"],
    steps: [
      'Scan the "Bluetooth Mode (HID)" barcode',
      'Scan the "Match" barcode',
      "LED flashes blue and green alternately during pairing",
      "Open Bluetooth settings on your device and pair",
    ],
    manuals: [
      { model: "BCST-50", url: "https://files.inateck.com/BCST-50%20manual-V23.pdf" },
    ],
  },
];

export default function ScannerSetupPage() {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Scanner Setup" backHref="/dashboard/settings" />

      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Quick Start</h2>
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>
              Afterroar Store Ops works with any USB or Bluetooth barcode scanner that acts as a keyboard (HID mode).
              No special drivers needed — just pair and scan.
            </p>
            <div className="rounded-lg border border-accent/20 bg-accent-light p-3">
              <p className="text-xs font-medium text-accent">How it works</p>
              <p className="mt-1 text-xs">
                The scanner types the barcode number as keystrokes, just like a keyboard.
                The register detects the rapid input (faster than human typing) and automatically
                searches your inventory. If there&apos;s a match, the item is added to the cart instantly.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">USB Scanner</h2>
          <p className="mt-1 text-xs text-muted">Plug and play — no setup needed.</p>
          <ol className="mt-3 space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">1</span>
              <span>Plug the USB scanner into your device</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">2</span>
              <span>Open the Register page</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">3</span>
              <span>Scan any barcode — the green dot in the header means &quot;listening&quot;</span>
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Bluetooth Scanner (Inateck)</h2>
          <p className="mt-1 text-xs text-muted">
            Find your model below for pairing instructions. Check the label on the bottom of your scanner.
          </p>

          <div className="mt-4 space-y-3">
            {SCANNER_MODELS.map((group) => (
              <div key={group.group} className="rounded-lg border border-card-border">
                <button
                  onClick={() => setSelectedGroup(selectedGroup === group.group ? null : group.group)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-card-hover transition-colors rounded-lg"
                >
                  <span>{group.models.join(", ")}</span>
                  <span className="text-muted">{selectedGroup === group.group ? "−" : "+"}</span>
                </button>

                {selectedGroup === group.group && (
                  <div className="border-t border-card-border px-4 py-3 space-y-3">
                    <ol className="space-y-2 text-sm">
                      {group.steps.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="pt-2 border-t border-card-border">
                      <p className="text-xs text-muted mb-2">Setup barcodes are in your scanner&apos;s manual:</p>
                      <div className="flex flex-wrap gap-2">
                        {group.manuals.map((m) => (
                          <a
                            key={m.model}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-accent hover:bg-card-hover transition-colors"
                          >
                            {m.model} Manual
                            <span className="text-muted">&nearr;</span>
                          </a>
                        ))}
                        <a
                          href="https://www.inateckoffice.com/pages/downloads"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-card-hover transition-colors"
                        >
                          All Inateck Downloads
                          <span>&nearr;</span>
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Other Scanners</h2>
          <p className="mt-1 text-xs text-muted">
            Any scanner that works in HID (keyboard) mode will work with Afterroar. This includes:
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>• Zebra / Symbol scanners</li>
            <li>• Honeywell Voyager / Xenon</li>
            <li>• Socket Mobile</li>
            <li>• Any USB HID barcode scanner</li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            Make sure the scanner is set to HID/Keyboard mode (not serial/SPP mode).
            Most scanners default to HID mode out of the box.
          </p>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Troubleshooting</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-medium text-foreground">Scanner beeps but nothing happens</p>
              <p className="text-xs text-muted mt-0.5">
                Make sure you&apos;re on the Register page and the green dot is showing (scanner listening).
                Try clicking anywhere on the page first, then scan.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Item not found after scanning</p>
              <p className="text-xs text-muted mt-0.5">
                The barcode might not match any item in your inventory. The scanned code will appear
                in the search bar so you can see what was scanned. Add the barcode to the item in Inventory.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Scanner types in the wrong field</p>
              <p className="text-xs text-muted mt-0.5">
                The register has a hidden input that captures scanner input. If you&apos;re typing in a
                visible field (like search), the scanner will type there instead. Tap away from the field
                first, then scan.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Bluetooth keeps disconnecting</p>
              <p className="text-xs text-muted mt-0.5">
                Most Bluetooth scanners have a sleep/power-save mode. Scan any barcode to wake it up.
                Check your scanner&apos;s manual for auto-sleep settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
