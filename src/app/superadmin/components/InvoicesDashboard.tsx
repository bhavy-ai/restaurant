'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search, Download, RefreshCw, Filter, AlertCircle, Loader2,
  Receipt, ChevronLeft, ChevronRight, X, Building2, CreditCard,
  TrendingUp, IndianRupee, Calendar, FileText, ExternalLink,
} from 'lucide-react';

interface Restaurant {
  id: string;
  name: string;
  plan: string;
  city?: string;
  is_active: boolean;
  created_at: string;
}

interface Plan {
  name: string;
  display_name: string;
  price_monthly: number;
}

interface Bill {
  id: string;
  bill_number: string;
  net_amount: number;
  gross_amount: number;
  gst_amount: number;
  discount_amt: number;
  payment_mode: string;
  status: string;
  settled_at: string | null;
  created_at: string;
  outlet: string;
  stripe_receipt_url: string | null;
  stripe_payment_intent_id: string | null;
  restaurant_id: string;
}

interface RestaurantInvoiceSummary {
  restaurant: Restaurant;
  plan: Plan | null;
  totalBills: number;
  totalRevenue: number;
  totalGst: number;
  settledBills: number;
  bills: Bill[];
}

const PAGE_SIZE = 10;

const PAYMENT_MODE_COLORS: Record<string, string> = {
  cash: 'bg-green-500/10 text-green-400 border-green-500/20',
  upi: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  card: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  split: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  online: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-green-500/15 text-green-400 border-green-500/20',
  growth: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  enterprise: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  free: 'bg-secondary text-muted-foreground border-border',
};

const STATUS_COLORS: Record<string, string> = {
  settled: 'bg-green-500/10 text-green-400 border-green-500/20',
  open: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  voided: 'bg-red-500/10 text-red-400 border-red-500/20',
  refunded: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function InvoicesDashboard() {
  const supabase = createClient();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected restaurant for drill-down
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantInvoiceSummary | null>(null);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billPage, setBillPage] = useState(0);
  const [totalBillCount, setTotalBillCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Summary stats
  const [platformStats, setPlatformStats] = useState({
    totalMRR: 0,
    totalRestaurants: 0,
    activeRestaurants: 0,
    totalBillsThisMonth: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: rData, error: rErr }, { data: pData, error: pErr }] = await Promise.all([
        supabase.from('restaurants').select('id, name, plan, city, is_active, created_at').order('created_at', { ascending: false }),
        supabase.from('plans').select('name, display_name, price_monthly').order('sort_order'),
      ]);
      if (rErr) throw rErr;
      if (pErr) throw pErr;

      const rList = rData || [];
      const pList = pData || [];
      setRestaurants(rList);
      setPlans(pList);

      // Compute MRR
      const planMap: Record<string, Plan> = {};
      pList.forEach((p: Plan) => { planMap[p.name] = p; });
      const mrr = rList.filter((r: Restaurant) => r.is_active).reduce((sum: number, r: Restaurant) => {
        return sum + (planMap[r.plan]?.price_monthly || 0);
      }, 0);

      // Bills this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count: billCount } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      setPlatformStats({
        totalMRR: mrr,
        totalRestaurants: rList.length,
        activeRestaurants: rList.filter((r: Restaurant) => r.is_active).length,
        totalBillsThisMonth: billCount || 0,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load invoice data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadRestaurantBills = useCallback(async (restaurantId: string, page: number) => {
    setBillsLoading(true);
    try {
      let query = supabase
        .from('bills')
        .select('*', { count: 'exact' })
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');

      const { data, count, error: err } = await query;
      if (err) throw err;

      // Aggregate totals (all bills, not just current page)
      const { data: allBills } = await supabase
        .from('bills')
        .select('net_amount, gst_amount, status')
        .eq('restaurant_id', restaurantId);

      const totalRevenue = (allBills || []).reduce((s: number, b: any) => s + (b.net_amount || 0), 0);
      const totalGst = (allBills || []).reduce((s: number, b: any) => s + (b.gst_amount || 0), 0);
      const settledBills = (allBills || []).filter((b: any) => b.status === 'settled').length;

      const restaurant = restaurants.find((r) => r.id === restaurantId)!;
      const plan = plans.find((p) => p.name === restaurant?.plan) || null;

      setSelectedRestaurant({
        restaurant,
        plan,
        totalBills: count || 0,
        totalRevenue,
        totalGst,
        settledBills,
        bills: data || [],
      });
      setTotalBillCount(count || 0);
    } catch {
      // silent
    } finally {
      setBillsLoading(false);
    }
  }, [supabase, restaurants, plans, filterDateFrom, filterDateTo]);

  const handleSelectRestaurant = (r: Restaurant) => {
    setBillPage(0);
    loadRestaurantBills(r.id, 0);
  };

  const handleBillPageChange = (newPage: number) => {
    if (!selectedRestaurant) return;
    setBillPage(newPage);
    loadRestaurantBills(selectedRestaurant.restaurant.id, newPage);
  };

  const handleExportCSV = async (restaurantId: string, restaurantName: string) => {
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return;

    const headers = ['Bill Number', 'Date', 'Outlet', 'Gross Amount', 'Discount', 'GST', 'Net Amount', 'Payment Mode', 'Status', 'Settled At', 'Stripe Receipt'];
    const rows = data.map((b: Bill) => [
      b.bill_number,
      fmtDate(b.created_at),
      b.outlet || '',
      b.gross_amount || 0,
      b.discount_amt || 0,
      b.gst_amount || 0,
      b.net_amount || 0,
      b.payment_mode || '',
      b.status || '',
      fmtDate(b.settled_at),
      b.stripe_receipt_url || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_${restaurantName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllCSV = async () => {
    const { data } = await supabase
      .from('bills')
      .select('*, restaurants(name, plan)')
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return;

    const headers = ['Restaurant', 'Plan', 'Bill Number', 'Date', 'Outlet', 'Gross Amount', 'Discount', 'GST', 'Net Amount', 'Payment Mode', 'Status', 'Settled At'];
    const rows = data.map((b: any) => [
      `"${(b.restaurants?.name || '').replace(/"/g, '""')}"`,
      b.restaurants?.plan || '',
      b.bill_number,
      fmtDate(b.created_at),
      b.outlet || '',
      b.gross_amount || 0,
      b.discount_amt || 0,
      b.gst_amount || 0,
      b.net_amount || 0,
      b.payment_mode || '',
      b.status || '',
      fmtDate(b.settled_at),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch('');
    setFilterPlan('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasFilters = search || filterPlan || filterDateFrom || filterDateTo;

  const filteredRestaurants = restaurants.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.city?.toLowerCase().includes(search.toLowerCase());
    const matchPlan = !filterPlan || r.plan === filterPlan;
    return matchSearch && matchPlan;
  });

  const planMap: Record<string, Plan> = {};
  plans.forEach((p) => { planMap[p.name] = p; });

  const totalPages = Math.ceil(totalBillCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Receipt size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Invoices & Billing</h1>
            <p className="text-xs text-muted-foreground">Subscription charges, usage fees & payment history</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExportAllCSV}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Download size={13} />
            Export All
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Platform Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Monthly Recurring Revenue', value: fmt(platformStats.totalMRR), icon: <IndianRupee size={16} />, color: 'text-primary', sub: 'Active subscriptions' },
            { label: 'Total Restaurants', value: platformStats.totalRestaurants, icon: <Building2 size={16} />, color: 'text-blue-400', sub: `${platformStats.activeRestaurants} active` },
            { label: 'Bills This Month', value: platformStats.totalBillsThisMonth, icon: <FileText size={16} />, color: 'text-green-400', sub: 'Across all restaurants' },
            { label: 'Avg Revenue / Restaurant', value: platformStats.activeRestaurants > 0 ? fmt(platformStats.totalMRR / platformStats.activeRestaurants) : '₹0', icon: <TrendingUp size={16} />, color: 'text-purple-400', sub: 'Per active restaurant' },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <div className={`${s.color} mb-2`}>{s.icon}</div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{s.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Restaurant List */}
          <div className="flex-1 min-w-0">
            {/* Filters */}
            <div className="bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Filter size={12} />
                Filter Restaurants
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto flex items-center gap-1 text-primary hover:text-primary/80 normal-case tracking-normal font-medium transition-colors"
                  >
                    <X size={11} />
                    Clear all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative sm:col-span-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by restaurant or city…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                >
                  <option value="">All Plans</option>
                  {plans.map((p) => (
                    <option key={p.name} value={p.name}>{p.display_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : filteredRestaurants.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No restaurants found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRestaurants.map((r) => {
                  const plan = planMap[r.plan];
                  const isSelected = selectedRestaurant?.restaurant.id === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => handleSelectRestaurant(r)}
                      className={`bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary/40 ${
                        isSelected ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 size={15} className="text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[r.plan] || PLAN_COLORS.free}`}>
                                {plan?.display_name || r.plan}
                              </span>
                              {!r.is_active && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {r.city && <span className="text-xs text-muted-foreground">{r.city}</span>}
                              {plan && (
                                <span className="text-xs text-muted-foreground font-medium">
                                  {fmt(plan.price_monthly)}/mo
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                Since {fmtDate(r.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExportCSV(r.id, r.name); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Download receipts CSV"
                          >
                            <Download size={14} />
                          </button>
                          <CreditCard size={14} className="text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedRestaurant && (
            <div className="w-full lg:w-96 flex-shrink-0">
              <div className="bg-card border border-border rounded-xl overflow-hidden sticky top-6">
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">{selectedRestaurant.restaurant.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{selectedRestaurant.plan?.display_name || selectedRestaurant.restaurant.plan} Plan</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleExportCSV(selectedRestaurant.restaurant.id, selectedRestaurant.restaurant.name)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors border border-primary/20"
                    >
                      <Download size={11} />
                      CSV
                    </button>
                    <button
                      onClick={() => setSelectedRestaurant(null)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Subscription Info */}
                <div className="px-4 py-3 border-b border-border bg-secondary/30">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subscription</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-card border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground">Monthly Charge</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">
                        {selectedRestaurant.plan ? fmt(selectedRestaurant.plan.price_monthly) : '—'}
                      </p>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground">Plan</p>
                      <p className="text-sm font-bold text-foreground mt-0.5 capitalize">
                        {selectedRestaurant.plan?.display_name || selectedRestaurant.restaurant.plan}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Usage Summary */}
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Usage Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Total Bills', value: selectedRestaurant.totalBills },
                      { label: 'Settled', value: selectedRestaurant.settledBills },
                      { label: 'Total Revenue', value: fmt(selectedRestaurant.totalRevenue) },
                      { label: 'Total GST', value: fmt(selectedRestaurant.totalGst) },
                    ].map((s) => (
                      <div key={s.label} className="bg-secondary rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Date Filter for Bills */}
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <Calendar size={10} className="inline mr-1" />
                    Filter by Date
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => { setFilterDateFrom(e.target.value); setBillPage(0); }}
                      className="px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => { setFilterDateTo(e.target.value); setBillPage(0); }}
                      className="px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  {(filterDateFrom || filterDateTo) && (
                    <button
                      onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setBillPage(0); }}
                      className="mt-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      Clear date filter
                    </button>
                  )}
                </div>

                {/* Payment History */}
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Payment History ({totalBillCount})
                  </p>

                  {billsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={18} className="animate-spin text-primary" />
                    </div>
                  ) : selectedRestaurant.bills.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt size={24} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs">No bills found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedRestaurant.bills.map((bill) => (
                        <div key={bill.id} className="bg-secondary rounded-lg p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">{bill.bill_number}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${STATUS_COLORS[bill.status] || 'bg-secondary text-muted-foreground border-border'}`}>
                              {bill.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-foreground">{fmt(bill.net_amount || 0)}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase ${PAYMENT_MODE_COLORS[bill.payment_mode] || 'bg-secondary text-muted-foreground border-border'}`}>
                              {bill.payment_mode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{bill.outlet}</span>
                            <span>{fmtDate(bill.settled_at || bill.created_at)}</span>
                          </div>
                          {bill.gst_amount > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              GST: {fmt(bill.gst_amount)}
                            </div>
                          )}
                          {bill.stripe_receipt_url && (
                            <a
                              href={bill.stripe_receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                            >
                              <ExternalLink size={9} />
                              View Stripe Receipt
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <button
                        onClick={() => handleBillPageChange(billPage - 1)}
                        disabled={billPage === 0}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs text-muted-foreground">
                        Page {billPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => handleBillPageChange(billPage + 1)}
                        disabled={billPage >= totalPages - 1}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
