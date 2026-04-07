'use client';

import { useNetworkStatus, type ConnectionState } from '@/lib/use-network-status';

const STATUS_CONFIG: Record<
  ConnectionState,
  { dot: string; bg: string; label: string }
> = {
  online: {
    dot: 'bg-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    label: 'Online',
  },
  offline: {
    dot: 'bg-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    label: 'Offline',
  },
  syncing: {
    dot: 'bg-blue-400 animate-pulse',
    bg: 'bg-blue-500/10 border-blue-500/20',
    label: 'Syncing',
  },
  degraded: {
    dot: 'bg-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    label: 'Cash Only Mode',
  },
};

export function NetworkStatusBar() {
  const status = useNetworkStatus();
  const config = STATUS_CONFIG[status.state];

  // Don't show anything when fully online with no issues
  if (status.state === 'online' && status.cacheReady && status.failedTxCount === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs ${config.bg}`}>
      {/* Status dot */}
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />

      {/* Main status */}
      <span className="font-medium text-zinc-200">{config.label}</span>

      {/* Context details */}
      {status.state === 'offline' && (
        <span className="text-muted">
          Sales will queue locally
          {status.pendingTxCount > 0 && ` · ${status.pendingTxCount} pending`}
        </span>
      )}

      {status.state === 'syncing' && (
        <span className="text-muted">
          {status.pendingTxCount} transaction{status.pendingTxCount !== 1 ? 's' : ''} syncing...
        </span>
      )}

      {status.state === 'degraded' && (
        <span className="text-muted">
          Offline &gt;1hr · Cash payments only · {status.offlineMinutes}m
        </span>
      )}

      {/* Failed transactions alert */}
      {status.failedTxCount > 0 && (
        <a href="/dashboard/ops-log" className="ml-auto text-red-400 hover:text-red-300 hover:underline transition-colors">
          {status.failedTxCount} failed — review
        </a>
      )}

      {/* Cache not ready warning */}
      {!status.cacheReady && status.state === 'online' && (
        <span className="text-yellow-400">
          Building offline cache...
        </span>
      )}
    </div>
  );
}

/** Compact version for the sidebar */
export function NetworkDot() {
  const status = useNetworkStatus();
  const config = STATUS_CONFIG[status.state];

  return (
    <div className="flex items-center gap-2" title={config.label}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {status.state !== 'online' && (
        <span className="text-xs text-muted">{config.label}</span>
      )}
      {status.pendingTxCount > 0 && (
        <span className="text-xs tabular-nums text-yellow-400">
          {status.pendingTxCount}
        </span>
      )}
    </div>
  );
}
