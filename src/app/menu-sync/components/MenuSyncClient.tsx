'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Globe, RefreshCw, CheckCircle, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const OUTLETS = [
  { id: 'koramangala', name: 'Koramangala', city: 'Bengaluru' },
  { id: 'indiranagar', name: 'Indiranagar', city: 'Bengaluru' },
  { id: 'whitefield', name: 'Whitefield', city: 'Bengaluru' },
];

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  gstRate: number;
  hsnCode: string;
  isVeg: boolean;
  available: boolean;
  outlet: string;
}

interface SyncLog {
  id: string;
  sourceOutlet: string;
  targetOutlets: string[];
  syncedBy: string;
  itemsSynced: number;
  status: string;
  details: string;
  createdAt: string;
}

export default function MenuSyncClient() {
  const supabase = createClient();
  const [sourceOutlet, setSourceOutlet] = useState('koramangala');
  const [targetOutlets, setTargetOutlets] = useState<string[]>(['indiranagar', 'whitefield']);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('outlet', sourceOutlet)
        .order('category')
        .order('name');
      if (error) throw error;
      const items = (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        price: Number(r.price),
        gstRate: r.gst_rate,
        hsnCode: r.hsn_code,
        isVeg: r.is_veg,
        available: r.available,
        outlet: r.outlet,
      }));
      setMenuItems(items);
      setSelectedItems(new Set(items.map((i) => i.id)));
    } catch (err: any) {
      toast.error('Failed to load menu: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sourceOutlet]);

  const loadSyncLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const { data } = await supabase
        .from('menu_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      setSyncLogs((data || []).map((r: any) => ({
        id: r.id,
        sourceOutlet: r.source_outlet,
        targetOutlets: r.target_outlets || [],
        syncedBy: r.synced_by,
        itemsSynced: r.items_synced,
        status: r.status,
        details: r.details || '',
        createdAt: r.created_at,
      })));
    } catch {
      // non-critical
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
    loadSyncLogs();
  }, [loadMenu, loadSyncLogs]);

  function toggleItem(id: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTarget(outletId: string) {
    setTargetOutlets((prev) =>
      prev.includes(outletId) ? prev.filter((o) => o !== outletId) : [...prev, outletId]
    );
  }

  async function syncMenu() {
    if (targetOutlets.length === 0) {
      toast.error('Select at least one target outlet');
      return;
    }
    if (selectedItems.size === 0) {
      toast.error('Select at least one menu item to sync');
      return;
    }

    setSyncing(true);
    try {
      const itemsToSync = menuItems.filter((i) => selectedItems.has(i.id));
      let syncedCount = 0;
      const errors: string[] = [];

      for (const targetOutlet of targetOutlets) {
        for (const item of itemsToSync) {
          try {
            // Check if item exists in target outlet by name
            const { data: existing } = await supabase
              .from('menu_items')
              .select('id')
              .eq('outlet', targetOutlet)
              .eq('name', item.name)
              .single();

            if (existing) {
              // Update existing
              await supabase
                .from('menu_items')
                .update({
                  category: item.category,
                  price: item.price,
                  gst_rate: item.gstRate,
                  hsn_code: item.hsnCode,
                  is_veg: item.isVeg,
                  available: item.available,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
            } else {
              // Insert new
              await supabase.from('menu_items').insert({
                name: item.name,
                category: item.category,
                price: item.price,
                gst_rate: item.gstRate,
                hsn_code: item.hsnCode,
                is_veg: item.isVeg,
                available: item.available,
                outlet: targetOutlet,
              });
            }
            syncedCount++;
          } catch (e: any) {
            errors.push(`${item.name} → ${targetOutlet}: ${e.message}`);
          }
        }
      }

      // Log sync
      await supabase.from('menu_sync_log').insert({
        source_outlet: sourceOutlet,
        target_outlets: targetOutlets,
        synced_by: 'Manager',
        items_synced: syncedCount,
        status: errors.length === 0 ? 'success' : 'partial',
        details: errors.length > 0 ? errors.slice(0, 3).join('; ') : `${syncedCount} items synced successfully`,
      });

      toast.success(`Menu sync complete — ${syncedCount} items synced to ${targetOutlets.length} outlet(s)`);
      loadSyncLogs();
    } catch (err: any) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  const categories = [...new Set(menuItems.map((i) => i.category))];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-foreground">Centralized Menu Sync</h2>
        <p className="text-sm text-muted-foreground">Push menu changes from HQ outlet to child outlets</p>
      </div>

      {/* Sync Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">Source Outlet (HQ)</h3>
          <div className="space-y-2">
            {OUTLETS.map((o) => (
              <button
                key={`src-${o.id}`}
                onClick={() => setSourceOutlet(o.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  sourceOutlet === o.id
                    ? 'bg-primary/10 border-primary/50 text-primary' :'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe size={14} />
                <div>
                  <p className="text-xs font-semibold">{o.name}</p>
                  <p className="text-[10px] opacity-70">{o.city}</p>
                </div>
                {sourceOutlet === o.id && <CheckCircle size={14} className="ml-auto" />}
              </button>
            ))}
          </div>
        </div>

        {/* Targets */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">Target Outlets</h3>
          <div className="space-y-2">
            {OUTLETS.filter((o) => o.id !== sourceOutlet).map((o) => (
              <button
                key={`tgt-${o.id}`}
                onClick={() => toggleTarget(o.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  targetOutlets.includes(o.id)
                    ? 'bg-accent/10 border-accent/50 text-accent' :'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe size={14} />
                <div>
                  <p className="text-xs font-semibold">{o.name}</p>
                  <p className="text-[10px] opacity-70">{o.city}</p>
                </div>
                {targetOutlets.includes(o.id) && <CheckCircle size={14} className="ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Arrow indicator */}
      <div className="flex items-center justify-center gap-3 text-muted-foreground text-xs">
        <span className="font-semibold text-foreground">{OUTLETS.find((o) => o.id === sourceOutlet)?.name}</span>
        <ArrowRight size={16} className="text-primary" />
        <span className="font-semibold text-foreground">{targetOutlets.map((t) => OUTLETS.find((o) => o.id === t)?.name).join(', ') || 'No targets'}</span>
      </div>

      {/* Item Selection */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground">
            Select Items to Sync ({selectedItems.size}/{menuItems.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedItems(new Set(menuItems.map((i) => i.id)))}
              className="text-xs text-primary hover:text-primary/80 font-semibold"
            >
              All
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => setSelectedItems(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold"
            >
              None
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
            {categories.map((cat) => (
              <div key={`cat-${cat}`}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{cat}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {menuItems.filter((i) => i.category === cat).map((item) => (
                    <button
                      key={`item-${item.id}`}
                      onClick={() => toggleItem(item.id)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                        selectedItems.has(item.id)
                          ? 'bg-primary/10 border-primary/40 text-foreground'
                          : 'bg-secondary border-border text-muted-foreground'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync Button */}
      <button
        onClick={syncMenu}
        disabled={syncing || targetOutlets.length === 0 || selectedItems.size === 0}
        className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all"
      >
        {syncing ? (
          <><Loader2 size={16} className="animate-spin" /> Syncing...</>
        ) : (
          <><RefreshCw size={16} /> Sync {selectedItems.size} Items to {targetOutlets.length} Outlet(s)</>
        )}
      </button>

      {/* Sync History */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Sync History</h3>
        {loadingLogs ? (
          <div className="flex items-center justify-center h-12">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : syncLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No sync history yet</p>
        ) : (
          <div className="space-y-2">
            {syncLogs.map((log) => (
              <div key={`log-${log.id}`} className="flex items-start gap-3 px-3 py-2.5 bg-secondary rounded-xl">
                {log.status === 'success' ? (
                  <CheckCircle size={14} className="text-accent mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {log.sourceOutlet} → {log.targetOutlets.join(', ')} · {log.itemsSynced} items
                  </p>
                  <p className="text-[10px] text-muted-foreground">{log.details}</p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
