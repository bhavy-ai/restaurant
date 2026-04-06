'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BarChart3, TrendingUp, IndianRupee, ShoppingBag, Users, FileText, Download, Calendar, AlertTriangle, RefreshCw, CheckCircle, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';

type ReportTab = 'sales' | 'gst' | 'cashier' | 'void' | 'category' | 'cross-restaurant';

interface SalesSummary {
  date: string;
  revenue: number;
  orders: number;
  avgBill: number;
}

interface CategorySale {
  category: string;
  revenue: number;
  orders: number;
}

interface GstRow {
  rate: string;
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
  gross: number;
}

interface CashierRow {
  name: string;
  bills: number;
  revenue: number;
  voids: number;
  avgBill: number;
}

interface VoidRow {
  billNo: string;
  cashier: string;
  amount: number;
  reason: string;
  time: string;
}

interface CrossRestaurantRow {
  restaurantId: string;
  restaurantName: string;
  revenue: number;
  orders: number;
  avgBill: number;
  gst: number;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsClient() {
  const supabase = createClient();
  const { activeRestaurant, accessibleRestaurants } = useAuth();
  const isMultiRestaurant = accessibleRestaurants.length > 1;

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesData, setSalesData] = useState<SalesSummary[]>([]);
  const [categoryData, setCategoryData] = useState<CategorySale[]>([]);
  const [gstData, setGstData] = useState<GstRow[]>([]);
  const [cashierData, setCashierData] = useState<CashierRow[]>([]);
  const [voidData, setVoidData] = useState<VoidRow[]>([]);
  const [crossRestaurantData, setCrossRestaurantData] = useState<CrossRestaurantRow[]>([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalOrders: 0, avgBill: 0, gstCollected: 0, voidCount: 0, cashierCount: 0 });

  const getDateFilter = useCallback(() => {
    const now = new Date();
    if (dateRange === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (dateRange === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString();
  }, [dateRange]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = getDateFilter();
      const restaurantId = activeRestaurant?.id;

      // ── Bills ──
      let billsQuery = supabase
        .from('bills')
        .select('id, bill_number, net_amount, gross_amount, gst_amount, discount_amt, status, created_at, cashier, restaurant_id, outlet')
        .gte('created_at', since)
        .order('created_at');

      if (restaurantId) {
        billsQuery = billsQuery.eq('restaurant_id', restaurantId);
      } else {
        billsQuery = billsQuery.eq('outlet', 'koramangala');
      }

      const { data: bills, error: billsError } = await billsQuery;
      if (billsError) throw new Error(billsError.message);

      const billsData = bills || [];
      const activeBills = billsData.filter((b: any) => b.status === 'settled' || b.status === 'open');
      const voidedBills = billsData.filter((b: any) => b.status === 'voided' || b.status === 'refunded');

      const totalRevenue = activeBills.reduce((s: number, b: any) => s + Number(b.net_amount || 0), 0);
      const totalOrders = activeBills.length;
      const gstCollected = activeBills.reduce((s: number, b: any) => s + Number(b.gst_amount || 0), 0);
      const cashierSet = new Set(billsData.map((b: any) => b.cashier).filter(Boolean));

      setSummary({
        totalRevenue,
        totalOrders,
        avgBill: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        gstCollected,
        voidCount: voidedBills.length,
        cashierCount: cashierSet.size,
      });

      // ── Sales by date ──
      const byDate: Record<string, { revenue: number; orders: number }> = {};
      activeBills.forEach((b: any) => {
        const date = new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        if (!byDate[date]) byDate[date] = { revenue: 0, orders: 0 };
        byDate[date].revenue += Number(b.net_amount || 0);
        byDate[date].orders += 1;
      });
      setSalesData(Object.entries(byDate).map(([date, v]) => ({
        date, revenue: v.revenue, orders: v.orders, avgBill: v.orders > 0 ? v.revenue / v.orders : 0,
      })));

      // ── Category breakdown ──
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('name, price, qty, menu_item_id')
        .gte('created_at', since);

      let menuQuery = supabase.from('menu_items').select('id, category');
      if (restaurantId) {
        menuQuery = menuQuery.eq('restaurant_id', restaurantId);
      } else {
        menuQuery = menuQuery.eq('outlet', 'koramangala');
      }
      const { data: menuItemsData } = await menuQuery;

      const menuCatMap: Record<string, string> = {};
      (menuItemsData || []).forEach((m: any) => { menuCatMap[m.id] = m.category || 'General'; });

      const byCat: Record<string, { revenue: number; orders: number }> = {};
      (orderItems || []).forEach((i: any) => {
        const cat = (i.menu_item_id && menuCatMap[i.menu_item_id]) ? menuCatMap[i.menu_item_id] : 'General';
        if (!byCat[cat]) byCat[cat] = { revenue: 0, orders: 0 };
        byCat[cat].revenue += Number(i.price || 0) * Number(i.qty || 0);
        byCat[cat].orders += Number(i.qty || 0);
      });
      setCategoryData(Object.entries(byCat).map(([category, v]) => ({ category, ...v })));

      // ── GST breakdown ──
      let menuGstQuery = supabase.from('menu_items').select('id, gst_rate');
      if (restaurantId) {
        menuGstQuery = menuGstQuery.eq('restaurant_id', restaurantId);
      } else {
        menuGstQuery = menuGstQuery.eq('outlet', 'koramangala');
      }
      const { data: menuItemsGst } = await menuGstQuery;

      const menuGstMap: Record<string, number> = {};
      (menuItemsGst || []).forEach((m: any) => { menuGstMap[m.id] = Number(m.gst_rate || 5); });

      const gstByRate: Record<number, { taxable: number }> = {};
      (orderItems || []).forEach((i: any) => {
        const rate = (i.menu_item_id && menuGstMap[i.menu_item_id]) ? menuGstMap[i.menu_item_id] : 5;
        const lineTotal = Number(i.price || 0) * Number(i.qty || 0);
        if (!gstByRate[rate]) gstByRate[rate] = { taxable: 0 };
        gstByRate[rate].taxable += lineTotal;
      });

      let gstRows: GstRow[] = Object.entries(gstByRate)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([rateStr, v]) => {
          const rate = Number(rateStr);
          const gstAmt = Math.round(v.taxable * rate / 100);
          return {
            rate: `${rate}%`,
            taxable: Math.round(v.taxable),
            cgst: Math.round(gstAmt / 2),
            sgst: Math.round(gstAmt / 2),
            total: gstAmt,
            gross: Math.round(v.taxable) + gstAmt,
          };
        });

      if (gstRows.length === 0 && activeBills.length > 0) {
        const totalGross = activeBills.reduce((s: number, b: any) => s + Number(b.gross_amount || 0), 0);
        gstRows = [{
          rate: '5%',
          taxable: Math.round(totalGross - gstCollected),
          cgst: Math.round(gstCollected / 2),
          sgst: Math.round(gstCollected / 2),
          total: Math.round(gstCollected),
          gross: Math.round(totalGross),
        }];
      }
      setGstData(gstRows);

      // ── Cashier performance ──
      const cashierMap: Record<string, { bills: number; revenue: number; voids: number }> = {};
      billsData.forEach((b: any) => {
        const name = b.cashier || 'Unknown';
        if (!cashierMap[name]) cashierMap[name] = { bills: 0, revenue: 0, voids: 0 };
        if (b.status === 'voided' || b.status === 'refunded') {
          cashierMap[name].voids += 1;
        } else {
          cashierMap[name].bills += 1;
          cashierMap[name].revenue += Number(b.net_amount || 0);
        }
      });
      const cashierRows: CashierRow[] = Object.entries(cashierMap).map(([name, v]) => ({
        name,
        bills: v.bills,
        revenue: v.revenue,
        voids: v.voids,
        avgBill: v.bills > 0 ? Math.round(v.revenue / v.bills) : 0,
      })).sort((a, b) => b.revenue - a.revenue);
      setCashierData(cashierRows);

      // ── Void / refunded bills ──
      let auditQuery = supabase
        .from('audit_logs')
        .select('entity, details, created_at')
        .eq('action', 'BILL_VOID')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (restaurantId) {
        auditQuery = auditQuery.eq('restaurant_id', restaurantId);
      } else {
        auditQuery = auditQuery.eq('outlet', 'koramangala');
      }
      const { data: auditLogs } = await auditQuery;

      const auditMap: Record<string, string> = {};
      (auditLogs || []).forEach((a: any) => {
        const billNo = a.entity?.replace('Bill ', '') || '';
        if (billNo) auditMap[billNo] = a.details || 'Not specified';
      });

      const voidRows: VoidRow[] = voidedBills.map((b: any) => ({
        billNo: b.bill_number || b.id?.slice(0, 8) || '—',
        cashier: b.cashier || '—',
        amount: Number(b.net_amount || b.gross_amount || 0),
        reason: auditMap[b.bill_number] || 'Not specified',
        time: b.created_at ? new Date(b.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—',
      }));
      setVoidData(voidRows);

      // ── Cross-restaurant aggregation (owner only) ──
      if (isMultiRestaurant && accessibleRestaurants.length > 0) {
        const restaurantIds = accessibleRestaurants.map((r) => r.id);
        const { data: crossBills } = await supabase
          .from('bills')
          .select('restaurant_id, net_amount, gst_amount, status')
          .in('restaurant_id', restaurantIds)
          .gte('created_at', since)
          .in('status', ['settled', 'open']);

        const crossMap: Record<string, { revenue: number; orders: number; gst: number }> = {};
        (crossBills || []).forEach((b: any) => {
          const rid = b.restaurant_id;
          if (!crossMap[rid]) crossMap[rid] = { revenue: 0, orders: 0, gst: 0 };
          crossMap[rid].revenue += Number(b.net_amount || 0);
          crossMap[rid].orders += 1;
          crossMap[rid].gst += Number(b.gst_amount || 0);
        });

        const crossRows: CrossRestaurantRow[] = accessibleRestaurants.map((r) => {
          const m = crossMap[r.id] || { revenue: 0, orders: 0, gst: 0 };
          return {
            restaurantId: r.id,
            restaurantName: r.name,
            revenue: m.revenue,
            orders: m.orders,
            avgBill: m.orders > 0 ? Math.round(m.revenue / m.orders) : 0,
            gst: m.gst,
          };
        }).sort((a, b) => b.revenue - a.revenue);
        setCrossRestaurantData(crossRows);
      }

    } catch (e: any) {
      console.error('Reports load error:', e.message);
      setError(e.message || 'Failed to load reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, getDateFilter, activeRestaurant, accessibleRestaurants, isMultiRestaurant]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'sales', label: 'Sales Report', icon: <TrendingUp size={14} /> },
    { id: 'category', label: 'Category', icon: <BarChart3 size={14} /> },
    { id: 'gst', label: 'GST Report', icon: <FileText size={14} /> },
    { id: 'cashier', label: 'Cashier Report', icon: <Users size={14} /> },
    { id: 'void', label: 'Void / Cancel', icon: <ShoppingBag size={14} /> },
    ...(isMultiRestaurant ? [{ id: 'cross-restaurant' as ReportTab, label: 'All Restaurants', icon: <Building2 size={14} /> }] : []),
  ];

  const gstTotals = gstData.reduce((acc, r) => ({
    taxable: acc.taxable + r.taxable,
    cgst: acc.cgst + r.cgst,
    sgst: acc.sgst + r.sgst,
    total: acc.total + r.total,
    gross: acc.gross + r.gross,
  }), { taxable: 0, cgst: 0, sgst: 0, total: 0, gross: 0 });

  const maxCashierBills = cashierData.length > 0 ? Math.max(...cashierData.map(c => c.bills), 1) : 1;
  const totalCashierBills = cashierData.reduce((s, c) => s + c.bills, 0) || 1;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Failed to load reports</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
        <button
          onClick={loadReports}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={22} className="text-primary" /> Reporting & Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeRestaurant ? `${activeRestaurant.name} — ` : ''}Sales, GST, cashier performance & void analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1">
            {(['today', '7d', '30d'] as const).map(r => (
              <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dateRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-4">
        {[
          { label: 'Total Revenue', value: `₹${(summary.totalRevenue || 0).toLocaleString('en-IN')}`, icon: <IndianRupee size={16} />, color: 'text-primary' },
          { label: 'Total Orders', value: summary.totalOrders ?? 0, icon: <ShoppingBag size={16} />, color: 'text-accent' },
          { label: 'Avg Bill Value', value: `₹${Math.round(summary.avgBill || 0)}`, icon: <TrendingUp size={16} />, color: 'text-blue-400' },
          { label: 'GST Collected', value: `₹${(summary.gstCollected || 0).toLocaleString('en-IN')}`, icon: <FileText size={16} />, color: 'text-amber-400' },
          { label: 'Void / Cancel', value: summary.voidCount ?? 0, icon: <Calendar size={16} />, color: 'text-red-400' },
          { label: 'Active Cashiers', value: summary.cashierCount ?? 0, icon: <Users size={16} />, color: 'text-purple-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`mb-2 ${kpi.color}`}>{kpi.icon}</div>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary border border-border rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading report data…</p>
        </div>
      ) : (
        <>
          {activeTab === 'sales' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Revenue Trend</h3>
                {salesData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                    <TrendingUp size={32} className="opacity-30" />
                    <p className="text-sm">No sales data for this period</p>
                    <p className="text-xs opacity-60">Try selecting a wider date range</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [`₹${(v || 0).toLocaleString('en-IN')}`, 'Revenue']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Orders per Day</h3>
                {salesData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                    <BarChart3 size={32} className="opacity-30" />
                    <p className="text-sm">No data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="orders" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {activeTab === 'category' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Revenue by Category</h3>
                {categoryData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                    <BarChart3 size={32} className="opacity-30" />
                    <p className="text-sm">No category data for this period</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`₹${(v || 0).toLocaleString('en-IN')}`, 'Revenue']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Category Breakdown</h3>
                {categoryData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                    <FileText size={32} className="opacity-30" />
                    <p className="text-sm">No data</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryData.map((c, i) => {
                      const maxRevenue = Math.max(...categoryData.map(x => x.revenue), 1);
                      return (
                        <div key={c.category}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-foreground font-medium">{c.category}</span>
                            <span className="text-foreground">₹{(c.revenue || 0).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(c.revenue / maxRevenue) * 100}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.orders} items sold</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'gst' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">GST Summary Report</h3>
                <button className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"><Download size={12} /> Download GSTR-1</button>
              </div>
              {gstData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <FileText size={32} className="opacity-30" />
                  <p className="text-sm">No GST data for this period</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['GST Rate', 'Taxable Amount', 'CGST', 'SGST', 'Total GST', 'Gross Amount'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {gstData.map(row => (
                      <tr key={row.rate} className="hover:bg-secondary/20">
                        <td className="px-5 py-3 text-sm font-medium text-foreground">{row.rate}</td>
                        <td className="px-5 py-3 text-sm text-foreground">₹{(row.taxable || 0).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm text-foreground">₹{(row.cgst || 0).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm text-foreground">₹{(row.sgst || 0).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-amber-400">₹{(row.total || 0).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-foreground">₹{(row.gross || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    <tr className="bg-secondary/40 font-semibold">
                      <td className="px-5 py-3 text-sm text-foreground">Total</td>
                      <td className="px-5 py-3 text-sm text-foreground">₹{gstTotals.taxable.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3 text-sm text-foreground">₹{gstTotals.cgst.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3 text-sm text-foreground">₹{gstTotals.sgst.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3 text-sm text-amber-400">₹{gstTotals.total.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3 text-sm text-foreground">₹{gstTotals.gross.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'cashier' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border"><h3 className="text-sm font-semibold text-foreground">Cashier Performance</h3></div>
              {cashierData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Users size={32} className="opacity-30" />
                  <p className="text-sm">No cashier data for this period</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Cashier', 'Bills Processed', 'Revenue', 'Avg Bill', 'Voids', 'Performance'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cashierData.map(c => (
                      <tr key={c.name} className="hover:bg-secondary/20">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{(c.name || '?')[0].toUpperCase()}</div>
                            <span className="text-sm font-medium text-foreground">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-foreground">{c.bills}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-foreground">₹{(c.revenue || 0).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm text-foreground">₹{c.avgBill}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${c.voids > 1 ? 'bg-red-500/15 text-red-400' : 'bg-accent/15 text-accent'}`}>{c.voids}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${(c.bills / maxCashierBills) * 100}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{Math.round((c.bills / totalCashierBills) * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'void' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Void & Cancelled Bills</h3>
                <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">{voidData.length} voids</span>
              </div>
              {voidData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <CheckCircle size={32} className="opacity-30 text-accent" />
                  <p className="text-sm">No void or cancelled bills</p>
                  <p className="text-xs opacity-60">Great — no voids recorded for this period</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Bill No', 'Cashier', 'Amount', 'Reason', 'Time'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {voidData.map((v, i) => (
                      <tr key={`${v.billNo}-${i}`} className="hover:bg-secondary/20">
                        <td className="px-5 py-3 text-sm font-mono text-foreground">{v.billNo}</td>
                        <td className="px-5 py-3 text-sm text-foreground">{v.cashier}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-red-400">₹{v.amount}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{v.reason}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{v.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'cross-restaurant' && isMultiRestaurant && (
            <div className="space-y-6">
              {/* Cross-restaurant chart */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Building2 size={16} className="text-primary" /> Revenue Across All Restaurants
                </h3>
                {crossRestaurantData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                    <Building2 size={32} className="opacity-30" />
                    <p className="text-sm">No cross-restaurant data for this period</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={crossRestaurantData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="restaurantName" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [`₹${(v || 0).toLocaleString('en-IN')}`, 'Revenue']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Cross-restaurant table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Restaurant Performance Comparison</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Restaurant', 'Revenue', 'Orders', 'Avg Bill', 'GST Collected', 'Share'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {crossRestaurantData.map((r, i) => {
                      const totalCrossRevenue = crossRestaurantData.reduce((s, x) => s + x.revenue, 0) || 1;
                      const share = Math.round((r.revenue / totalCrossRevenue) * 100);
                      return (
                        <tr key={r.restaurantId} className={`hover:bg-secondary/20 ${r.restaurantId === activeRestaurant?.id ? 'bg-primary/5' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${COLORS[i % COLORS.length]}20` }}>
                                <Building2 size={13} style={{ color: COLORS[i % COLORS.length] }} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{r.restaurantName}</p>
                                {r.restaurantId === activeRestaurant?.id && (
                                  <p className="text-[10px] text-primary">Active</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-sm font-semibold text-foreground">₹{(r.revenue || 0).toLocaleString('en-IN')}</td>
                          <td className="px-5 py-3 text-sm text-foreground">{r.orders}</td>
                          <td className="px-5 py-3 text-sm text-foreground">₹{r.avgBill}</td>
                          <td className="px-5 py-3 text-sm text-amber-400">₹{(r.gst || 0).toLocaleString('en-IN')}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${share}%`, background: COLORS[i % COLORS.length] }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">{share}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
