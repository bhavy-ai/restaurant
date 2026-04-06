'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Receipt, Download, CreditCard, Calendar, IndianRupee, CheckCircle2, Clock, AlertCircle, RefreshCw, Loader2, FileText, ExternalLink, Building2, X,  } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { downloadInvoicePdf, InvoicePdfData } from '@/lib/generateInvoicePdf';

interface SubscriptionInvoice {
  id: string;
  invoice_number: string;
  billing_month: string;
  billing_period_start: string;
  billing_period_end: string;
  plan_name: string;
  plan_fee: number;
  outlet_count: number;
  total_bills: number;
  total_revenue: number;
  overage_outlets: number;
  overage_fee: number;
  subtotal: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  status: string;
  notes?: string;
  generated_at: string;
  issued_at: string | null;
  paid_at: string | null;
  stripe_receipt_url?: string | null;
  stripe_payment_intent_id?: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'bg-secondary text-muted-foreground border-border', icon: <Clock size={12} /> },
  issued: { label: 'Due', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: <AlertCircle size={12} /> },
  paid: { label: 'Paid', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: <CheckCircle2 size={12} /> },
  overdue: { label: 'Overdue', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <AlertCircle size={12} /> },
  void: { label: 'Void', color: 'bg-secondary text-muted-foreground border-border', icon: <X size={12} /> },
};

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-green-500/15 text-green-400 border-green-500/20',
  growth: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  enterprise: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  free: 'bg-secondary text-muted-foreground border-border',
};

export default function BillingClient() {
  const supabase = createClient();
  const { activeRestaurant } = useAuth();

  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [detailInvoice, setDetailInvoice] = useState<SubscriptionInvoice | null>(null);

  // Stats
  const [stats, setStats] = useState({
    totalPaid: 0,
    totalDue: 0,
    totalInvoices: 0,
    currentPlan: '',
  });

  const loadInvoices = useCallback(async () => {
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('subscription_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .order('billing_month', { ascending: false });

      if (err) throw err;

      const list: SubscriptionInvoice[] = data ?? [];
      setInvoices(list);

      // Compute stats
      const paid = list.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0);
      const due = list.filter((i) => i.status === 'issued' || i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0);
      const latestPlan = list[0]?.plan_name ?? activeRestaurant.plan ?? '';
      setStats({ totalPaid: paid, totalDue: due, totalInvoices: list.length, currentPlan: latestPlan });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [supabase, activeRestaurant]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Filter
  const filtered = invoices.filter((inv) => {
    if (filterStatus && inv.status !== filterStatus) return false;
    if (filterYear && !inv.billing_month.startsWith(filterYear)) return false;
    return true;
  });

  // Available years from invoices
  const years = Array.from(new Set(invoices.map((i) => i.billing_month.split('-')[0]))).sort().reverse();

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ['Invoice #', 'Billing Month', 'Plan', 'Plan Fee', 'Overage Fee', 'GST', 'Total', 'Status', 'Paid On'],
      ...filtered.map((inv) => [
        inv.invoice_number,
        inv.billing_month,
        inv.plan_name,
        inv.plan_fee,
        inv.overage_fee,
        inv.gst_amount,
        inv.total_amount,
        inv.status,
        inv.paid_at ? fmtDate(inv.paid_at) : '',
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-history-${activeRestaurant?.name ?? 'restaurant'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download receipt — dynamic PDF via jsPDF
  const downloadReceipt = (inv: SubscriptionInvoice) => {
    const pdfData: InvoicePdfData = {
      invoiceNumber: inv.invoice_number,
      restaurantName: activeRestaurant?.name ?? '—',
      restaurantCity: (activeRestaurant as any)?.city,
      billingMonth: inv.billing_month,
      billingPeriodStart: inv.billing_period_start,
      billingPeriodEnd: inv.billing_period_end,
      planName: inv.plan_name,
      planFee: inv.plan_fee,
      outletCount: inv.outlet_count,
      totalBills: inv.total_bills,
      totalRevenue: inv.total_revenue,
      overageOutlets: inv.overage_outlets,
      overageFee: inv.overage_fee,
      subtotal: inv.subtotal,
      gstRate: inv.gst_rate ?? 18,
      gstAmount: inv.gst_amount,
      totalAmount: inv.total_amount,
      status: inv.status,
      generatedAt: inv.generated_at,
      issuedAt: inv.issued_at,
      paidAt: inv.paid_at,
    };
    downloadInvoicePdf(pdfData);
  };

  if (!activeRestaurant) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No restaurant selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Billing & Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeRestaurant.name} · Subscription history and receipts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadInvoices}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Current Plan', value: stats.currentPlan ? stats.currentPlan.charAt(0).toUpperCase() + stats.currentPlan.slice(1) : '—', icon: <CreditCard size={18} className="text-primary" />, color: 'text-primary' },
          { label: 'Total Invoices', value: stats.totalInvoices.toString(), icon: <FileText size={18} className="text-blue-400" />, color: 'text-blue-400' },
          { label: 'Amount Paid', value: fmt(stats.totalPaid), icon: <CheckCircle2 size={18} className="text-green-400" />, color: 'text-green-400' },
          { label: 'Amount Due', value: fmt(stats.totalDue), icon: <AlertCircle size={18} className="text-yellow-400" />, color: 'text-yellow-400' },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              {s.icon}
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Due</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="void">Void</option>
        </select>
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">All Years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {(filterStatus || filterYear) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterYear(''); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Invoice Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Receipt size={40} className="text-muted-foreground mb-3" />
          <p className="text-muted-foreground font-medium">No invoices found</p>
          <p className="text-xs text-muted-foreground mt-1">Subscription invoices are generated on the 1st of each month</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Month</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due / Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((inv) => {
                  const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
                  const planColor = PLAN_COLORS[inv.plan_name] ?? PLAN_COLORS.free;
                  return (
                    <tr key={inv.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailInvoice(inv)}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {inv.invoice_number}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-muted-foreground" />
                          <span className="text-foreground">{inv.billing_month}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${planColor}`}>
                          {inv.plan_name.charAt(0).toUpperCase() + inv.plan_name.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IndianRupee size={12} className="text-muted-foreground" />
                          <span className="font-semibold text-foreground">{inv.total_amount.toLocaleString('en-IN')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>
                          {sc.icon}
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {inv.status === 'paid' ? fmtDate(inv.paid_at) : fmtDate(inv.issued_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailInvoice(inv)}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="View details"
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            onClick={() => downloadReceipt(inv)}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="Download receipt"
                          >
                            <Download size={14} />
                          </button>
                          {inv.stripe_receipt_url && (
                            <a
                              href={inv.stripe_receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              title="View Stripe receipt"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
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

      {/* Invoice Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground">{detailInvoice.invoice_number}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{detailInvoice.billing_month} · {activeRestaurant.name}</p>
              </div>
              <button
                onClick={() => setDetailInvoice(null)}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Status + Plan */}
              <div className="flex items-center gap-3">
                {(() => {
                  const sc = STATUS_CONFIG[detailInvoice.status] ?? STATUS_CONFIG.draft;
                  return (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${sc.color}`}>
                      {sc.icon} {sc.label}
                    </span>
                  );
                })()}
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${PLAN_COLORS[detailInvoice.plan_name] ?? PLAN_COLORS.free}`}>
                  {detailInvoice.plan_name.charAt(0).toUpperCase() + detailInvoice.plan_name.slice(1)} Plan
                </span>
              </div>

              {/* Billing Period */}
              <div className="bg-secondary/50 rounded-lg p-3 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Billing Period</p>
                <p className="text-foreground font-medium">
                  {fmtDate(detailInvoice.billing_period_start)} – {fmtDate(detailInvoice.billing_period_end)}
                </p>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Charges</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{detailInvoice.plan_name.charAt(0).toUpperCase() + detailInvoice.plan_name.slice(1)} Plan Fee</span>
                    <span className="text-foreground font-medium">{fmt(detailInvoice.plan_fee)}</span>
                  </div>
                  {detailInvoice.overage_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Outlet Overage ({detailInvoice.overage_outlets} extra × ₹499)</span>
                      <span className="text-foreground font-medium">{fmt(detailInvoice.overage_fee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{fmt(detailInvoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST ({detailInvoice.gst_rate}%)</span>
                    <span className="text-foreground">{fmt(detailInvoice.gst_amount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-bold text-primary text-base">{fmt(detailInvoice.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Usage Summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Outlets', value: detailInvoice.outlet_count },
                  { label: 'Total Bills', value: detailInvoice.total_bills.toLocaleString('en-IN') },
                  { label: 'Revenue', value: `₹${(detailInvoice.total_revenue / 1000).toFixed(1)}K` },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary/50 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="font-semibold text-foreground text-sm mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Dates */}
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Generated</span>
                  <span>{fmtDate(detailInvoice.generated_at)}</span>
                </div>
                {detailInvoice.issued_at && (
                  <div className="flex justify-between">
                    <span>Issued</span>
                    <span>{fmtDate(detailInvoice.issued_at)}</span>
                  </div>
                )}
                {detailInvoice.paid_at && (
                  <div className="flex justify-between text-green-400">
                    <span>Paid</span>
                    <span>{fmtDate(detailInvoice.paid_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-2 p-4 border-t border-border">
              <button
                onClick={() => downloadReceipt(detailInvoice)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Download size={14} />
                Download Receipt
              </button>
              {detailInvoice.stripe_receipt_url && (
                <a
                  href={detailInvoice.stripe_receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <ExternalLink size={14} />
                  Stripe
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
