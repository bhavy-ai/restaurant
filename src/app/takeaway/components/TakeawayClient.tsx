'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { captureException } from '@/lib/errorTracking';
import { Bike, Plus, Search, CheckCircle, XCircle, Truck, ShoppingBag, Phone, MapPin } from 'lucide-react';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';
type OrderType = 'takeaway' | 'delivery' | 'aggregator';

interface TakeawayOrder {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  aggregator: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  gstAmount: number;
  discountAmount: number;
  total: number;
  paymentMode: string;
  status: OrderStatus;
  assignedRider: string;
  estimatedTime: number;
  notes: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; next: OrderStatus | null }> = {
  pending: { label: 'Pending', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', next: 'confirmed' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', next: 'preparing' },
  preparing: { label: 'Preparing', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', next: 'ready' },
  ready: { label: 'Ready', color: 'bg-accent/15 text-accent border-accent/30', next: 'dispatched' },
  dispatched: { label: 'Dispatched', color: 'bg-primary/15 text-primary border-primary/30', next: 'delivered' },
  delivered: { label: 'Delivered', color: 'bg-green-500/15 text-green-400 border-green-500/30', next: null },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/15 text-red-400 border-red-500/30', next: null },
};

const defaultForm = {
  orderType: 'takeaway' as OrderType, customerName: '', customerPhone: '', deliveryAddress: '',
  items: [{ name: '', qty: 1, price: 0 }], paymentMode: 'cash', notes: '', estimatedTime: '30',
};

// Deduct ingredient stock based on recipe mappings for ordered items
async function deductRecipeStock(supabase: ReturnType<typeof createClient>, items: Array<{ name: string; qty: number }>) {
  try {
    // Get menu items matching the ordered item names
    const itemNames = items.map(i => i.name.trim()).filter(Boolean);
    if (itemNames.length === 0) return;

    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name')
      .eq('outlet', 'koramangala')
      .in('name', itemNames);

    if (!menuItems || menuItems.length === 0) return;

    const menuItemMap: Record<string, string> = {};
    menuItems.forEach((m: any) => { menuItemMap[m.name] = m.id; });

    const menuItemIds = menuItems.map((m: any) => m.id);

    // Get recipes for those menu items
    const { data: recipes } = await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id, quantity_used')
      .in('menu_item_id', menuItemIds);

    if (!recipes || recipes.length === 0) return;

    // Get current ingredient stock
    const ingredientIds = [...new Set(recipes.map((r: any) => r.ingredient_id))];
    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, current_stock, name')
      .in('id', ingredientIds);

    if (!ingredients) return;

    const stockMap: Record<string, number> = {};
    ingredients.forEach((ing: any) => { stockMap[ing.id] = Number(ing.current_stock); });

    // Calculate total deduction per ingredient
    const deductions: Record<string, number> = {};
    items.forEach(orderedItem => {
      const menuItemId = menuItemMap[orderedItem.name.trim()];
      if (!menuItemId) return;
      const itemRecipes = recipes.filter((r: any) => r.menu_item_id === menuItemId);
      itemRecipes.forEach((recipe: any) => {
        const totalDeduct = Number(recipe.quantity_used) * orderedItem.qty;
        deductions[recipe.ingredient_id] = (deductions[recipe.ingredient_id] || 0) + totalDeduct;
      });
    });

    // Apply deductions
    const updates = Object.entries(deductions).map(([ingredientId, deductAmount]) => {
      const newStock = Math.max(0, (stockMap[ingredientId] || 0) - deductAmount);
      return supabase
        .from('ingredients')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', ingredientId);
    });

    await Promise.all(updates);
  } catch (e: any) {
    // Non-blocking — log but don't fail the order
    captureException(e, { component: 'TakeawayClient', action: 'deductRecipeStock' });
    console.warn('Recipe stock deduction failed (non-blocking):', e.message);
  }
}

export default function TakeawayClient() {
  const supabase = createClient();
  const [orders, setOrders] = useState<TakeawayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<OrderType | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('takeaway_orders').select('*').eq('outlet', 'koramangala').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      setOrders((data || []).map((r: any) => ({
        id: r.id, orderNumber: r.order_number, orderType: r.order_type, aggregator: r.aggregator,
        customerName: r.customer_name || '', customerPhone: r.customer_phone || '',
        deliveryAddress: r.delivery_address || '', items: r.items || [],
        subtotal: Number(r.subtotal), gstAmount: Number(r.gst_amount), discountAmount: Number(r.discount_amount),
        total: Number(r.total), paymentMode: r.payment_mode, status: r.status,
        assignedRider: r.assigned_rider || '', estimatedTime: r.estimated_time || 30,
        notes: r.notes || '', createdAt: r.created_at,
      })));
    } catch (e: any) {
      captureException(e, { component: 'TakeawayClient', action: 'load' });
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const advanceStatus = async (order: TakeawayOrder) => {
    const next = STATUS_CONFIG[order.status].next;
    if (!next) return;
    setUpdatingId(order.id);
    try {
      const { error } = await supabase.from('takeaway_orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: next } : o));
      toast.success(`Order ${order.orderNumber} → ${STATUS_CONFIG[next].label}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelOrder = async (id: string) => {
    try {
      await supabase.from('takeaway_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o));
      toast.success('Order cancelled');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const createOrder = async () => {
    if (!form.customerName.trim()) return;
    setSaving(true);
    try {
      const items = form.items.filter(i => i.name.trim());
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const gstAmount = Math.round(subtotal * 0.05);
      const total = subtotal + gstAmount;
      const orderNumber = `TKW-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('takeaway_orders').insert({
        outlet: 'koramangala', order_number: orderNumber, order_type: form.orderType,
        customer_name: form.customerName, customer_phone: form.customerPhone,
        delivery_address: form.deliveryAddress, items, subtotal, gst_amount: gstAmount,
        discount_amount: 0, total, payment_mode: form.paymentMode, status: 'pending',
        estimated_time: Number(form.estimatedTime), notes: form.notes,
      });
      if (error) throw error;

      // Deduct ingredient stock based on recipe mappings
      await deductRecipeStock(supabase, items);

      toast.success(`Order ${orderNumber} created`);
      setShowForm(false);
      setForm(defaultForm);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterType !== 'all' && o.orderType !== filterType) return false;
    if (search && !o.customerName.toLowerCase().includes(search.toLowerCase()) && !o.orderNumber.includes(search)) return false;
    return true;
  });

  const typeIcon = (type: OrderType) => {
    if (type === 'delivery') return <Truck size={13} />;
    if (type === 'aggregator') return <ShoppingBag size={13} />;
    return <Bike size={13} />;
  };

  const counts = {
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing' || o.status === 'confirmed').length,
    ready: orders.filter(o => o.status === 'ready').length,
    dispatched: orders.filter(o => o.status === 'dispatched').length,
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2"><Bike size={20} className="text-primary" /> Takeaway & Delivery</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 hidden sm:block">Counter orders, direct delivery & aggregator ingestion</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex-shrink-0">
          <Plus size={15} /> <span className="hidden sm:inline">New Order</span><span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Live Status Counters — 2x2 on mobile, 4 cols on md+ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pending', count: counts.pending, color: 'border-amber-500/40 text-amber-400' },
          { label: 'In Kitchen', count: counts.preparing, color: 'border-purple-500/40 text-purple-400' },
          { label: 'Ready', count: counts.ready, color: 'border-accent/40 text-accent' },
          { label: 'Dispatched', count: counts.dispatched, color: 'border-primary/40 text-primary' },
        ].map(s => (
          <div key={s.label} className={`bg-card border rounded-xl p-3 md:p-4 ${s.color.split(' ')[0]}`}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${s.color.split(' ')[1]}`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filters — stack on mobile */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground" />
        </div>
        <div className="flex gap-2">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground">
            <option value="all">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground">
            <option value="all">All Types</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
            <option value="aggregator">Aggregator</option>
          </select>
        </div>
      </div>

      {/* Orders Grid — 1 col on mobile, 2 on md+ */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(order => {
            const sc = STATUS_CONFIG[order.status];
            const nextStatus = sc.next;
            return (
              <div key={order.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground font-mono">{order.orderNumber}</span>
                      <span className={`text-[10px] border px-1.5 py-0.5 rounded-full flex items-center gap-1 ${sc.color}`}>
                        {typeIcon(order.orderType)} {order.orderType}
                      </span>
                      {order.aggregator && <span className="text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full">{order.aggregator}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className={`text-xs border px-2 py-0.5 rounded-full flex-shrink-0 ${sc.color}`}>{sc.label}</span>
                </div>

                {order.customerName && (
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-foreground flex items-center gap-1"><Phone size={10} />{order.customerName}</span>
                    {order.customerPhone && <span className="text-xs text-muted-foreground">{order.customerPhone}</span>}
                  </div>
                )}
                {order.deliveryAddress && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2"><MapPin size={10} />{order.deliveryAddress}</p>
                )}

                <div className="space-y-1 mb-3">
                  {order.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-foreground">{item.qty}× {item.name}</span>
                      <span className="text-muted-foreground">₹{item.price * item.qty}</span>
                    </div>
                  ))}
                  {order.items.length > 3 && <p className="text-xs text-muted-foreground">+{order.items.length - 3} more items</p>}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-base font-bold text-foreground">₹{order.total}</span>
                  <div className="flex items-center gap-2">
                    {order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <>
                        <button onClick={() => cancelOrder(order.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
                          <XCircle size={15} />
                        </button>
                        {nextStatus && (
                          <button onClick={() => advanceStatus(order)} disabled={updatingId === order.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                            {updatingId === order.id ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={12} />}
                            {STATUS_CONFIG[nextStatus].label}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Bike size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No orders found</p>
            </div>
          )}
        </div>
      )}

      {/* New Order Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 overflow-y-auto">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">New Takeaway / Delivery Order</h3>
              <button onClick={() => setShowForm(false)}><XCircle size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['takeaway', 'delivery', 'aggregator'] as OrderType[]).map(t => (
                  <button key={t} onClick={() => setForm(p => ({ ...p, orderType: t }))} className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors capitalize ${form.orderType === t ? 'bg-primary/20 text-primary border-primary/40' : 'bg-secondary border-border text-muted-foreground'}`}>{t}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} placeholder="Customer name *" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
                <input value={form.customerPhone} onChange={e => setForm(p => ({ ...p, customerPhone: e.target.value }))} placeholder="Phone number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
              {form.orderType === 'delivery' && (
                <input value={form.deliveryAddress} onChange={e => setForm(p => ({ ...p, deliveryAddress: e.target.value }))} placeholder="Delivery address" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Items</p>
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input value={item.name} onChange={e => { const items = [...form.items]; items[idx].name = e.target.value; setForm(p => ({ ...p, items })); }} placeholder="Item name" className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm text-foreground" />
                    <input value={item.qty} onChange={e => { const items = [...form.items]; items[idx].qty = Number(e.target.value); setForm(p => ({ ...p, items })); }} type="number" min="1" className="w-14 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm text-foreground" />
                    <input value={item.price || ''} onChange={e => { const items = [...form.items]; items[idx].price = Number(e.target.value); setForm(p => ({ ...p, items })); }} placeholder="₹" type="number" className="w-20 bg-secondary border border-border rounded-lg px-2 py-1.5 text-sm text-foreground" />
                  </div>
                ))}
                <button onClick={() => setForm(p => ({ ...p, items: [...p.items, { name: '', qty: 1, price: 0 }] }))} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus size={12} /> Add item</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={form.paymentMode} onChange={e => setForm(p => ({ ...p, paymentMode: e.target.value }))} className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                </select>
                <input value={form.estimatedTime} onChange={e => setForm(p => ({ ...p, estimatedTime: e.target.value }))} placeholder="Est. time (mins)" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special instructions..." rows={2} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground">Cancel</button>
              <button onClick={createOrder} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={14} />}
                Create Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
