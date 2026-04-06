'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Flame, Clock, CheckCircle, AlertTriangle, RefreshCw, Bell, Zap, X, ChefHat, Loader2, CheckSquare, Square } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { kotService } from '@/lib/services/restaurantService';

interface KOTItem {
  id: string;
  name: string;
  qty: number;
  note?: string;
  isVeg: boolean;
  fulfilledQty?: number;
}

interface KOT {
  id: string;
  kotNumber: string;
  tableLabel: string;
  orderType: 'dine-in' | 'takeaway' | 'delivery';
  station: string;
  items: KOTItem[];
  fireTime: string;
  status: 'pending' | 'acknowledged' | 'preparing' | 'ready';
  priority: 'normal' | 'rush';
  steward: string;
  covers: number;
}

const stations = ['All', 'Main Kitchen', 'Grill', 'Beverages', 'Desserts'];

function getElapsedMinutes(fireTime: string): number {
  return Math.floor((Date.now() - new Date(fireTime).getTime()) / 60000);
}

function getUrgencyClass(minutes: number, status: string): string {
  if (status === 'ready') return 'border-accent/60 bg-accent/5';
  if (minutes >= 15) return 'border-red-500/70 bg-red-500/8';
  if (minutes >= 8) return 'border-amber-500/60 bg-amber-500/8';
  return 'border-border bg-card';
}

function getTimerColor(minutes: number, status: string): string {
  if (status === 'ready') return 'text-accent';
  if (minutes >= 15) return 'text-red-400';
  if (minutes >= 8) return 'text-amber-400';
  return 'text-muted-foreground';
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground' },
  acknowledged: { label: 'Acknowledged', color: 'bg-blue-500/20 text-blue-400' },
  preparing: { label: 'Preparing', color: 'bg-amber-500/20 text-amber-400' },
  ready: { label: 'Ready', color: 'bg-accent/20 text-accent' },
};

export default function KDSClient() {
  const [kots, setKots] = useState<KOT[]>([]);
  const [selectedStation, setSelectedStation] = useState('All');
  const [tick, setTick] = useState(0);
  const [showVoidModal, setShowVoidModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Track live table statuses from Table Management broadcasts
  const [tableStatusMap, setTableStatusMap] = useState<Record<string, string>>({});
  // Item-level fulfillment tracking: kotId -> itemId -> fulfilledQty
  const [fulfillmentMap, setFulfillmentMap] = useState<Record<string, Record<string, number>>>({});

  const supabase = createClient();
  // Debounce ref: prevents duplicate rapid fetches when KOT + items arrive in quick succession
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load KOTs ──────────────────────────────────────────────────────────
  const loadKOTs = useCallback(async () => {
    try {
      const data = await kotService.getActive();
      setKots(data as KOT[]);
    } catch (err: any) {
      toast.error('Failed to load KOTs: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced refresh — coalesces rapid INSERT events (kots row + kot_items rows)
  const debouncedRefresh = useCallback((delayMs = 400) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      loadKOTs();
    }, delayMs);
  }, [loadKOTs]);

  useEffect(() => {
    loadKOTs();
  }, [loadKOTs]);

  // ── Real-time subscriptions ────────────────────────────────────────────
  useEffect(() => {
    const kotChannel = supabase
      .channel('kds_kots')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kots' }, (payload) => {
        // Delay fetch so kot_items rows are committed before we query
        debouncedRefresh(400);
        toast.success(`New KOT #${payload.new.kot_number} — ${payload.new.table_label}`, { icon: '🔔' });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kots' }, (payload) => {
        const updated = payload.new;
        if (updated.status === 'bumped' || updated.status === 'voided') {
          setKots((prev) => prev.filter((k) => k.id !== updated.id));
        } else {
          setKots((prev) =>
            prev.map((k) =>
              k.id === updated.id
                ? { ...k, status: updated.status, priority: updated.priority }
                : k
            )
          );
        }
      })
      .subscribe();

    // Subscribe to kot_items inserts — handles cases where items arrive after the KOT row
    // and the initial debounced fetch may have already run with an empty items array
    const kotItemsChannel = supabase
      .channel('kds_kot_items')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kot_items' }, (payload) => {
        const kotId = payload.new.kot_id;
        // Only refresh if this KOT is already in state but has no items yet (race condition guard)
        setKots((prev) => {
          const existing = prev.find((k) => k.id === kotId);
          if (existing && (!existing.items || existing.items.length === 0)) {
            // Items arrived after initial fetch — trigger a refresh
            debouncedRefresh(100);
          }
          return prev;
        });
      })
      .subscribe();

    // ── Table status sync from Table Management ────────────────────────
    const tableStatusChannel = supabase
      .channel('table_status_sync')
      .on('broadcast', { event: 'table_status_changed' }, ({ payload }) => {
        if (!payload?.label) return;
        setTableStatusMap((prev) => ({ ...prev, [payload.label]: payload.status }));
        if (payload.status === 'bill_requested') {
          toast.info(`Table ${payload.label} — Bill Requested`, { icon: '🧾' });
        } else if (payload.status === 'cleaning') {
          toast.success(`Table ${payload.label} — Cleared & Cleaning`, { icon: '✅' });
        }
      })
      .subscribe();

    // Timer tick every 30s
    const interval = setInterval(() => setTick((t) => t + 1), 30000);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(kotChannel);
      supabase.removeChannel(kotItemsChannel);
      supabase.removeChannel(tableStatusChannel);
      clearInterval(interval);
    };
  }, [debouncedRefresh]);

  const filteredKOTs = kots.filter((k) => {
    if (k.status === 'ready' && getElapsedMinutes(k.fireTime) > 30) return false;
    if (selectedStation !== 'All' && k.station !== selectedStation) return false;
    return true;
  });

  const activeCount = kots.filter((k) => k.status !== 'ready').length;
  const urgentCount = kots.filter((k) => getElapsedMinutes(k.fireTime) >= 10 && k.status !== 'ready').length;

  async function advanceStatus(kotId: string) {
    const kot = kots.find((k) => k.id === kotId);
    if (!kot) return;
    const next: Record<string, KOT['status']> = {
      pending: 'acknowledged',
      acknowledged: 'preparing',
      preparing: 'ready',
      ready: 'ready',
    };
    const newStatus = next[kot.status];
    // Optimistic update
    setKots((prev) => prev.map((k) => k.id === kotId ? { ...k, status: newStatus } : k));
    try {
      await kotService.advanceStatus(kotId, newStatus);
      if (newStatus === 'ready') {
        toast.success(`KOT ${kot.kotNumber} — ${kot.tableLabel} is READY`, { icon: '🔔' });
      } else if (newStatus === 'acknowledged') {
        toast.success(`KOT ${kot.kotNumber} acknowledged`);
      }
    } catch (err: any) {
      // Revert on error
      setKots((prev) => prev.map((k) => k.id === kotId ? { ...k, status: kot.status } : k));
      toast.error('Update failed: ' + err.message);
    }
  }

  async function bumpKOT(kotId: string) {
    setKots((prev) => prev.filter((k) => k.id !== kotId));
    try {
      await kotService.bump(kotId);
      toast.success('KOT bumped — order delivered');
    } catch (err: any) {
      toast.error('Bump failed: ' + err.message);
      loadKOTs();
    }
  }

  async function voidKOT(kotId: string, reason: string) {
    setKots((prev) => prev.filter((k) => k.id !== kotId));
    setShowVoidModal(null);
    try {
      await kotService.void(kotId);
      toast.error(`KOT voided — Reason: ${reason}`);
    } catch (err: any) {
      toast.error('Void failed: ' + err.message);
      loadKOTs();
    }
  }

  function toggleItemFulfillment(kotId: string, itemId: string, totalQty: number) {
    setFulfillmentMap((prev) => {
      const kotMap = prev[kotId] || {};
      const current = kotMap[itemId] ?? 0;
      // Toggle: if fully fulfilled → reset to 0, else mark all as fulfilled
      const next = current >= totalQty ? 0 : totalQty;
      return { ...prev, [kotId]: { ...kotMap, [itemId]: next } };
    });
  }

  function incrementItemFulfillment(kotId: string, itemId: string, totalQty: number) {
    setFulfillmentMap((prev) => {
      const kotMap = prev[kotId] || {};
      const current = kotMap[itemId] ?? 0;
      const next = Math.min(current + 1, totalQty);
      return { ...prev, [kotId]: { ...kotMap, [itemId]: next } };
    });
  }

  function getKotFulfillmentProgress(kotId: string, items: KOTItem[]): { fulfilled: number; total: number } {
    const kotMap = fulfillmentMap[kotId] || {};
    const total = items.reduce((s, i) => s + i.qty, 0);
    const fulfilled = items.reduce((s, i) => s + (kotMap[i.id] ?? 0), 0);
    return { fulfilled, total };
  }

  const nextActionLabel: Record<string, string> = {
    pending: 'Acknowledge',
    acknowledged: 'Start Cooking',
    preparing: 'Mark Ready',
    ready: 'Bump',
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm">Loading kitchen display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/15 border border-red-500/30 rounded-lg">
            <Bell size={12} className="text-red-400" />
            <span className="text-xs font-bold text-red-400">{activeCount} Active KOTs</span>
          </div>
          {urgentCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 rounded-lg">
              <AlertTriangle size={12} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-400">{urgentCount} Urgent</span>
            </div>
          )}
        </div>

        {/* Station filter */}
        <div className="flex gap-1 p-0.5 bg-secondary rounded-lg ml-2">
          {stations.map((s) => (
            <button
              key={`station-${s}`}
              onClick={() => setSelectedStation(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedStation === s ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span>&lt;5 min</span>
            <div className="w-2 h-2 rounded-full bg-amber-400 ml-2" />
            <span>5–15 min</span>
            <div className="w-2 h-2 rounded-full bg-red-400 ml-2" />
            <span>&gt;15 min</span>
          </div>
          <button
            onClick={loadKOTs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* KOT Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {filteredKOTs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <ChefHat size={48} className="mb-3 opacity-20" />
            <p className="text-base font-semibold">All clear — kitchen is caught up!</p>
            <p className="text-sm opacity-60 mt-1">No active KOTs for {selectedStation === 'All' ? 'any station' : selectedStation}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredKOTs
              .sort((a, b) => {
                if (a.priority === 'rush' && b.priority !== 'rush') return -1;
                if (b.priority === 'rush' && a.priority !== 'rush') return 1;
                return new Date(a.fireTime).getTime() - new Date(b.fireTime).getTime();
              })
              .map((kot) => {
                const elapsed = getElapsedMinutes(kot.fireTime);
                const urgencyClass = getUrgencyClass(elapsed, kot.status);
                const timerColor = getTimerColor(elapsed, kot.status);
                const isReady = kot.status === 'ready';

                return (
                  <div
                    key={`kot-${kot.id}`}
                    className={`flex flex-col rounded-2xl border-2 overflow-hidden transition-all ${urgencyClass}`}
                  >
                    {/* Card header */}
                    <div className={`flex items-center justify-between px-3 py-2.5 border-b border-border/50 ${isReady ? 'bg-accent/10' : elapsed >= 15 ? 'bg-red-500/10' : elapsed >= 8 ? 'bg-amber-500/10' : 'bg-secondary/50'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-foreground leading-none">{kot.tableLabel}</span>
                        {kot.priority === 'rush' && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500 rounded text-[9px] font-bold text-white">
                            <Zap size={8} />RUSH
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          kot.orderType === 'delivery' ? 'bg-blue-500/20 text-blue-400' :
                          kot.orderType === 'takeaway' ? 'bg-purple-500/20 text-purple-400' : 'bg-secondary text-muted-foreground'
                        }`}>
                          {kot.orderType === 'delivery' ? 'DEL' : kot.orderType === 'takeaway' ? 'TKW' : 'DI'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`flex items-center gap-1 text-xs font-bold font-mono ${timerColor}`}>
                          <Clock size={11} />
                          {elapsed}m
                        </span>
                      </div>
                    </div>

                    {/* KOT number + steward */}
                    <div className="flex items-center justify-between px-3 pt-2 pb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">{kot.kotNumber}</span>
                      <div className="flex items-center gap-1.5">
                        {tableStatusMap[kot.tableLabel] === 'bill_requested' && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[9px] font-bold text-red-400">
                            🧾 Bill Req.
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{kot.steward}</span>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="flex-1 px-3 pb-2 space-y-1.5">
                      {kot.items?.map((item) => {
                        const fulfilledQty = (fulfillmentMap[kot.id] || {})[item.id] ?? 0;
                        const isFulfilled = fulfilledQty >= item.qty;
                        return (
                          <div key={`kitem-${kot.id}-${item.id}`} className="flex items-start gap-2">
                            <button
                              onClick={() => toggleItemFulfillment(kot.id, item.id, item.qty)}
                              className={`mt-0.5 flex-shrink-0 transition-colors ${isFulfilled ? 'text-accent' : 'text-muted-foreground hover:text-accent'}`}
                              title={isFulfilled ? 'Mark unfulfilled' : 'Mark fulfilled'}
                            >
                              {isFulfilled ? <CheckSquare size={13} /> : <Square size={13} />}
                            </button>
                            <div className={`w-2 h-2 mt-0.5 rounded-sm flex-shrink-0 ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${isFulfilled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.qty}×</span>
                                <span className={`text-sm truncate ${isFulfilled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.name}</span>
                                {item.qty > 1 && !isFulfilled && fulfilledQty > 0 && (
                                  <button
                                    onClick={() => incrementItemFulfillment(kot.id, item.id, item.qty)}
                                    className="ml-auto text-[9px] px-1.5 py-0.5 bg-accent/20 text-accent rounded font-bold"
                                  >
                                    {fulfilledQty}/{item.qty}
                                  </button>
                                )}
                                {item.qty > 1 && !isFulfilled && fulfilledQty === 0 && (
                                  <button
                                    onClick={() => incrementItemFulfillment(kot.id, item.id, item.qty)}
                                    className="ml-auto text-[9px] px-1.5 py-0.5 bg-secondary border border-border text-muted-foreground rounded font-bold hover:border-accent/40 hover:text-accent transition-all"
                                  >
                                    +1
                                  </button>
                                )}
                              </div>
                              {item.note && (
                                <p className="text-[11px] text-amber-400 italic">⚠ {item.note}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Fulfillment progress bar */}
                    {(() => {
                      const { fulfilled, total } = getKotFulfillmentProgress(kot.id, kot.items || []);
                      const pct = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
                      if (total === 0) return null;
                      return (
                        <div className="px-3 pb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-muted-foreground font-medium">Fulfilled</span>
                            <span className={`text-[9px] font-bold ${pct === 100 ? 'text-accent' : 'text-muted-foreground'}`}>{fulfilled}/{total}</span>
                          </div>
                          <div className="h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-accent' : 'bg-primary'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Status badge */}
                    <div className="px-3 pb-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusLabels[kot.status]?.color || ''}`}>
                        {isReady && <CheckCircle size={9} />}
                        {statusLabels[kot.status]?.label || kot.status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="px-3 pb-3 flex gap-2">
                      {!isReady ? (
                        <button
                          onClick={() => advanceStatus(kot.id)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                            kot.status === 'pending' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                              : kot.status === 'acknowledged'? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30' :'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
                          }`}
                        >
                          <Flame size={12} />
                          {nextActionLabel[kot.status]}
                        </button>
                      ) : (
                        <button
                          onClick={() => bumpKOT(kot.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold bg-accent text-white flex items-center justify-center gap-1.5 hover:bg-accent/90 transition-all active:scale-95"
                        >
                          <CheckCircle size={12} />
                          Bump
                        </button>
                      )}
                      <button
                        onClick={() => setShowVoidModal(kot.id)}
                        className="w-8 py-2 rounded-xl bg-secondary border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-all flex items-center justify-center"
                        title="Void KOT"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5 animate-scale-in">
            <h3 className="text-base font-bold text-foreground mb-1">Void KOT</h3>
            <p className="text-xs text-muted-foreground mb-4">This action is logged and cannot be undone. Select a reason.</p>
            <div className="space-y-2 mb-4">
              {['Customer cancelled', 'Wrong item ordered', 'Item unavailable', 'Duplicate KOT', 'Other'].map((reason) => (
                <button
                  key={`void-reason-${reason}`}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-secondary border border-border hover:border-destructive/50 hover:bg-destructive/10 text-sm text-foreground transition-all"
                  onClick={() => voidKOT(showVoidModal, reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            <button onClick={() => setShowVoidModal(null)} className="w-full py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}