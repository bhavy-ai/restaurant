'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Globe, TrendingUp, Package, Users, IndianRupee, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type ReportView = 'sales' | 'stock' | 'staff';

const OUTLETS = [
  { id: 'koramangala', name: 'Koramangala', city: 'Bengaluru' },
  { id: 'indiranagar', name: 'Indiranagar', city: 'Bengaluru' },
  { id: 'whitefield', name: 'Whitefield', city: 'Bengaluru' },
];

interface OutletMetric {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  avgBill: number;
  growth: number;
  lowStock: number;
}

interface SalesComparison {
  period: string;
  [key: string]: number | string;
}

interface StockRow {
  item: string;
  reorder: number;
  [key: string]: number | string;
}

interface StaffRow {
  outlet: string;
  total: number;
  active: number;
  cashiers: number;
  captains: number;
  kitchen: number;
}

export default function MultiOutletClient() {
  const supabase = createClient();
  const [activeView, setActiveView] = useState<ReportView>('sales');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'mtd'>('7d');
  const [loading, setLoading] = useState(true);
  const [outletMetrics, setOutletMetrics] = useState<OutletMetric[]>([]);
  const [salesComparison, setSalesComparison] = useState<SalesComparison[]>([]);
  const [stockComparison, setStockComparison] = useState<StockRow[]>([]);
  const [staffComparison, setStaffComparison] = useState<StaffRow[]>([]);

  const getDateFilter = useCallback(() => {
    const now = new Date();
    if (dateRange === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    if (dateRange === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString(); }
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }, [dateRange]);

  const getPrevDateFilter = useCallback(() => {
    const now = new Date();
    if (dateRange === '7d') { const d = new Date(now); d.setDate(d.getDate() - 14); return d.toISOString(); }
    if (dateRange === '30d') { const d = new Date(now); d.setDate(d.getDate() - 60); return d.toISOString(); }
    const d = new Date(now); d.setMonth(d.getMonth() - 1); d.setDate(1); return d.toISOString();
  }, [dateRange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = getDateFilter();
      const prevSince = getPrevDateFilter();

      // ── Bills per outlet (net_amount = actual revenue) ─────
      const [billsRes, prevBillsRes, ingredientsRes, staffRes] = await Promise.all([
        supabase.from('bills').select('outlet, net_amount, gross_amount, created_at, status')
          .gte('created_at', since)
          .in('status', ['settled', 'open']),
        supabase.from('bills').select('outlet, net_amount')
          .gte('created_at', prevSince)
          .lt('created_at', since)
          .in('status', ['settled', 'open']),
        supabase.from('ingredients').select('outlet, name, current_stock, reorder_level'),
        supabase.from('staff_users').select('outlet, role, status'),
      ]);

      const billsData = billsRes.data || [];
      const prevBillsData = prevBillsRes.data || [];
      const ingredientsData = ingredientsRes.data || [];
      const staffData = staffRes.data || [];

      // ── Previous period revenue by outlet ─────────────────
      const prevByOutlet: Record<string, number> = {};
      prevBillsData.forEach((b: any) => {
        prevByOutlet[b.outlet] = (prevByOutlet[b.outlet] || 0) + Number(b.net_amount || 0);
      });

      // ── Build outlet metrics ───────────────────────────────
      const metrics: OutletMetric[] = OUTLETS.map(o => {
        const outletBills = billsData.filter((b: any) => b.outlet === o.id);
        const revenue = outletBills.reduce((s: number, b: any) => s + Number(b.net_amount || 0), 0);
        const orders = outletBills.length;
        const avgBill = orders ? Math.round(revenue / orders) : 0;
        const prevRevenue = prevByOutlet[o.id] || 0;
        const growth = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0;
        const outletIngredients = ingredientsData.filter((i: any) => i.outlet === o.id);
        const lowStock = outletIngredients.filter((i: any) => Number(i.current_stock) <= Number(i.reorder_level)).length;
        return { id: o.id, name: o.name, revenue, orders, avgBill, growth, lowStock };
      });
      setOutletMetrics(metrics);

      // ── Sales comparison by day of week ───────────────────
      const dayMap: Record<string, Record<string, number>> = {};
      billsData.forEach((b: any) => {
        const day = new Date(b.created_at).toLocaleDateString('en-IN', { weekday: 'short' });
        if (!dayMap[day]) dayMap[day] = {};
        dayMap[day][b.outlet] = (dayMap[day][b.outlet] || 0) + Number(b.net_amount || 0);
      });
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const salesComp: SalesComparison[] = days.map(d => {
        const row: SalesComparison = { period: d };
        OUTLETS.forEach(o => { row[o.id] = dayMap[d]?.[o.id] || 0; });
        return row;
      });
      setSalesComparison(salesComp);

      // ── Stock comparison across outlets ───────────────────
      const ingNames = [...new Set(ingredientsData.map((i: any) => i.name as string))].slice(0, 8);
      const stockRows: StockRow[] = ingNames.map(name => {
        const row: StockRow = { item: name, reorder: 0 };
        OUTLETS.forEach(o => {
          const match = ingredientsData.find((i: any) => i.outlet === o.id && i.name === name);
          row[o.id] = match ? Number(match.current_stock) : 0;
          if (match && Number(match.reorder_level) > 0) row.reorder = Number(match.reorder_level);
        });
        return row;
      });
      setStockComparison(stockRows);

      // ── Staff comparison ───────────────────────────────────
      const staffRows: StaffRow[] = OUTLETS.map(o => {
        const outletStaff = staffData.filter((s: any) => s.outlet === o.id);
        return {
          outlet: o.name,
          total: outletStaff.length,
          active: outletStaff.filter((s: any) => s.status === 'active').length,
          cashiers: outletStaff.filter((s: any) => s.role === 'cashier').length,
          captains: outletStaff.filter((s: any) => s.role === 'captain').length,
          kitchen: outletStaff.filter((s: any) => s.role === 'kitchen').length,
        };
      });
      setStaffComparison(staffRows);

    } catch (e: any) {
      console.error('Multi-outlet load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange, getDateFilter, getPrevDateFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalRevenue = outletMetrics.reduce((s, o) => s + o.revenue, 0);
  const totalOrders = outletMetrics.reduce((s, o) => s + o.orders, 0);
  const totalStaff = staffComparison.reduce((s, o) => s + o.total, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Globe size={22} className="text-primary" /> Multi-Outlet Reporting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cross-outlet sales, stock & staff comparison</p>
        </div>
        <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1">
          {(['7d', '30d', 'mtd'] as const).map(r => (
            <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dateRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'MTD'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Outlet Status Cards */}
          <div className="grid grid-cols-3 gap-4">
            {OUTLETS.map(outlet => {
              const metrics = outletMetrics.find(m => m.id === outlet.id);
              return (
                <div key={outlet.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{outlet.name}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-accent/15 text-accent border-accent/30">open</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{outlet.city}</p>
                  {metrics && (
                    <>
                      <p className="text-xl font-bold text-foreground">₹{metrics.revenue.toLocaleString('en-IN')}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {metrics.growth >= 0 ? <ArrowUpRight size={12} className="text-accent" /> : <ArrowDownRight size={12} className="text-red-400" />}
                        <span className={`text-xs font-medium ${metrics.growth >= 0 ? 'text-accent' : 'text-red-400'}`}>{Math.abs(metrics.growth)}%</span>
                        <span className="text-xs text-muted-foreground">vs prev period</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Combined Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: <IndianRupee size={16} />, color: 'text-primary' },
              { label: 'Total Orders', value: totalOrders, icon: <BarChart3 size={16} />, color: 'text-accent' },
              { label: 'Active Outlets', value: OUTLETS.length, icon: <Globe size={16} />, color: 'text-blue-400' },
              { label: 'Total Staff', value: totalStaff, icon: <Users size={16} />, color: 'text-purple-400' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
                <div className={`mb-2 ${kpi.color}`}>{kpi.icon}</div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* View Tabs */}
          <div className="flex gap-1 bg-secondary border border-border rounded-xl p-1 w-fit">
            {([
              { id: 'sales', label: 'Sales Comparison', icon: <TrendingUp size={14} /> },
              { id: 'stock', label: 'Stock Levels', icon: <Package size={14} /> },
              { id: 'staff', label: 'Staff Overview', icon: <Users size={14} /> },
            ] as { id: ReportView; label: string; icon: React.ReactNode }[]).map(tab => (
              <button key={tab.id} onClick={() => setActiveView(tab.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeView === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Sales Comparison Chart */}
          {activeView === 'sales' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Daily Revenue by Outlet</h3>
                {salesComparison.every(d => OUTLETS.every(o => (d[o.id] as number) === 0)) ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No sales data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Legend />
                      <Bar dataKey="koramangala" name="Koramangala" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="indiranagar" name="Indiranagar" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="whitefield" name="Whitefield" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border"><h3 className="text-sm font-semibold text-foreground">Outlet Performance Table</h3></div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Outlet', 'Revenue', 'Orders', 'Avg Bill', 'Growth', 'Low Stock'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {outletMetrics.map(o => (
                      <tr key={o.id} className="hover:bg-secondary/20">
                        <td className="px-5 py-3 text-sm font-medium text-foreground">{o.name}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-foreground">₹{o.revenue.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm text-foreground">{o.orders}</td>
                        <td className="px-5 py-3 text-sm text-foreground">₹{o.avgBill}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium flex items-center gap-1 ${o.growth >= 0 ? 'text-accent' : 'text-red-400'}`}>
                            {o.growth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(o.growth)}%
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${o.lowStock > 2 ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-accent/15 text-accent border-accent/30'}`}>
                            {o.lowStock} items
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Comparison */}
          {activeView === 'stock' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border"><h3 className="text-sm font-semibold text-foreground">Stock Levels Across Outlets</h3></div>
              {stockComparison.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No stock data available</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Ingredient', ...OUTLETS.map(o => o.name), 'Reorder Level'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stockComparison.map(s => (
                      <tr key={s.item} className="hover:bg-secondary/20">
                        <td className="px-5 py-3 text-sm font-medium text-foreground">{s.item}</td>
                        {OUTLETS.map(outlet => (
                          <td key={outlet.id} className="px-5 py-3">
                            <span className={`text-sm font-medium ${Number(s[outlet.id]) <= s.reorder ? 'text-red-400' : 'text-foreground'}`}>
                              {Number(s[outlet.id]).toFixed(1)}
                            </span>
                            {Number(s[outlet.id]) <= s.reorder && (
                              <span className="ml-2 text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">Low</span>
                            )}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-sm text-muted-foreground">{s.reorder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Staff Overview */}
          {activeView === 'staff' && (
            <div className="grid grid-cols-3 gap-4">
              {staffComparison.map(outlet => (
                <div key={outlet.outlet} className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">{outlet.outlet}</h3>
                  {outlet.total === 0 ? (
                    <p className="text-xs text-muted-foreground">No staff records for this outlet</p>
                  ) : (
                    <div className="space-y-3">
                      {[
                        { label: 'Total Staff', value: outlet.total, color: 'bg-primary' },
                        { label: 'Active Today', value: outlet.active, color: 'bg-accent' },
                        { label: 'Cashiers', value: outlet.cashiers, color: 'bg-blue-500' },
                        { label: 'Captains', value: outlet.captains, color: 'bg-purple-500' },
                        { label: 'Kitchen', value: outlet.kitchen, color: 'bg-amber-500' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{row.label}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${row.color}`} style={{ width: `${outlet.total > 0 ? (row.value / outlet.total) * 100 : 0}%` }} />
                            </div>
                            <span className="text-sm font-semibold text-foreground w-4 text-right">{row.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
