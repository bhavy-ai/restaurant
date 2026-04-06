import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Order } from '../types';
import { getTableNumber } from '../lib/utils';
import { ShoppingBag, DollarSign, Users, Clock } from 'lucide-react';

interface Stats {
  todayOrders: number;
  todayRevenue: number;
  availableTables: number;
  pendingOrders: number;
}

function StatCard({ title, value, icon: Icon, color }: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
      <div className={`p-3 rounded-full ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  served: 'bg-purple-100 text-purple-800',
  paid: 'bg-gray-100 text-gray-800',
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ todayOrders: 0, todayRevenue: 0, availableTables: 0, pendingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [ordersRes, tablesRes, recentRes] = await Promise.all([
          supabase
            .from('orders')
            .select('*')
            .gte('created_at', today.toISOString()),
          supabase
            .from('tables')
            .select('*')
            .eq('status', 'available'),
          supabase
            .from('orders')
            .select('*, table:tables(table_number)')
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        const todayOrders = ordersRes.data ?? [];
        const revenue = todayOrders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0);
        const pending = todayOrders.filter(o => o.status === 'pending').length;

        setStats({
          todayOrders: todayOrders.length,
          todayRevenue: revenue,
          availableTables: tablesRes.data?.length ?? 0,
          pendingOrders: pending,
        });

        setRecentOrders((recentRes.data as Order[]) ?? []);
      } catch {
        // Gracefully show zeros if Supabase is not configured
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard title="Today's Orders" value={stats.todayOrders} icon={ShoppingBag} color="bg-orange-500" />
        <StatCard title="Today's Revenue" value={`$${stats.todayRevenue.toFixed(2)}`} icon={DollarSign} color="bg-green-500" />
        <StatCard title="Available Tables" value={stats.availableTables} icon={Users} color="bg-blue-500" />
        <StatCard title="Pending Orders" value={stats.pendingOrders} icon={Clock} color="bg-yellow-500" />
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : recentOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No orders yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Order ID</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Table</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Total</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">#{order.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 text-gray-700">
                      {getTableNumber(order.table)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[order.status] ?? ''}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">${order.total_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-400">{new Date(order.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
