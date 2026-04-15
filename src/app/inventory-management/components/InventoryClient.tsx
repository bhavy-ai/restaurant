'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Search, Plus, Edit3, X, CheckCircle, ArrowUpDown, RefreshCw, Package, Loader2, MessageSquare,  } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { inventoryService } from '@/lib/services/restaurantService';
import { auditService } from '@/lib/services/restaurantService';
import { offlineQueue } from '@/lib/offlineQueue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import OfflineQueuePanel from '@/components/OfflineQueuePanel';
import { captureException } from '@/lib/errorTracking';
import { useAuth } from '@/contexts/AuthContext';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  maxStock: number;
  lastPurchasePrice: number;
  consumedToday: number;
  variance: number;
  supplier: string;
  lastUpdated: string;
  status: 'ok' | 'low' | 'critical' | 'overstock';
}

const categories = ['All', 'Meat & Poultry', 'Dairy', 'Vegetables', 'Grains & Staples', 'Spices & Masalas', 'Beverages', 'Oils & Fats', 'Fuel & Consumables'];

const statusConfig = {
  ok: { label: 'OK', bg: 'bg-accent/15', text: 'text-accent', border: 'border-accent/30' },
  low: { label: 'Low Stock', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  critical: { label: 'Critical', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  overstock: { label: 'Overstock', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
};

interface AdjustModalState {
  item: InventoryItem | null;
  type: 'add' | 'remove' | 'wastage';
  qty: string;
  reason: string;
}

export default function InventoryClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof InventoryItem>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [adjustModal, setAdjustModal] = useState<AdjustModalState>({ item: null, type: 'add', qty: '', reason: '' });
  const [showAdjust, setShowAdjust] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [loading, setLoading] = useState(true);
  const networkStatus = useNetworkStatus();
  const { isOnline } = networkStatus;
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [lastAlertSent, setLastAlertSent] = useState<Date | null>(null);

  const supabase = createClient();
  const { staffUser, activeRestaurant, activeOutlet } = useAuth();
  const restaurantId = activeRestaurant?.id;
  const outletSlug = activeOutlet?.slug || staffUser?.outlet || 'koramangala';

  const loadInventory = useCallback(async () => {
    if (!restaurantId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const data = await inventoryService.getAll(outletSlug, { restaurantId, outletSlug });
      setItems(data);
    } catch (err: any) {
      captureException(err, { component: 'InventoryClient', action: 'loadInventory' });
      toast.error('Failed to load inventory: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, outletSlug]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // ── Real-time subscriptions ────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('inventory_management')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory_items' }, (payload) => {
        const r = payload.new;
        setItems((prev) =>
          prev.map((item) =>
            item.id === r.id
              ? {
                  ...item,
                  currentStock: Number(r.current_stock),
                  status: r.status as InventoryItem['status'],
                  consumedToday: Number(r.consumed_today),
                  variance: Number(r.variance),
                }
              : item
          )
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_items' }, () => {
        loadInventory();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const alertCount = items.filter((i) => i.status === 'low' || i.status === 'critical').length;
  const criticalCount = items.filter((i) => i.status === 'critical').length;

  const filtered = items
    .filter((i) => {
      const catMatch = selectedCategory === 'All' || i.category === selectedCategory;
      const searchMatch =
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.supplier.toLowerCase().includes(searchQuery.toLowerCase());
      return catMatch && searchMatch;
    })
    .sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const dir = sortDir === 'asc' ? 1 : -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return 0;
    });

  function toggleSort(field: keyof InventoryItem) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  function openAdjust(item: InventoryItem, type: 'add' | 'remove' | 'wastage') {
    // Role guard: only owner, manager, accountant can adjust stock
    const allowedRoles = ['owner', 'manager', 'accountant'];
    if (staffUser && !allowedRoles.includes(staffUser.role)) {
      toast.error(`Access denied — your role (${staffUser.role}) cannot adjust stock levels`);
      return;
    }
    setAdjustModal({ item, type, qty: '', reason: '' });
    setShowAdjust(true);
  }

  async function applyAdjustment() {
    if (!adjustModal.item || !adjustModal.qty || !adjustModal.reason) return;
    const qty = Number(adjustModal.qty);
    const delta = adjustModal.type === 'add' ? qty : -qty;
    const itemName = adjustModal.item.name;
    const itemUnit = adjustModal.item.unit;
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== adjustModal.item!.id) return i;
        const newStock = Math.max(0, i.currentStock + delta);
        const newStatus: InventoryItem['status'] =
          newStock <= 0 ? 'critical' :
          newStock < i.reorderLevel * 0.5 ? 'critical' :
          newStock < i.reorderLevel ? 'low' :
          newStock > i.maxStock * 0.9 ? 'overstock' : 'ok';
        return { ...i, currentStock: Math.round(newStock * 100) / 100, status: newStatus };
      })
    );
    setShowAdjust(false);

    if (!isOnline) {
      await offlineQueue.enqueue('inventory_adjust', {
        itemId: adjustModal.item.id,
        type: adjustModal.type,
        qty,
        reason: adjustModal.reason,
        adjustedBy: staffUser?.name || 'Staff',
      });
      toast.success(`Adjustment queued — ${itemName}: ${adjustModal.type === 'add' ? '+' : '-'}${adjustModal.qty} ${itemUnit} (will sync when online)`);
      return;
    }

    try {
      await inventoryService.adjust(
        adjustModal.item.id,
        adjustModal.type,
        qty,
        adjustModal.reason,
        staffUser?.name || 'Staff',
        outletSlug,
        { restaurantId: restaurantId || '', outletSlug }
      );
      toast.success(
        `Stock adjusted — ${itemName}: ${adjustModal.type === 'add' ? '+' : '-'}${adjustModal.qty} ${itemUnit}`
      );
      // Log inventory adjustment to audit trail
      auditService.log({
        staffName: staffUser?.name || 'Staff',
        staffRole: staffUser?.role || 'accountant',
        action: `INVENTORY_${adjustModal.type.toUpperCase()}`,
        entity: itemName,
        details: `Type: ${adjustModal.type} | Qty: ${adjustModal.type === 'add' ? '+' : '-'}${qty} ${itemUnit} | Reason: ${adjustModal.reason}`,
        severity: adjustModal.type === 'wastage' ? 'warning' : 'info',
        outlet: outletSlug,
      }, { restaurantId: restaurantId || '', outletSlug }).catch(() => {/* non-blocking */});
    } catch (err: any) {
      toast.error('Adjustment failed: ' + err.message);
      await offlineQueue.enqueue('inventory_adjust', {
        itemId: adjustModal.item.id,
        type: adjustModal.type,
        qty,
        reason: adjustModal.reason,
        adjustedBy: staffUser?.name || 'Staff',
      });
      toast.info('Queued for retry when connection restores');
      loadInventory();
    }
  }

  function stockPercent(item: InventoryItem): number {
    return Math.min(100, Math.round((item.currentStock / item.maxStock) * 100));
  }

  const SortHeader = ({ field, label }: { field: keyof InventoryItem; label: string }) => (
    <th
      onClick={() => toggleSort(field)}
      className="px-3 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={sortField === field ? 'text-primary' : 'opacity-40'} />
      </span>
    </th>
  );

  async function sendLowStockAlerts() {
    const alertItems = items.filter((i) => i.status === 'low' || i.status === 'critical');
    if (alertItems.length === 0) {
      toast.info('No low stock items to alert');
      return;
    }
    setSendingAlerts(true);
    try {
      const res = await fetch('/api/send-low-stock-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: alertItems.map((i) => ({
            name: i.name,
            currentStock: i.currentStock,
            reorderLevel: i.reorderLevel,
            unit: i.unit,
            status: i.status,
          })),
          outlet: outletSlug,
          restaurantId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message);
        setLastAlertSent(new Date());
      } else {
        toast.info(result.message || 'SMS not sent — check Twilio config in Admin Panel');
      }
    } catch (err: any) {
      toast.error('Failed to send alerts: ' + err.message);
    } finally {
      setSendingAlerts(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <OfflineQueuePanel networkStatus={networkStatus} />
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div>
          <h2 className="text-base font-bold text-foreground">Inventory Management</h2>
          <p className="text-xs text-muted-foreground">
            {alertCount > 0 ? (
              <span className="text-amber-400 font-semibold">{alertCount} items need attention</span>
            ) : 'All stock levels normal'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <button
              onClick={sendLowStockAlerts}
              disabled={sendingAlerts}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              title={lastAlertSent ? `Last sent: ${lastAlertSent.toLocaleTimeString('en-IN')}` : 'Send SMS alert to managers'}
            >
              {sendingAlerts ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              Alert Managers
            </button>
          )}
          <button
            onClick={loadInventory}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-semibold text-foreground hover:border-primary/40 transition-all"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all"
          >
            <Plus size={13} />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items or suppliers..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={`invcat-${cat}`}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-white' :'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat === 'All' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-[hsl(224_71%_5%)] border-b border-border">
            <tr>
              <SortHeader field="name" label="Item Name" />
              <SortHeader field="category" label="Category" />
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Stock Level</th>
              <SortHeader field="currentStock" label="Current" />
              <SortHeader field="reorderLevel" label="Reorder" />
              <SortHeader field="consumedToday" label="Consumed Today" />
              <SortHeader field="variance" label="Variance" />
              <SortHeader field="lastPurchasePrice" label="Last Price" />
              <SortHeader field="supplier" label="Supplier" />
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => {
              const pct = stockPercent(item);
              const cfg = statusConfig[item.status];
              const barColor =
                item.status === 'critical' ? 'bg-red-500' :
                item.status === 'low' ? 'bg-amber-400' :
                item.status === 'overstock' ? 'bg-blue-400' : 'bg-accent';

              return (
                <tr
                  key={`inv-row-${item.id}`}
                  className={`border-b border-border transition-colors hover:bg-secondary/40 group ${idx % 2 === 0 ? '' : 'bg-secondary/10'}`}
                >
                  {/* Name */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-semibold text-foreground">{item.name}</span>
                  </td>

                  {/* Category */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                  </td>

                  {/* Stock bar */}
                  <td className="px-3 py-3 min-w-[100px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{pct}%</span>
                    </div>
                  </td>

                  {/* Current stock */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`font-bold font-mono tabular-nums ${item.status === 'critical' ? 'text-red-400' : item.status === 'low' ? 'text-amber-400' : 'text-foreground'}`}>
                      {item.currentStock} {item.unit}
                    </span>
                  </td>

                  {/* Reorder level */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-muted-foreground font-mono">{item.reorderLevel} {item.unit}</span>
                  </td>

                  {/* Consumed today */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-foreground font-mono tabular-nums">{item.consumedToday} {item.unit}</span>
                  </td>

                  {/* Variance */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-mono tabular-nums font-semibold ${
                      item.variance < 0 ? 'text-red-400' : item.variance > 0 ? 'text-amber-400' : 'text-muted-foreground'
                    }`}>
                      {item.variance > 0 ? '+' : ''}{item.variance} {item.unit}
                    </span>
                  </td>

                  {/* Last price */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-foreground font-mono tabular-nums">₹{item.lastPurchasePrice}/{item.unit}</span>
                  </td>

                  {/* Supplier */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-muted-foreground truncate max-w-[140px] block">{item.supplier}</span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      {item.status === 'critical' && <AlertTriangle size={9} />}
                      {cfg.label}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openAdjust(item, 'add')}
                        title="Add stock"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-all"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => openAdjust(item, 'remove')}
                        title="Remove stock"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => openAdjust(item, 'wastage')}
                        title="Log wastage"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {/* Always-visible action for small screens */}
                    <div className="flex items-center justify-end gap-1 sm:hidden">
                      <button
                        onClick={() => openAdjust(item, 'add')}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-accent/15 text-accent"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Package size={36} className="mb-2 opacity-20" />
            <p className="text-sm font-semibold">No items found</p>
            <p className="text-xs opacity-60 mt-1">Try adjusting your search or category filter</p>
          </div>
        )}
      </div>

      {/* ── Summary footer ─────────────────────────────────────── */}
      <div className="flex items-center gap-6 px-4 lg:px-6 py-2 border-t border-border bg-card flex-shrink-0 text-xs text-muted-foreground">
        <span>{filtered.length} of {items.length} items</span>
        <span className="text-red-400 font-semibold">{criticalCount} critical</span>
        <span className="text-amber-400 font-semibold">{items.filter(i => i.status === 'low').length} low stock</span>
        <span className="ml-auto">Live — Supabase</span>
      </div>

      {/* ── Stock Adjustment Modal ──────────────────────────────── */}
      {showAdjust && adjustModal.item && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground capitalize">
                  {adjustModal.type === 'add' ? 'Add Stock' : adjustModal.type === 'wastage' ? 'Log Wastage' : 'Remove Stock'} — {adjustModal.item.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Current: {adjustModal.item.currentStock} {adjustModal.item.unit}
                </p>
              </div>
              <button onClick={() => setShowAdjust(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Quantity ({adjustModal.item.unit})
                </label>
                <input
                  type="number"
                  value={adjustModal.qty}
                  onChange={(e) => setAdjustModal((m) => ({ ...m, qty: e.target.value }))}
                  placeholder={`Enter quantity in ${adjustModal.item.unit}`}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Reason <span className="text-red-400">*</span>
                </label>
                <select
                  value={adjustModal.reason}
                  onChange={(e) => setAdjustModal((m) => ({ ...m, reason: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                >
                  <option value="">Select reason</option>
                  {adjustModal.type === 'add'
                    ? ['Purchase received', 'Stock transfer in', 'Opening stock', 'Correction'].map((r) => (
                        <option key={`reason-add-${r}`} value={r}>{r}</option>
                      ))
                    : adjustModal.type === 'wastage'
                    ? ['Spoilage', 'Expired', 'Damaged', 'Over-portioning', 'Theft suspected'].map((r) => (
                        <option key={`reason-waste-${r}`} value={r}>{r}</option>
                      ))
                    : ['Stock transfer out', 'Correction', 'Consumption entry', 'Returned to supplier'].map((r) => (
                        <option key={`reason-remove-${r}`} value={r}>{r}</option>
                      ))
                  }
                </select>
              </div>

              {adjustModal.qty && adjustModal.item && (
                <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                  adjustModal.type === 'add' ? 'bg-accent/10 border-accent/30' : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <span className="text-xs text-muted-foreground">New stock will be</span>
                  <span className={`text-sm font-bold font-mono ${adjustModal.type === 'add' ? 'text-accent' : 'text-red-400'}`}>
                    {Math.max(0, adjustModal.item.currentStock + (adjustModal.type === 'add' ? Number(adjustModal.qty) : -Number(adjustModal.qty))).toFixed(2)} {adjustModal.item.unit}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowAdjust(false)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">
                Cancel
              </button>
              <button
                onClick={applyAdjustment}
                disabled={!adjustModal.qty || !adjustModal.reason}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  adjustModal.type === 'add' ? 'bg-accent hover:bg-accent/90' :
                  adjustModal.type === 'wastage'? 'bg-red-500 hover:bg-red-500/90' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                <CheckCircle size={14} />
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Item Modal ──────────────────────────────────────── */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Add Inventory Item</h3>
              <button onClick={() => setShowAddItem(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Item Name', placeholder: 'e.g. Chicken Breast', type: 'text' },
                { label: 'Category', placeholder: 'Select category', type: 'text' },
                { label: 'Unit', placeholder: 'kg / litre / gm / pcs', type: 'text' },
                { label: 'Opening Stock', placeholder: '0.00', type: 'number' },
                { label: 'Reorder Level', placeholder: '0.00', type: 'number' },
                { label: 'Max Stock', placeholder: '0.00', type: 'number' },
                { label: 'Last Purchase Price (₹)', placeholder: '0.00', type: 'number' },
                { label: 'Supplier', placeholder: 'Supplier name', type: 'text' },
              ].map((field) => (
                <div key={`addfield-${field.label}`}>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddItem(false)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={() => { setShowAddItem(false); toast.success('New inventory item added'); }}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white transition-all"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}