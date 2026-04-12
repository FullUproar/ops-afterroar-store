'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import { PageHeader } from '@/components/page-header';

interface Location {
  id: string;
  name: string;
  code: string | null;
  type: string;
  address: Record<string, string> | null;
  phone: string | null;
  active: boolean;
  is_default: boolean;
}

export default function LocationsPage() {
  const { can } = useStore();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('store');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/locations')
      .then((r) => r.json())
      .then((d) => setLocations(d))
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code: code.trim() || undefined, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLocations((prev) => [...prev, data]);
      setShowCreate(false);
      setName('');
      setCode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  if (!can('store.settings')) {
    return <div className="flex min-h-[50vh] items-center justify-center"><p className="text-muted">Owner access required.</p></div>;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader
        title="Locations"
        action={
          <button onClick={() => setShowCreate(!showCreate)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-foreground hover:opacity-90 transition-colors">
            {showCreate ? 'Cancel' : 'Add Location'}
          </button>
        }
      />
      <p className="-mt-4 text-sm text-muted">Manage your store locations, warehouses, and display areas.</p>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {showCreate && (
        <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <input type="text" placeholder="Location name *" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="col-span-2 rounded-xl border border-input-border bg-card-hover px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
            <input type="text" placeholder="Code (e.g. MSP)" value={code} onChange={(e) => setCode(e.target.value)}
              className="rounded-xl border border-input-border bg-card-hover px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="rounded-xl border border-input-border bg-card-hover px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none">
            <option value="store">Store</option>
            <option value="warehouse">Warehouse</option>
            <option value="display">Display Case</option>
            <option value="online">Online Fulfillment</option>
          </select>
          <button onClick={handleCreate} disabled={!name.trim() || saving}
            className="rounded-xl bg-green-600 px-6 py-2 text-sm font-medium text-foreground hover:bg-green-500 disabled:opacity-50 transition-colors">
            {saving ? 'Creating...' : 'Create Location'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center text-muted">
          No locations yet. Add your first store location to enable multi-location inventory.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <div key={loc.id} className="rounded-xl border border-card-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-foreground">{loc.name}</div>
                  {loc.code && <div className="text-xs text-muted">{loc.code}</div>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  loc.type === 'store' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                  loc.type === 'warehouse' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                  'bg-zinc-500/20 text-muted border border-zinc-500/30'
                }`}>
                  {loc.type}
                </span>
              </div>
              {loc.is_default && <div className="mt-2 text-xs text-green-400">Default location</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
