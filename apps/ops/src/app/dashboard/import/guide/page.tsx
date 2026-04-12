'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';

/* ------------------------------------------------------------------ */
/*  Export guides — step-by-step instructions per source POS            */
/*  These are the "how to get your data out" guides that make the       */
/*  trial migration possible without a phone call.                      */
/* ------------------------------------------------------------------ */

interface ExportStep {
  title: string;
  description: string;
  tip?: string;
}

interface SystemGuide {
  name: string;
  label: string;
  logo: string;
  estimatedTime: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  overview: string;
  inventorySteps: ExportStep[];
  customerSteps: ExportStep[];
  gotchas: string[];
  storeCreditNote: string;
}

const GUIDES: Record<string, SystemGuide> = {
  shopify: {
    name: 'shopify',
    label: 'Shopify POS',
    logo: '🛍',
    estimatedTime: '10 minutes',
    difficulty: 'Easy',
    overview: 'Shopify makes exporting easy. You\'ll export three files: products, inventory, and customers.',
    inventorySteps: [
      {
        title: 'Go to Products',
        description: 'Log into your Shopify Admin at admin.shopify.com. Click "Products" in the left sidebar.',
      },
      {
        title: 'Export Products',
        description: 'Click the "Export" button near the top right. Choose "All products" and format "CSV for Excel, Numbers, or other spreadsheet programs." Click "Export products."',
        tip: 'The file downloads immediately for most stores. If you have 50K+ products, Shopify will email it to you instead.',
      },
      {
        title: 'Export Inventory',
        description: 'Still in Products, click "Inventory" in the sub-menu. Click "Export." Choose "All inventory" and select the "All states" format (not just available). Choose all locations.',
        tip: 'The "All states" format gives us on-hand, available, committed, and incoming quantities. This is more accurate.',
      },
    ],
    customerSteps: [
      {
        title: 'Go to Customers',
        description: 'Click "Customers" in the left sidebar.',
      },
      {
        title: 'Export Customers',
        description: 'Click "Export." Choose "All customers" and CSV format. Click "Export customers."',
      },
    ],
    gotchas: [
      'Large exports (50K+ rows) are emailed to your Shopify account email — check your inbox',
      'If you track store credit via a third-party app (Rise.ai, etc.), export that separately',
      'Order history export is optional — we can import it if you need it for records',
    ],
    storeCreditNote: 'Shopify doesn\'t have native store credit. If you track credit through gift cards, a third-party app, or a spreadsheet, let us know and we\'ll help you migrate that too.',
  },

  square: {
    name: 'square',
    label: 'Square',
    logo: '⬛',
    estimatedTime: '5 minutes',
    difficulty: 'Easy',
    overview: 'Square\'s export is quick — two files and you\'re done.',
    inventorySteps: [
      {
        title: 'Go to Item Library',
        description: 'Log into Square Dashboard at squareup.com/dashboard. Click "Items & Orders" → "Items."',
      },
      {
        title: 'Export Items',
        description: 'Click the "⋯" (three dots) menu in the upper right, then "Export Library." Choose CSV format.',
        tip: 'This includes your item names, prices, SKUs, barcodes, and current quantities all in one file.',
      },
    ],
    customerSteps: [
      {
        title: 'Go to Customers',
        description: 'Click "Customers" in the left sidebar.',
      },
      {
        title: 'Export Customers',
        description: 'Click the "⋯" menu → "Export Customers." Download the CSV.',
      },
    ],
    gotchas: [
      'Square item variations may not cleanly separate TCG conditions — we\'ll help you map those',
      'If you use Square Gift Cards as store credit, export gift card balances separately',
    ],
    storeCreditNote: 'Square doesn\'t have native store credit. If you use gift cards as a proxy, we can work with that. Otherwise, bring a spreadsheet of customer credit balances.',
  },

  binderpos: {
    name: 'binderpos',
    label: 'BinderPOS',
    logo: '📦',
    estimatedTime: '15-20 minutes',
    difficulty: 'Medium',
    overview: 'BinderPOS exports are filtered by what you\'re currently viewing. You may need to export multiple times for different games or product types. That\'s totally fine — upload them all and we\'ll merge them.',
    inventorySteps: [
      {
        title: 'Go to Products',
        description: 'Log into your BinderPOS portal. Navigate to the Products section.',
      },
      {
        title: 'Search All (or by Game)',
        description: 'To export everything: leave the search blank and hit Enter/Search. To export by game: filter by "Magic: The Gathering," then export, then repeat for Pokemon, etc.',
        tip: 'Exporting by game is fine — our import wizard merges multiple files automatically.',
      },
      {
        title: 'Click "Export Search"',
        description: 'Click the Export Search button. BinderPOS will email the CSV to your store\'s main email address.',
        tip: 'This may take a few minutes. Check your inbox AND spam folder.',
      },
      {
        title: 'Download from Email',
        description: 'Open the email from BinderPOS and download the CSV attachment.',
      },
      {
        title: 'Repeat for Other Games (if needed)',
        description: 'If you exported by game, go back and repeat for each game/category you want to migrate.',
      },
    ],
    customerSteps: [
      {
        title: 'Check Customer Export Options',
        description: 'Look for a customer export option in your BinderPOS portal. If one isn\'t available, you can create a simple spreadsheet with columns: Name, Email, Phone, Store Credit Balance.',
        tip: 'If you have store credit balances in BinderPOS, this is the most important thing to get right. Double-check the numbers.',
      },
    ],
    gotchas: [
      'Exports go to your email, not a direct download — check spam if you don\'t see it',
      'You may need multiple export files (one per game/filter) — that\'s normal',
      'If your export includes TCGplayer sync settings (reserve stock, max to list), we preserve those',
      'Headers may vary between export types — our system detects and handles this',
    ],
    storeCreditNote: 'If BinderPOS tracks your customer store credit, it should be in the customer export or your internal records. This is the #1 thing to verify — every dollar must match.',
  },

  lightspeed: {
    name: 'lightspeed',
    label: 'Lightspeed',
    logo: '⚡',
    estimatedTime: '10 minutes',
    difficulty: 'Easy',
    overview: 'Lightspeed has straightforward CSV exports for products and customers.',
    inventorySteps: [
      {
        title: 'Go to Products',
        description: 'Log into your Lightspeed eCom admin. Navigate to Products.',
      },
      {
        title: 'Export Products',
        description: 'Click Export → All products → CSV format. This includes variants, prices, and stock levels.',
      },
    ],
    customerSteps: [
      {
        title: 'Go to Customers',
        description: 'Navigate to the Customers section.',
      },
      {
        title: 'Export Customers',
        description: 'Click Export → CSV. This includes customer details and credit balances.',
        tip: 'Lightspeed has native store credit — the creditBalance field maps directly to our system.',
      },
    ],
    gotchas: [
      'API access requires Advanced or Professional subscription — CSV export works on any plan',
      'Variant movements (inventory history) are only available via API',
    ],
    storeCreditNote: 'Lightspeed has native store credit (creditBalance field). This maps directly — no extra steps needed.',
  },

  clover: {
    name: 'clover',
    label: 'Clover',
    logo: '🍀',
    estimatedTime: '10 minutes',
    difficulty: 'Easy',
    overview: 'Clover\'s web dashboard supports basic CSV exports for items and customers.',
    inventorySteps: [
      {
        title: 'Go to Inventory',
        description: 'Log into your Clover web dashboard. Go to Inventory → Items.',
      },
      {
        title: 'Export Items',
        description: 'Look for an Export option (CSV). This includes item names, prices, categories, and stock counts.',
      },
    ],
    customerSteps: [
      {
        title: 'Go to Customers',
        description: 'Navigate to Customers in the dashboard.',
      },
      {
        title: 'Export Customers',
        description: 'Export as CSV if available. Clover\'s customer data may be sparse — name and contact info primarily.',
      },
    ],
    gotchas: [
      'Clover is generic retail — TCG conditions will be in item names, not separate fields',
      'Customer export may be limited depending on your Clover plan',
    ],
    storeCreditNote: 'Clover doesn\'t have native store credit. If you track credit in a spreadsheet or another system, bring that along.',
  },

  sortswift: {
    name: 'sortswift',
    label: 'SortSwift',
    logo: '🔄',
    estimatedTime: '10 minutes',
    difficulty: 'Easy',
    overview: 'SortSwift supports CSV export for inventory and customers.',
    inventorySteps: [
      {
        title: 'Export Inventory',
        description: 'Log into SortSwift. Find the inventory export option and download as CSV.',
        tip: 'SortSwift has good TCG data — conditions, sets, and buylist data should export cleanly.',
      },
    ],
    customerSteps: [
      {
        title: 'Export Customers',
        description: 'Find the customer export option and download as CSV. Include store credit balances.',
      },
    ],
    gotchas: [
      'If you use Manage Comics integration, that data may need a separate export',
    ],
    storeCreditNote: 'SortSwift tracks store credit — make sure it\'s included in your customer export.',
  },

  csv: {
    name: 'csv',
    label: 'Other / Generic CSV',
    logo: '📄',
    estimatedTime: '15-20 minutes',
    difficulty: 'Medium',
    overview: 'If your POS isn\'t listed above, you can still migrate. Export your data as a CSV (most POS systems support this) and we\'ll help you map the columns.',
    inventorySteps: [
      {
        title: 'Export from Your POS',
        description: 'Find the "Export" or "Download" option in your current POS system. Export your inventory/products as a CSV file.',
      },
      {
        title: 'Check the File',
        description: 'Open the CSV in a spreadsheet app (Excel, Google Sheets). Make sure it has columns for: product name, price, quantity, and SKU/barcode. Condition, set, and game info is a bonus.',
        tip: 'The more columns you include, the better we can map your data. Don\'t delete anything.',
      },
    ],
    customerSteps: [
      {
        title: 'Export Customers',
        description: 'Export your customer list as CSV. Must include at least name. Email, phone, and store credit balance are important if available.',
      },
    ],
    gotchas: [
      'You\'ll need to manually map columns in our wizard — takes a few extra minutes',
      'Save as CSV format (not .xlsx) — most spreadsheet apps have "Save As → CSV"',
    ],
    storeCreditNote: 'Include a "Store Credit" or "Credit Balance" column in your customer export. This is the most important number to get right.',
  },
};

const difficultyColors: Record<string, string> = {
  Easy: 'text-green-400',
  Medium: 'text-yellow-400',
  Hard: 'text-red-400',
};

export default function ExportGuidePage() {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);

  const guide = selectedSystem ? GUIDES[selectedSystem] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Export Guide"
        backHref="/dashboard/import"
        action={
          <Link
            href="/dashboard/import/new"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
          >
            Start Import
          </Link>
        }
      />

      <p className="text-muted">
        Select your current POS system below and we&apos;ll show you exactly how to export your data.
      </p>

      {/* System selector */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Object.values(GUIDES).map((sys) => (
          <button
            key={sys.name}
            onClick={() => setSelectedSystem(sys.name)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              selectedSystem === sys.name
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-input-border bg-card-hover hover:border-zinc-600'
            }`}
          >
            <div className="text-2xl">{sys.logo}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{sys.label}</div>
            <div className="mt-0.5 text-xs text-muted">~{sys.estimatedTime}</div>
          </button>
        ))}
      </div>

      {/* Selected guide */}
      {guide && (
        <div className="space-y-6">
          {/* Header */}
          <div className="rounded-xl border border-card-border bg-card p-6">
            <div className="flex items-center gap-4">
              <span className="text-4xl">{guide.logo}</span>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{guide.label}</h2>
                <div className="mt-1 flex gap-4 text-sm">
                  <span className="text-muted">Time: <span className="text-foreground">{guide.estimatedTime}</span></span>
                  <span className="text-muted">Difficulty: <span className={difficultyColors[guide.difficulty]}>{guide.difficulty}</span></span>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-foreground/70">{guide.overview}</p>
          </div>

          {/* Inventory export steps */}
          <div className="rounded-xl border border-card-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground">Export Inventory / Products</h3>
            <div className="mt-4 space-y-4">
              {guide.inventorySteps.map((step, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{step.title}</div>
                    <div className="mt-1 text-sm text-foreground/70">{step.description}</div>
                    {step.tip && (
                      <div className="mt-2 rounded bg-card-hover px-3 py-2 text-xs text-indigo-300">
                        Tip: {step.tip}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer export steps */}
          <div className="rounded-xl border border-card-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground">Export Customers</h3>
            <div className="mt-4 space-y-4">
              {guide.customerSteps.map((step, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{step.title}</div>
                    <div className="mt-1 text-sm text-foreground/70">{step.description}</div>
                    {step.tip && (
                      <div className="mt-2 rounded bg-card-hover px-3 py-2 text-xs text-indigo-300">
                        Tip: {step.tip}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Store credit note */}
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
            <h4 className="text-sm font-medium text-yellow-400">About Store Credit</h4>
            <p className="mt-1 text-sm text-foreground/70">{guide.storeCreditNote}</p>
          </div>

          {/* Gotchas */}
          {guide.gotchas.length > 0 && (
            <div className="rounded-xl border border-card-border bg-card p-6">
              <h3 className="text-sm font-medium text-muted">Things to Watch For</h3>
              <ul className="mt-3 space-y-2">
                {guide.gotchas.map((gotcha, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-foreground/70">
                    <span className="text-muted">•</span>
                    {gotcha}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="flex justify-center">
            <Link
              href="/dashboard/import/new"
              className="rounded-xl bg-green-600 px-8 py-3 text-sm font-medium text-foreground hover:bg-green-500 transition-colors"
            >
              I&apos;ve Got My Files — Start Import
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
