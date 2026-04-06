import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { getTableNumber } from '../lib/utils';
import toast from 'react-hot-toast';
import { RefreshCw, Clock, ChefHat } from 'lucide-react';

const KDS_STATUSES: OrderStatus[] = ['pending', 'preparing'];

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
};

const statusConfig: Record<string, { label: string; bg: string; badge: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-800', icon: Clock },
  preparing: { label: 'Preparing', bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800', icon: ChefHat },
};

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, table:tables(table_number), order_items(*, menu_item:menu_items(name))')
        .in('status', KDS_STATUSES)
        .order('created_at', { ascending: true });
      setOrders((data as Order[]) ?? []);
      setLastRefresh(new Date());
    } catch {
      toast.error('Failed to load kitchen orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const advanceStatus = async (order: Order) => {
    const next = nextStatus[order.status];
    if (!next) return;
    const { error } = await supabase
      .from('orders')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(`Order marked as ${next}`);
    fetchOrders();
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const preparingOrders = orders.filter(o => o.status === 'preparing');

  const OrderCard = ({ order }: { order: Order }) => {
    const cfg = statusConfig[order.status];
    const Icon = cfg.icon;
    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    return (
      <div className={`border-2 rounded-xl p-5 ${cfg.bg}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="font-mono text-xs text-gray-400">#{order.id.slice(0, 8)}</span>
            <p className="font-bold text-gray-800">
              {getTableNumber(order.table)}
            </p>
          </div>
          <div className="text-right">
            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${cfg.badge}`}>
              <Icon size={12} /> {cfg.label}
            </span>
            <p className="text-xs text-gray-400 mt-1">{elapsed}m ago</p>
          </div>
        </div>

        {order.order_items && (
          <ul className="space-y-1 mb-4">
            {order.order_items.map(item => (
              <li key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.menu_item?.name ?? 'Item'}</span>
                <span className="font-semibold text-gray-900">×{item.quantity}</span>
              </li>
            ))}
          </ul>
        )}

        {order.notes && (
          <p className="text-xs text-gray-500 bg-white/60 rounded p-2 mb-3">📝 {order.notes}</p>
        )}

        {nextStatus[order.status] && (
          <button
            onClick={() => advanceStatus(order)}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Mark as {nextStatus[order.status]}
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kitchen Display</h1>
          <p className="text-sm text-gray-400 mt-0.5">Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s</p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ChefHat size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-lg">No active orders</p>
          <p className="text-gray-300 text-sm">Kitchen is clear!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending column */}
          <div>
            <h2 className="text-lg font-semibold text-yellow-700 mb-4 flex items-center gap-2">
              <Clock size={20} /> Pending ({pendingOrders.length})
            </h2>
            <div className="space-y-4">
              {pendingOrders.map(order => <OrderCard key={order.id} order={order} />)}
              {pendingOrders.length === 0 && <p className="text-gray-400 text-sm">No pending orders</p>}
            </div>
          </div>

          {/* Preparing column */}
          <div>
            <h2 className="text-lg font-semibold text-blue-700 mb-4 flex items-center gap-2">
              <ChefHat size={20} /> Preparing ({preparingOrders.length})
            </h2>
            <div className="space-y-4">
              {preparingOrders.map(order => <OrderCard key={order.id} order={order} />)}
              {preparingOrders.length === 0 && <p className="text-gray-400 text-sm">No orders being prepared</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
