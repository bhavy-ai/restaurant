'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle, X, Clock, Wifi, WifiOff,
  ChevronDown, ChevronUp, Loader2, RotateCcw, ShieldAlert, ListChecks,
} from 'lucide-react';
import { offlineQueue, QueueItem, ConflictResolutionStrategy } from '@/lib/offlineQueue';

const operationLabels: Record<string, string> = {
  order_create: 'Create Order',
  order_add_items: 'Add Items to Order',
  order_update_totals: 'Update Order Totals',
  order_update_status: 'Update Order Status',
  table_seat: 'Seat Table',
  table_request_bill: 'Request Bill',
  table_mark_cleaning: 'Mark Table Cleaning',
  table_mark_available: 'Mark Table Available',
  table_assign_captain: 'Assign Captain',
  inventory_adjust: 'Inventory Adjustment',
  bill_create: 'Create Bill',
};

interface SyncStatusPanelProps {
  isOnline: boolean;
  isSyncing: boolean;
  triggerSync: () => void;
}

interface SyncCounts {
  queued: number;
  failed: number;
  conflicts: number;
  synced: number;
}

export default function SyncStatusPanel({ isOnline, isSyncing, triggerSync }: SyncStatusPanelProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<SyncCounts>({ queued: 0, failed: 0, conflicts: 0, synced: 0 });
  const [activeTab, setActiveTab] = useState<'queued' | 'failed' | 'conflicts'>('queued');
  const [expanded, setExpanded] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const refreshItems = useCallback(async () => {
    const all = await offlineQueue.getAll();
    setItems(all);
    setCounts({
      queued: all.filter((i) => i.status === 'pending' || i.status === 'syncing').length,
      failed: all.filter((i) => i.status === 'failed').length,
      conflicts: all.filter((i) => i.status === 'conflict').length,
      synced: all.filter((i) => i.status === 'synced').length,
    });
  }, []);

  useEffect(() => {
    refreshItems();
    const unsub = offlineQueue.subscribe((updatedItems) => {
      setItems(updatedItems);
      setCounts({
        queued: updatedItems.filter((i) => i.status === 'pending' || i.status === 'syncing').length,
        failed: updatedItems.filter((i) => i.status === 'failed').length,
        conflicts: updatedItems.filter((i) => i.status === 'conflict').length,
        synced: updatedItems.filter((i) => i.status === 'synced').length,
      });
    });
    return unsub;
  }, [refreshItems]);

  // Auto-switch tab to most urgent
  useEffect(() => {
    if (counts.conflicts > 0) setActiveTab('conflicts');
    else if (counts.failed > 0) setActiveTab('failed');
    else setActiveTab('queued');
  }, [counts.conflicts, counts.failed]);

  const filteredItems = items.filter((i) => {
    if (activeTab === 'queued') return i.status === 'pending' || i.status === 'syncing';
    if (activeTab === 'failed') return i.status === 'failed';
    if (activeTab === 'conflicts') return i.status === 'conflict';
    return false;
  });

  async function handleRetry(id: string) {
    setRetryingId(id);
    const all = await offlineQueue.getAll();
    const item = all.find((i) => i.id === id);
    if (item) {
      await offlineQueue.resolveConflict(id, 'client_wins'); // re-queue as pending
      if (isOnline) triggerSync();
    }
    setRetryingId(null);
  }

  async function handleRetryAll() {
    const failed = items.filter((i) => i.status === 'failed');
    for (const item of failed) {
      await offlineQueue.resolveConflict(item.id, 'client_wins');
    }
    if (isOnline) triggerSync();
  }

  async function handleResolve(id: string, strategy: ConflictResolutionStrategy) {
    await offlineQueue.resolveConflict(id, strategy);
    if (isOnline) triggerSync();
  }

  async function handleDismiss(id: string) {
    await offlineQueue.dismiss(id);
  }

  async function handleDismissAll() {
    const failed = items.filter((i) => i.status === 'failed');
    for (const item of failed) {
      await offlineQueue.dismiss(item.id);
    }
  }

  const totalIssues = counts.failed + counts.conflicts;
  const hasActivity = counts.queued + counts.failed + counts.conflicts + counts.synced > 0;

  const statusBadge = () => {
    if (!isOnline) return { label: 'Offline', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: <WifiOff size={12} /> };
    if (isSyncing) return { label: 'Syncing…', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: <Loader2 size={12} className="animate-spin" /> };
    if (counts.conflicts > 0) return { label: 'Conflicts', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', icon: <ShieldAlert size={12} /> };
    if (counts.failed > 0) return { label: 'Errors', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: <AlertTriangle size={12} /> };
    if (counts.queued > 0) return { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: <Clock size={12} /> };
    return { label: 'All Synced', color: 'text-accent', bg: 'bg-accent/10 border-accent/30', icon: <CheckCircle size={12} /> };
  };

  const badge = statusBadge();

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* ── Panel Header ── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
            <ListChecks size={16} className="text-muted-foreground" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-foreground">Sync Status</h3>
            <p className="text-xs text-muted-foreground">Offline queue &amp; conflict resolution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${badge.bg} ${badge.color}`}>
            {badge.icon}
            {badge.label}
          </span>
          {expanded ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* ── Summary Stat Tiles ── */}
          <div className="grid grid-cols-4 gap-0 border-t border-border divide-x divide-border">
            {[
              { key: 'queued', label: 'Queued', count: counts.queued, color: 'text-amber-400', icon: <Clock size={14} /> },
              { key: 'failed', label: 'Failed', count: counts.failed, color: 'text-red-400', icon: <AlertTriangle size={14} /> },
              { key: 'conflicts', label: 'Conflicts', count: counts.conflicts, color: 'text-orange-400', icon: <ShieldAlert size={14} /> },
              { key: 'synced', label: 'Synced', count: counts.synced, color: 'text-accent', icon: <CheckCircle size={14} /> },
            ].map((stat) => (
              <div
                key={stat.key}
                className={`flex flex-col items-center py-3 px-2 ${stat.key !== 'synced' ? 'cursor-pointer hover:bg-secondary/40 transition-colors' : ''} ${activeTab === stat.key ? 'bg-secondary/50' : ''}`}
                onClick={() => stat.key !== 'synced' && setActiveTab(stat.key as any)}
              >
                <span className={`${stat.color} mb-1`}>{stat.icon}</span>
                <span className={`text-lg font-bold font-mono tabular-nums ${stat.count > 0 ? stat.color : 'text-muted-foreground'}`}>{stat.count}</span>
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* ── Tab Bar + Actions ── */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-secondary/20">
            <div className="flex gap-1 p-0.5 bg-secondary rounded-lg">
              {(['queued', 'failed', 'conflicts'] as const).map((tab) => {
                const tabCount = tab === 'queued' ? counts.queued : tab === 'failed' ? counts.failed : counts.conflicts;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize flex items-center gap-1.5 ${activeTab === tab ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {tab}
                    {tabCount > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-border text-muted-foreground'}`}>
                        {tabCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              {activeTab === 'failed' && counts.failed > 0 && (
                <>
                  <button
                    onClick={handleRetryAll}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/15 border border-primary/30 text-primary rounded-lg text-xs font-semibold hover:bg-primary/25 transition-colors"
                  >
                    <RotateCcw size={11} />
                    Retry All
                  </button>
                  <button
                    onClick={handleDismissAll}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-secondary border border-border text-muted-foreground rounded-lg text-xs font-semibold hover:text-foreground transition-colors"
                  >
                    <X size={11} />
                    Dismiss All
                  </button>
                </>
              )}
              {isOnline && counts.queued > 0 && !isSyncing && (
                <button
                  onClick={triggerSync}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-accent/15 border border-accent/30 text-accent rounded-lg text-xs font-semibold hover:bg-accent/25 transition-colors"
                >
                  <RefreshCw size={11} />
                  Sync Now
                </button>
              )}
              {isSyncing && (
                <span className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold">
                  <Loader2 size={11} className="animate-spin" />
                  Syncing…
                </span>
              )}
            </div>
          </div>

          {/* ── Item List ── */}
          <div className="border-t border-border">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <CheckCircle size={22} className="text-accent/60" />
                <p className="text-xs font-medium">
                  {activeTab === 'queued' ? 'No pending operations' : activeTab === 'failed' ? 'No failed syncs' : 'No conflicts to resolve'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 max-h-64 overflow-y-auto scrollbar-thin">
                {filteredItems.map((item) => (
                  <SyncItemRow
                    key={item.id}
                    item={item}
                    isRetrying={retryingId === item.id}
                    onRetry={handleRetry}
                    onResolve={handleResolve}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Footer status bar ── */}
          {!isOnline && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-red-500/5">
              <WifiOff size={12} className="text-red-400 flex-shrink-0" />
              <p className="text-[11px] text-red-400 font-medium">
                You're offline. Operations are queued locally and will sync automatically when connection is restored.
              </p>
            </div>
          )}
          {isOnline && totalIssues === 0 && counts.queued === 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-accent/5">
              <Wifi size={12} className="text-accent flex-shrink-0" />
              <p className="text-[11px] text-accent font-medium">All operations synced with server.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SyncItemRow({
  item, isRetrying, onRetry, onResolve, onDismiss,
}: {
  item: QueueItem;
  isRetrying: boolean;
  onRetry: (id: string) => void;
  onResolve: (id: string, strategy: ConflictResolutionStrategy) => void;
  onDismiss: (id: string) => void;
}) {
  const label = operationLabels[item.type] || item.type;
  const time = new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const statusStyles: Record<string, { dot: string; text: string }> = {
    pending: { dot: 'bg-amber-400', text: 'text-amber-400' },
    syncing: { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400' },
    failed: { dot: 'bg-red-400', text: 'text-red-400' },
    conflict: { dot: 'bg-orange-400', text: 'text-orange-400' },
    synced: { dot: 'bg-accent', text: 'text-accent' },
  };

  const style = statusStyles[item.status] || statusStyles.pending;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <span className={`text-[10px] font-medium ${style.text}`}>
            {item.status === 'syncing' ? 'Syncing…' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{time}</span>
          {item.attemptCount > 0 && (
            <span className="text-[10px] text-muted-foreground">· {item.attemptCount} attempt{item.attemptCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        {item.error && (
          <p className="text-[10px] text-red-400 mt-0.5 truncate" title={item.error}>{item.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {item.status === 'failed' && (
          <>
            <button
              onClick={() => onRetry(item.id)}
              disabled={isRetrying}
              className="flex items-center gap-1 px-2 py-1 bg-primary/15 border border-primary/30 text-primary rounded-lg text-[10px] font-semibold hover:bg-primary/25 transition-colors disabled:opacity-50"
              title="Retry this operation"
            >
              {isRetrying ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />}
              Retry
            </button>
            <button
              onClick={() => onDismiss(item.id)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Dismiss"
            >
              <X size={11} />
            </button>
          </>
        )}

        {item.status === 'conflict' && (
          <>
            <button
              onClick={() => onResolve(item.id, 'client_wins')}
              className="px-2 py-1 bg-primary/15 border border-primary/30 text-primary rounded-lg text-[10px] font-semibold hover:bg-primary/25 transition-colors"
              title="Keep your local change"
            >
              Keep Mine
            </button>
            <button
              onClick={() => onResolve(item.id, 'server_wins')}
              className="px-2 py-1 bg-secondary border border-border text-muted-foreground rounded-lg text-[10px] font-semibold hover:text-foreground transition-colors"
              title="Discard local change, use server version"
            >
              Discard
            </button>
          </>
        )}

        {item.status === 'pending' && (
          <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
            <Clock size={9} />
            Queued
          </span>
        )}

        {item.status === 'syncing' && (
          <Loader2 size={13} className="text-blue-400 animate-spin" />
        )}
      </div>
    </div>
  );
}
