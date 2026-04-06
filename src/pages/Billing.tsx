import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../types';
import { getTableNumber } from '../lib/utils';
import toast from 'react-hot-toast';
import { Receipt, CheckCircle } from 'lucide-react';

const BILLING_STATUSES = ['ready', 'served'];

export default function Billing() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, table:tables(table_number), order_items(*, menu_item:menu_items(name, price))')
        .in('status', BILLING_STATUSES)
        .order('created_at', { ascending: true });
      setOrders((data as Order[]) ?? []);
    } catch {
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const markPaid = async (order: Order) => {
    setPaying(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;

      if (order.table_id) {
        await supabase.from('tables').update({ status: 'available' }).eq('id', order.table_id);
      }

      toast.success('Payment recorded!');
      fetchOrders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as paid');
    } finally {
      setPaying(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Receipt className="text-orange-500" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle size={48} className="mx-auto text-green-300 mb-3" />
          <p className="text-gray-400 text-lg">All settled!</p>
          <p className="text-gray-300 text-sm">No orders awaiting payment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-orange-50 px-5 py-4 border-b border-orange-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs text-gray-400">#{order.id.slice(0, 8)}</p>
                    <p className="font-bold text-gray-800 text-lg">
                      {getTableNumber(order.table)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${order.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                    {order.status}
                  </span>
                </div>
              </div>

              <div className="p-5">
                {order.order_items && order.order_items.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {order.order_items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.menu_item?.name ?? 'Item'} × {item.quantity}</span>
                        <span className="text-gray-800">${(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t border-dashed pt-2 mt-2 flex justify-between font-bold text-gray-900">
                      <span>Total</span>
                      <span className="text-orange-500 text-lg">${order.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between font-bold text-gray-900 mb-4">
                    <span>Total</span>
                    <span className="text-orange-500 text-lg">${order.total_amount.toFixed(2)}</span>
                  </div>
                )}

                <button
                  onClick={() => markPaid(order)}
                  disabled={paying === order.id}
                  className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={18} />
                  {paying === order.id ? 'Processing...' : 'Mark as Paid'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
