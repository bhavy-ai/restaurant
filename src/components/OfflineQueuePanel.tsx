'use client';

import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { QueueItem, ConflictResolutionStrategy, offlineQueue } from '@/lib/offlineQueue';
import { NetworkStatus } from '@/hooks/useNetworkStatus';

interface OfflineQueuePanelProps {
  networkStatus: NetworkStatus;
}

const operationLabels: Record<string, string> = {
  order_create: 'Create Order',
  order_add_items: 'Add Items to Order',
  order_update_totals: 'Update Order Totals',
  order_update_status: 'Update Order Status',
  takeaway_create: 'Create Takeaway Order',
  takeaway_cancel: 'Cancel Takeaway Order',
  kot_create: 'Create KOT',
  kot_void: 'Void KOT',
  table_seat: 'Seat Table',
  table_request_bill: 'Request Bill',
  table_mark_cleaning: 'Mark Table Cleaning',
  table_mark_available: 'Mark Table Available',
  table_assign_captain: 'Assign Captain',
  inventory_adjust: 'Inventory Adjustment',
  bill_create: 'Create Bill',
};

const statusConfig = {
  pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  syncing: { label: 'Syncing…', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  synced: { label: 'Synced', color: 'text-accent', bg: 'bg-accent/10 border-accent/30' },
  failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  conflict: { label: 'Conflict', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
};

function QueueItemRow({ item, onResolve, onDismiss }: {
  item: QueueItem;
  onResolve: (id: string, strategy: ConflictResolutionStrategy) => void;
  onDismiss: (id: string) => void;
}) {
  const cfg = statusConfig[item.status];
  const label = operationLabels[item.type] || item.type;
  const time = new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${cfg.bg}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground truncate">{label}</span>
          <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
        </div>
        <div className="text-muted-foreground mt-0.5">{time} · Attempt {item.attemptCount + 1}</div>
        {item.error && (
          <div className="text-red-400 mt-0.5 truncate" title={item.error}>{item.error}</div>
        )}
      </div>

      {item.status === 'conflict' && (
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => onResolve(item.id, 'client_wins')}
            className="px-2 py-0.5 bg-primary/20 border border-primary/40 text-primary rounded text-[10px] font-semibold hover:bg-primary/30 transition-colors"
            title="Keep local change"
          >
            Keep Mine
          </button>
          <button
            onClick={() => onResolve(item.id, 'server_wins')}
            className="px-2 py-0.5 bg-secondary border border-border text-muted-foreground rounded text-[10px] font-semibold hover:text-foreground transition-colors"
            title="Discard local change"
          >
            Discard
          </button>
        </div>
      )}

      {(item.status === 'failed' || item.status === 'synced') && (
        <button
          onClick={() => onDismiss(item.id)}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

export default function OfflineQueuePanel({ networkStatus }: OfflineQueuePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const { isOnline, pendingCount, queueItems, isSyncing, lastSyncResult, triggerSync } = networkStatus;

  const activeItems = queueItems.filter((i) => i.status !== 'synced');
  const hasIssues = activeItems.some((i) => i.status === 'failed' || i.status === 'conflict');

  async function handleResolve(id: string, strategy: ConflictResolutionStrategy) {
    await offlineQueue.resolveConflict(id, strategy);
    if (isOnline) triggerSync();
  }

  async function handleDismiss(id: string) {
    await offlineQueue.dismiss(id);
  }

  // Don't render if online and nothing queued
  if (isOnline && pendingCount === 0 && activeItems.length === 0 && !lastSyncResult) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 shadow-2xl rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/50 transition-colors"
      >
        <div className={`w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${
          isOnline ? 'bg-accent/15' : 'bg-red-500/15'
        }`}>
          {isSyncing ? (
            <Loader2 size={13} className="text-blue-400 animate-spin" />
          ) : isOnline ? (
            <Wifi size={13} className="text-accent" />
          ) : (
            <WifiOff size={13} className="text-red-400" />
          )}
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="text-xs font-semibold text-foreground leading-tight">
            {isSyncing
              ? 'Syncing changes…'
              : isOnline
              ? pendingCount > 0
                ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync`
                : lastSyncResult
                ? `Synced ${lastSyncResult.synced} change${lastSyncResult.synced !== 1 ? 's' : ''}`
                : 'Online'
              : `Offline — ${pendingCount} queued`}
          </div>
          {hasIssues && (
            <div className="text-[10px] text-orange-400 flex items-center gap-1">
              <AlertTriangle size={9} />
              Conflicts need resolution
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isOnline && pendingCount > 0 && !isSyncing && (
            <button
              onClick={(e) => { e.stopPropagation(); triggerSync(); }}
              className="w-6 h-6 flex items-center justify-center rounded bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors"
              title="Sync now"
            >
              <RefreshCw size={11} />
            </button>
          )}
          {expanded ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronUp size={13} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded queue list */}
      {expanded && (
        <div className="border-t border-border">
          {activeItems.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-4 text-muted-foreground">
              <CheckCircle size={18} className="text-accent" />
              <span className="text-xs">All changes synced</span>
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto p-2 flex flex-col gap-1.5">
              {activeItems.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onResolve={handleResolve}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          )}

          {lastSyncResult && (
            <div className="px-3 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1 text-accent"><CheckCircle size={10} />{lastSyncResult.synced} synced</span>
              {lastSyncResult.failed > 0 && <span className="flex items-center gap-1 text-red-400"><X size={10} />{lastSyncResult.failed} failed</span>}
              {lastSyncResult.conflicts > 0 && <span className="flex items-center gap-1 text-orange-400"><AlertTriangle size={10} />{lastSyncResult.conflicts} conflicts</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
