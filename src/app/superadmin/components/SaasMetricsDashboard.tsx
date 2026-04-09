'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { TrendingUp, TrendingDown, Users, DollarSign, BarChart2, RefreshCw, Loader2 } from 'lucide-react';

interface MonthlyMetric {
  month: string;
  mrr: number;
  newRevenue: number;
  churnedRevenue: number;
  churnRate: number;
  arpu: number;
  activeRestaurants: number;
  forecast: number;
}

interface PlanDist {
  name: string;
  value: number;
  color: string;
}

const PLAN_PRICES: Record<string, number> = {
  starter: 999,
  growth: 2499,
  enterprise: 4999,
  free: 0,
};

const PLAN_COLORS: Record<string, string> = {
  starter: '#6366f1',
  growth: '#22c55e',
  enterprise: '#f59e0b',
  free: '#94a3b8',
};

const supabase = createClient();

function formatINR(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val}`;
}

function StatCard({
  label, value, sub, icon, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && (
          <p className={`text-xs mt-0.5 flex items-center gap-1 ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
            {trend === 'up' && <TrendingUp size={11} />}
            {trend === 'down' && <TrendingDown size={11} />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SaasMetricsDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MonthlyMetric[]>([]);
  const [planDist, setPlanDist] = useState<PlanDist[]>([]);
  const [summary, setSummary] = useState({
    currentMRR: 0,
    mrrGrowth: 0,
    avgChurn: 0,
    currentARPU: 0,
    arpuGrowth: 0,
    totalActive: 0,
  });

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all restaurants with plan and created_at
      const { data: restaurants } = await supabase
        .from('restaurants')
        .select('id, plan, is_active, created_at')
        .order('created_at', { ascending: true });

      if (!restaurants) return;

      // Fetch subscription invoices for revenue data
      const { data: invoices } = await supabase
        .from('subscription_invoices')
        .select('restaurant_id, billing_month, total_amount, status, created_at')
        .order('billing_month', { ascending: true });

      // Build monthly metrics for last 6 months
      const now = new Date();
      const monthsData: MonthlyMetric[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });

        // Active restaurants at end of this month
        const activeAtMonth = restaurants.filter((r) => {
          const created = new Date(r.created_at);
          return created <= new Date(d.getFullYear(), d.getMonth() + 1, 0) && r.is_active;
        });

        // MRR from plan prices
        const mrr = activeAtMonth.reduce((sum, r) => sum + (PLAN_PRICES[r.plan] || 0), 0);

        // Revenue from invoices this month
        const monthInvoices = (invoices || []).filter((inv) => inv.billing_month?.startsWith(monthKey));
        const invoiceRevenue = monthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

        // New restaurants this month
        const newThisMonth = restaurants.filter((r) => {
          const created = new Date(r.created_at);
          return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
        });
        const newRevenue = newThisMonth.reduce((sum, r) => sum + (PLAN_PRICES[r.plan] || 0), 0);

        // Churn: restaurants that became inactive (approximate from previous month)
        const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        const prevActive = restaurants.filter((r) => {
          const created = new Date(r.created_at);
          return created <= new Date(prevD.getFullYear(), prevD.getMonth() + 1, 0);
        });
        const churnedCount = prevActive.filter((r) => !r.is_active).length;
        const churnRate = prevActive.length > 0 ? (churnedCount / prevActive.length) * 100 : 0;
        const churnedRevenue = churnedCount * (mrr / Math.max(activeAtMonth.length, 1));

        const arpu = activeAtMonth.length > 0 ? mrr / activeAtMonth.length : 0;

        // Simple forecast: MRR * (1 + avg growth rate)
        const forecast = mrr * 1.08;

        monthsData.push({
          month: monthLabel,
          mrr,
          newRevenue,
          churnedRevenue: Math.round(churnedRevenue),
          churnRate: parseFloat(churnRate.toFixed(1)),
          arpu: Math.round(arpu),
          activeRestaurants: activeAtMonth.length,
          forecast: Math.round(forecast),
        });
      }

      // Add next month forecast
      const lastMonth = monthsData[monthsData.length - 1];
      const nextD = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextLabel = nextD.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthsData.push({
        month: nextLabel,
        mrr: 0,
        newRevenue: 0,
        churnedRevenue: 0,
        churnRate: 0,
        arpu: 0,
        activeRestaurants: 0,
        forecast: Math.round(lastMonth.mrr * 1.08),
      });

      setMetrics(monthsData);

      // Plan distribution (current)
      const activeRestaurants = restaurants.filter((r) => r.is_active);
      const planCounts: Record<string, number> = {};
      activeRestaurants.forEach((r) => {
        planCounts[r.plan] = (planCounts[r.plan] || 0) + 1;
      });
      const dist = Object.entries(planCounts).map(([plan, count]) => ({
        name: plan.charAt(0).toUpperCase() + plan.slice(1),
        value: count,
        color: PLAN_COLORS[plan] || '#94a3b8',
      }));
      setPlanDist(dist);

      // Summary stats
      const current = monthsData[monthsData.length - 2]; // last real month
      const prev = monthsData[monthsData.length - 3];
      const mrrGrowth = prev?.mrr > 0 ? ((current.mrr - prev.mrr) / prev.mrr) * 100 : 0;
      const arpuGrowth = prev?.arpu > 0 ? ((current.arpu - prev.arpu) / prev.arpu) * 100 : 0;
      const avgChurn = monthsData.slice(0, 6).reduce((s, m) => s + m.churnRate, 0) / 6;

      setSummary({
        currentMRR: current.mrr,
        mrrGrowth: parseFloat(mrrGrowth.toFixed(1)),
        avgChurn: parseFloat(avgChurn.toFixed(1)),
        currentARPU: current.arpu,
        arpuGrowth: parseFloat(arpuGrowth.toFixed(1)),
        totalActive: activeRestaurants.length,
      });
    } catch (err) {
      console.error('SaaS metrics error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const chartData = metrics.slice(0, 6); // real months only
  const forecastData = metrics; // includes forecast month

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">SaaS Metrics</h2>
          <p className="text-xs text-muted-foreground">Platform revenue and growth analytics</p>
        </div>
        <button
          onClick={loadMetrics}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current MRR"
          value={formatINR(summary.currentMRR)}
          sub={`${summary.mrrGrowth >= 0 ? '+' : ''}${summary.mrrGrowth}% vs last month`}
          icon={<DollarSign size={16} />}
          trend={summary.mrrGrowth >= 0 ? 'up' : 'down'}
        />
        <StatCard
          label="Active Restaurants"
          value={String(summary.totalActive)}
          sub="Currently on platform"
          icon={<Users size={16} />}
          trend="neutral"
        />
        <StatCard
          label="Avg Churn Rate"
          value={`${summary.avgChurn}%`}
          sub="6-month average"
          icon={<TrendingDown size={16} />}
          trend={summary.avgChurn < 5 ? 'up' : 'down'}
        />
        <StatCard
          label="ARPU"
          value={formatINR(summary.currentARPU)}
          sub={`${summary.arpuGrowth >= 0 ? '+' : ''}${summary.arpuGrowth}% vs last month`}
          icon={<BarChart2 size={16} />}
          trend={summary.arpuGrowth >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* MRR Trend */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">MRR Trend (Last 6 Months)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip formatter={(v: number) => [formatINR(v), 'MRR']} />
            <Area type="monotone" dataKey="mrr" stroke="#6366f1" strokeWidth={2} fill="url(#mrrGrad)" dot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Churn Rate + ARPU Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Churn Rate by Month (%)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Churn Rate']} />
              <Bar dataKey="churnRate" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">ARPU Growth (₹ per Restaurant)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(v: number) => [formatINR(v), 'ARPU']} />
              <Line type="monotone" dataKey="arpu" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Plan Distribution + Revenue Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Plan Distribution</h3>
          {planDist.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No active restaurants</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie
                    data={planDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {planDist.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {planDist.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-xs text-foreground">{p.name}</span>
                    <span className="text-xs font-semibold text-foreground ml-auto pl-2">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">Revenue Forecast by Month</h3>
          <p className="text-xs text-muted-foreground mb-3">Actual MRR vs 8% growth forecast</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tickFormatter={(v) => formatINR(v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(v: number, name: string) => [formatINR(v), name === 'mrr' ? 'Actual MRR' : 'Forecast']} />
              <Legend formatter={(v) => v === 'mrr' ? 'Actual MRR' : 'Forecast'} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="mrr" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MRR Movement Table */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">MRR Movement Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Month</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">MRR</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">New Revenue</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Churned</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Churn %</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">ARPU</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-2 px-3 font-medium text-foreground">{row.month}</td>
                  <td className="py-2 px-3 text-right text-foreground">{formatINR(row.mrr)}</td>
                  <td className="py-2 px-3 text-right text-green-500">+{formatINR(row.newRevenue)}</td>
                  <td className="py-2 px-3 text-right text-red-500">-{formatINR(row.churnedRevenue)}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${row.churnRate > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {row.churnRate}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-foreground">{formatINR(row.arpu)}</td>
                  <td className="py-2 px-3 text-right text-foreground">{row.activeRestaurants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
