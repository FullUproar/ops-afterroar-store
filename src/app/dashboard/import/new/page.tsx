'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSourceSystems, INVENTORY_TARGET_FIELDS, CUSTOMER_TARGET_FIELDS } from '@/lib/import/field-maps';
import { formatCents } from '@/lib/types';
import { PageHeader } from '@/components/page-header';

/* ---------- types ---------- */
interface ImportJobResult {
  id: string;
  headers: string[];
  auto_mapping: Record<string, string>;
  transforms: Record<string, string>;
  unmapped_headers: string[];
  row_count: number;
}

interface DryRunResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  total_rows: number;
}

const sourceSystems = getSourceSystems();

/* ---------- component ---------- */
export default function NewImportPage() {
  const [step, setStep] = useState(1);

  // Step 1: source + type
  const [sourceSystem, setSourceSystem] = useState('csv');
  const [entityType, setEntityType] = useState<'inventory' | 'customers'>('inventory');

  // Step 2: file upload
  const [fileName, setFileName] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);

  // Step 3: mapping
  const [jobId, setJobId] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [transforms, setTransforms] = useState<Record<string, string>>({});

  // Step 4: dry run
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  // General
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [commitResult, setCommitResult] = useState<DryRunResult | null>(null);

  const targetFields = entityType === 'inventory' ? INVENTORY_TARGET_FIELDS : CUSTOMER_TARGET_FIELDS;

  /* ---- load sample data for demo ---- */
  async function loadSampleData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/import/samples?system=${sourceSystem}&type=${entityType}`
      );
      const text = await res.text();
      setCsvContent(text);
      setFileName(`${sourceSystem}-${entityType}-sample.csv`);
      setLoading(false);
      // Auto-proceed to upload
      await handleUploadWithContent(text, `${sourceSystem}-${entityType}-sample.csv`);
    } catch {
      setError('Failed to load sample data');
      setLoading(false);
    }
  }

  /* ---- file handler ---- */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvContent(text);
      // Quick parse for row count preview
      const lines = text.split('\n').filter((l) => l.trim());
      setCsvRows([]); // Will be parsed server-side
    };
    reader.readAsText(file);
  }

  /* ---- step 2: upload ---- */
  async function handleUpload() {
    await handleUploadWithContent(csvContent, fileName);
  }

  async function handleUploadWithContent(content: string, name: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_system: sourceSystem,
          entity_type: entityType,
          file_name: name,
          csv_content: content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (data.deduplicated) {
        setError('This file has already been imported.');
        return;
      }

      setJobId(data.id);
      setHeaders(data.headers);
      setFieldMapping(data.auto_mapping);
      setTransforms(data.transforms || {});

      // Parse CSV client-side for dry-run/commit (we need the rows)
      const Papa = await import('papaparse');
      const parsed = Papa.default.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
      });
      setCsvRows(parsed.data);

      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  /* ---- step 3→4: dry run ---- */
  async function handleDryRun() {
    setLoading(true);
    setError('');
    try {
      // Update mapping first
      await fetch(`/api/import/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_mapping: { mapping: fieldMapping, transforms, headers },
        }),
      });

      const res = await fetch(`/api/import/${jobId}/dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dry run failed');

      setDryRunResult(data);
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setLoading(false);
    }
  }

  /* ---- step 4: commit ---- */
  async function handleCommit() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/import/${jobId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Commit failed');

      setCommitResult(data);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setLoading(false);
    }
  }

  /* ---- success screen ---- */
  if (success && commitResult) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-8">
          <h2 className="text-xl font-bold text-green-400">Import Complete</h2>
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-foreground/70">
              <span className="font-medium text-green-400">{commitResult.created}</span> created
              {commitResult.updated > 0 && (
                <> · <span className="font-medium text-blue-400">{commitResult.updated}</span> updated</>
              )}
              {commitResult.skipped > 0 && (
                <> · <span className="font-medium text-muted">{commitResult.skipped}</span> skipped</>
              )}
              {commitResult.errors.length > 0 && (
                <> · <span className="font-medium text-red-400">{commitResult.errors.length}</span> errors</>
              )}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/import"
          className="inline-block rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground hover:bg-card-hover transition-colors"
        >
          Back to Imports
        </Link>
      </div>
    );
  }

  /* ---- render ---- */
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New Import" backHref="/dashboard/import" />

      {/* progress */}
      <div className="flex gap-2 text-sm">
        {['Source', 'Upload', 'Map Fields', 'Review & Import'].map((label, idx) => (
          <div
            key={label}
            className={`flex-1 rounded-full py-1 text-center font-medium transition-colors ${
              idx + 1 === step
                ? 'bg-accent text-foreground'
                : idx + 1 < step
                  ? 'bg-accent/30 text-indigo-300'
                  : 'bg-card-hover text-muted'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ============ STEP 1: SOURCE ============ */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Select Source System</h2>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sourceSystems.map((sys) => (
              <button
                key={sys.name}
                onClick={() => setSourceSystem(sys.name)}
                className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                  sourceSystem === sys.name
                    ? 'border-indigo-500 bg-indigo-500/10 text-foreground'
                    : 'border-input-border bg-card-hover text-foreground/70 hover:border-zinc-600'
                }`}
              >
                {sys.label}
              </button>
            ))}
          </div>

          <h2 className="mt-6 text-lg font-semibold text-foreground">What are you importing?</h2>
          <div className="flex gap-2">
            {(['inventory', 'customers'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setEntityType(t)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize transition-colors ${
                  entityType === t
                    ? 'bg-accent text-foreground'
                    : 'bg-card-hover text-muted hover:bg-card-hover'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="rounded-xl bg-accent px-6 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors"
            >
              Next: Upload File
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 2: UPLOAD ============ */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Upload CSV File</h2>
          <p className="text-sm text-muted">
            Export your {entityType} from {sourceSystems.find((s) => s.name === sourceSystem)?.label ?? sourceSystem} as a CSV file and upload it here.
          </p>

          <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-input-border bg-card-hover p-8 transition-colors hover:border-indigo-500/50">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            {fileName ? (
              <div className="text-center">
                <div className="font-medium text-foreground">{fileName}</div>
                <div className="mt-1 text-sm text-muted">Click to change file</div>
              </div>
            ) : (
              <div className="text-center text-muted">
                <div className="text-lg">Drop your CSV here or click to browse</div>
                <div className="mt-1 text-sm">Supports .csv, .tsv, .txt</div>
              </div>
            )}
          </label>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
            >
              Back
            </button>
            <div className="flex gap-3">
              <button
                onClick={loadSampleData}
                disabled={loading}
                className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 hover:opacity-90/20 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : 'Try With Sample Data'}
              </button>
              <button
                onClick={handleUpload}
                disabled={!csvContent || loading}
                className="rounded-xl bg-accent px-6 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Processing...' : 'Upload & Map'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 3: FIELD MAPPING ============ */}
      {step === 3 && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Map Fields</h2>
          <p className="text-sm text-muted">
            Match your CSV columns to Afterroar fields. We&apos;ve auto-mapped what we could.
          </p>

          <div className="space-y-2">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-3">
                <div className="w-1/3 truncate rounded bg-card-hover px-3 py-2 text-sm text-foreground/70">
                  {header}
                </div>
                <span className="text-muted">→</span>
                <select
                  value={fieldMapping[header] ?? ''}
                  onChange={(e) => {
                    setFieldMapping((prev) => ({
                      ...prev,
                      [header]: e.target.value,
                    }));
                  }}
                  className="flex-1 rounded-xl border border-input-border bg-card-hover px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">— Skip —</option>
                  {targetFields.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleDryRun}
              disabled={loading}
              className="rounded-xl bg-accent px-6 py-2 text-sm font-medium text-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Running...' : 'Preview Import'}
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 4: DRY RUN & COMMIT ============ */}
      {step === 4 && dryRunResult && (
        <div className="space-y-4 rounded-xl border border-card-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Import Preview</h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-input-border bg-card-hover p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{dryRunResult.created}</div>
              <div className="text-xs text-muted">Will Create</div>
            </div>
            <div className="rounded-xl border border-input-border bg-card-hover p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{dryRunResult.updated}</div>
              <div className="text-xs text-muted">Will Update</div>
            </div>
            <div className="rounded-xl border border-input-border bg-card-hover p-4 text-center">
              <div className="text-2xl font-bold text-muted">{dryRunResult.skipped}</div>
              <div className="text-xs text-muted">Skipped</div>
            </div>
            <div className="rounded-xl border border-input-border bg-card-hover p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{dryRunResult.errors.length}</div>
              <div className="text-xs text-muted">Errors</div>
            </div>
          </div>

          {dryRunResult.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-red-500/20 bg-red-500/5 p-4 scroll-visible">
              <h3 className="text-sm font-medium text-red-400">Errors</h3>
              <ul className="mt-2 space-y-1 text-xs text-red-300">
                {dryRunResult.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>Row {err.row}: {err.message}</li>
                ))}
                {dryRunResult.errors.length > 20 && (
                  <li className="text-muted">...and {dryRunResult.errors.length - 20} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(3)}
              className="rounded-xl bg-card-hover px-4 py-2 text-sm text-foreground/70 hover:bg-card-hover transition-colors"
            >
              Back to Mapping
            </button>
            <button
              onClick={handleCommit}
              disabled={loading}
              className="rounded-xl bg-green-600 px-6 py-2 text-sm font-medium text-foreground hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Importing...' : `Import ${dryRunResult.created + dryRunResult.updated} Records`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
