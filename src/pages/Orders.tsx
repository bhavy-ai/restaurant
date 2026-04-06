import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus, Table, MenuItem, Category } from '../types';
import { getTableNumber } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, X, ChevronDown } from 'lucide-react';

const statusColors: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  served: 'bg-purple-100 text-purple-800',
  paid: 'bg-gray-100 text-gray-800',
};

const ALL_STATUSES: OrderStatus[] = ['pending', 'preparing', 'ready', 'served', 'paid'];

interface CartItem {
  menu_item: MenuItem;
  quantity: number;
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<Order | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOrders = async () => {
    try {
      const query = supabase
        .from('orders')
        .select('*, table:tables(table_number, capacity, status, id, created_at), order_items(*, menu_item:menu_items(*))')
        .order('created_at', { ascending: false });

      const { data } = await query;
      setOrders((data as Order[]) ?? []);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    const [tablesRes, menuRes] = await Promise.all([
      supabase.from('tables').select('*').order('table_number'),
      supabase.from('menu_items').select('*, category:categories(*)').eq('is_available', true).order('name'),
    ]);
    setTables((tablesRes.data as Table[]) ?? []);
    setMenuItems((menuRes.data as MenuItem[]) ?? []);
  };

  useEffect(() => { fetchOrders(); fetchFormData(); }, []);

  const openNewOrder = () => {
    setCart([]);
    setSelectedTable('');
    setNotes('');
    setShowModal(true);
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menu_item.id === item.id);
      if (existing) return prev.map(c => c.menu_item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menu_item: item, quantity: 1 }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(c => c.menu_item.id !== id));
    else setCart(prev => prev.map(c => c.menu_item.id === id ? { ...c, quantity: qty } : c));
  };

  const total = cart.reduce((sum, c) => sum + c.menu_item.price * c.quantity, 0);

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert({ table_id: selectedTable || null, status: 'pending', total_amount: total, notes: notes || null })
        .select()
        .single();
      if (oErr) throw oErr;

      const itemsPayload = cart.map(c => ({
        order_id: order.id,
        menu_item_id: c.menu_item.id,
        quantity: c.quantity,
        unit_price: c.menu_item.price,
      }));
      const { error: iErr } = await supabase.from('order_items').insert(itemsPayload);
      if (iErr) throw iErr;

      if (selectedTable) {
        await supabase.from('tables').update({ status: 'occupied' }).eq('id', selectedTable);
      }

      toast.success('Order created');
      setShowModal(false);
      fetchOrders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) { toast.error('Failed to update status'); return; }
    fetchOrders();
    if (showDetail) setShowDetail(prev => prev ? { ...prev, status } : null);
  };

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  const groupedMenuItems = menuItems.reduce<Record<string, { category: Category; items: MenuItem[] }>>((acc, item) => {
    const cat = item.category as Category | undefined;
    const catId = cat?.id ?? 'uncategorized';
    if (!acc[catId]) acc[catId] = { category: cat ?? { id: 'uncategorized', name: 'Other', created_at: '' }, items: [] };
    acc[catId].items.push(item);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <button onClick={openNewOrder} className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
          <Plus size={18} /> New Order
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {(['all', ...ALL_STATUSES] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${statusFilter === s ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No orders found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div
              key={order.id}
              className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setShowDetail(order)}
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-mono text-xs text-gray-400">#{order.id.slice(0, 8)}</p>
                  <p className="font-semibold text-gray-800">
                    {getTableNumber(order.table)}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${statusColors[order.status]}`}>
                  {order.status}
                </span>
                <span className="font-bold text-gray-800">${order.total_amount.toFixed(2)}</span>
                <ChevronDown size={16} className="text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Order Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">New Order</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateOrder} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Table (optional)</label>
                  <select
                    value={selectedTable}
                    onChange={e => setSelectedTable(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">No table (takeaway)</option>
                    {tables.map(t => <option key={t.id} value={t.id}>Table {t.table_number} ({t.capacity} seats)</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Menu Items</label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {Object.values(groupedMenuItems).map(({ category, items }) => (
                      <div key={category.id}>
                        <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{category.name}</div>
                        {items.map(item => (
                          <div key={item.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                            <div>
                              <span className="text-sm text-gray-800">{item.name}</span>
                              <span className="text-xs text-gray-400 ml-2">${item.price.toFixed(2)}</span>
                            </div>
                            <button type="button" onClick={() => addToCart(item)} className="text-orange-500 hover:text-orange-600 text-sm font-medium">+ Add</button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {cart.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cart</label>
                    <div className="space-y-2">
                      {cart.map(c => (
                        <div key={c.menu_item.id} className="flex items-center gap-3">
                          <span className="flex-1 text-sm">{c.menu_item.name}</span>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateQty(c.menu_item.id, c.quantity - 1)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm hover:bg-gray-200">-</button>
                            <span className="w-6 text-center text-sm">{c.quantity}</span>
                            <button type="button" onClick={() => updateQty(c.menu_item.id, c.quantity + 1)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm hover:bg-gray-200">+</button>
                          </div>
                          <span className="text-sm font-medium w-16 text-right">${(c.menu_item.price * c.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Total</span>
                        <span>${total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
              <div className="p-6 border-t flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-semibold">Order Details</h2>
                <p className="font-mono text-xs text-gray-400">#{showDetail.id.slice(0, 8)}</p>
              </div>
              <button onClick={() => setShowDetail(null)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Table:</span>
                <span>{getTableNumber(showDetail.table)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[showDetail.status]}`}>{showDetail.status}</span>
              </div>
              {showDetail.order_items && showDetail.order_items.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Items:</p>
                  <div className="space-y-1">
                    {showDetail.order_items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.menu_item?.name ?? 'Item'} × {item.quantity}</span>
                        <span>${(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                    <span>Total</span>
                    <span>${showDetail.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Update Status:</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(showDetail.id, s)}
                      disabled={showDetail.status === s}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${showDetail.status === s ? 'bg-gray-200 text-gray-400 cursor-default' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
