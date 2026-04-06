'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CalendarClock, Play, RefreshCw, AlertCircle, Loader2,
  CheckCircle2, ChevronRight, Download, IndianRupee,
  Building2, FileText, X, ChevronDown, Info, CreditCard, Mail,
} from 'lucide-react';
import { downloadInvoicePdf, type InvoicePdfData } from '@/lib/generateInvoicePdf';

interface Restaurant {
  id: string;
  name: string;
  plan: string;
  city?: string;
  is_active: boolean;
  created_at: string;
}

interface PlanConfig {
  name: string;
  display_name: string;
  price_monthly: number;
  max_outlets: number;
}

interface PlanSegment {
  plan: string;
  days: number;
  fee: number;
}

interface InvoicePreview {
  restaurant: Restaurant;
  plan: PlanConfig | null;
  outletCount: number;
  totalBills: number;
  totalRevenue: number;
  planFee: number;
  planSegments: PlanSegment[];
  isProRated: boolean;
  overageOutlets: number;
  overageFee: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  alreadyGenerated: boolean;
  existingInvoiceId?: string;
}

interface SubscriptionInvoice {
  id: string;
  invoice_number: string;
  billing_month: string;
  plan_name: string;
  plan_fee: number;
  outlet_count: number;
  total_bills: number;
  total_revenue: number;
  overage_outlets: number;
  overage_fee: number;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  status: string;
  generated_at: string;
  issued_at: string | null;
  paid_at: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  restaurant?: { name: string; city?: string };
}

// Helper: parse plan_name like "free(14d)+enterprise(17d)" into segments
function parsePlanSegments(planName: string, planFee: number, plans: Record<string, PlanConfig>): Array<{ plan: string; days: number; fee: number; dailyRate: number }> | null {
  // Check if it's a compound pro-rated plan name
  if (!planName.includes('(') || !planName.includes(')')) return null;
  const parts = planName.split('+');
  const segments: Array<{ plan: string; days: number; fee: number; dailyRate: number }> = [];
  for (const part of parts) {
    const match = part.trim().match(/^(\w+)\((\d+)d\)$/);
    if (!match) return null;
    const [, plan, daysStr] = match;
    const days = parseInt(daysStr, 10);
    segments.push({ plan, days, fee: 0, dailyRate: 0 });
  }
  // Calculate total days to derive daily rates
  const totalDays = segments.reduce((s, seg) => s + seg.days, 0);
  if (totalDays === 0) return null;
  // Assign fees proportionally based on plan monthly price × days
  let remaining = planFee;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const planConfig = plans[seg.plan];
    const monthlyRate = planConfig?.price_monthly || 0;
    const dailyRate = totalDays > 0 ? monthlyRate / totalDays : 0;
    const fee = i === segments.length - 1 ? remaining : Math.round(dailyRate * seg.days);
    segments[i] = { ...seg, fee, dailyRate: Math.round(dailyRate) };
    remaining -= fee;
  }
  return segments;
}

const OVERAGE_RATE_PER_OUTLET = 499;
const GST_RATE = 18;
const PAGE_SIZE = 15;

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-secondary text-muted-foreground border-border',
  issued: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  paid: 'bg-green-500/10 text-green-400 border-green-500/20',
  overdue: 'bg-red-500/10 text-red-400 border-red-500/20',
  void: 'bg-secondary text-muted-foreground border-border',
};

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-green-500/15 text-green-400 border-green-500/20',
  growth: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  enterprise: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  free: 'bg-secondary text-muted-foreground border-border',
};

function getBillingMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getBillingPeriod(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function generateInvoiceNumber(restaurantId: string, month: string): string {
  const short = restaurantId.replace(/-/g, '').substring(0, 6).toUpperCase();
  const monthCode = month.replace('-', '');
  return `INV-${monthCode}-${short}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function buildPdfData(inv: SubscriptionInvoice, restaurantName?: string, restaurantCity?: string): InvoicePdfData {
  return {
    invoiceNumber: inv.invoice_number,
    restaurantName: restaurantName ?? (inv.restaurant as any)?.name ?? '—',
    restaurantCity: restaurantCity ?? (inv.restaurant as any)?.city,
    billingMonth: inv.billing_month,
    billingPeriodStart: (inv as any).billing_period_start ?? null,
    billingPeriodEnd: (inv as any).billing_period_end ?? null,
    planName: inv.plan_name,
    planFee: inv.plan_fee,
    outletCount: inv.outlet_count,
    totalBills: inv.total_bills,
    totalRevenue: inv.total_revenue,
    overageOutlets: inv.overage_outlets,
    overageFee: inv.overage_fee,
    subtotal: inv.subtotal,
    gstRate: GST_RATE,
    gstAmount: inv.gst_amount,
    totalAmount: inv.total_amount,
    status: inv.status,
    generatedAt: inv.generated_at,
    issuedAt: inv.issued_at,
    paidAt: inv.paid_at,
  };
}

export default function SubscriptionScheduler() {
  const supabase = createClient();

  const [superadminId, setSuperadminId] = useState<string | null>(null);
  const [chargingInvoiceId, setChargingInvoiceId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string>('');
  const [emailingInvoiceId, setEmailingInvoiceId] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Billing month selector
  const now = new Date();
  const defaultMonth = getBillingMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  // Preview state
  const [previews, setPreviews] = useState<InvoicePreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Generate state
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ success: number; skipped: number; errors: string[] } | null>(null);

  // History state
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  // Detail modal
  const [detailInvoice, setDetailInvoice] = useState<SubscriptionInvoice | null>(null);

  // Plans cache
  const [plans, setPlans] = useState<Record<string, PlanConfig>>({});

  // Load superadmin id
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('platform_superadmins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setSuperadminId(data.id);
    };
    load();
  }, [supabase]);

  // Load plans
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('plans').select('*');
      if (data) {
        const map: Record<string, PlanConfig> = {};
        data.forEach((p: any) => { map[p.name] = p; });
        setPlans(map);
      }
    };
    load();
  }, [supabase]);

  // Load preview for selected month
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError('');
    setPreviews([]);
    setGenerateResult(null);
    try {
      const { start, end } = getBillingPeriod(selectedMonth);
      const periodStart = new Date(start + 'T00:00:00');
      const periodEnd = new Date(end + 'T23:59:59');
      const totalDaysInMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0).getDate();

      // Fetch all active restaurants
      const { data: restaurants, error: rErr } = await supabase
        .from('restaurants')
        .select('id, name, plan, city, is_active, created_at')
        .eq('is_active', true)
        .order('name');
      if (rErr) throw rErr;

      // Fetch already-generated invoices for this month
      const { data: existingInvoices } = await supabase
        .from('subscription_invoices')
        .select('id, restaurant_id, billing_month')
        .eq('billing_month', selectedMonth);

      const existingMap: Record<string, string> = {};
      (existingInvoices || []).forEach((inv: any) => {
        existingMap[inv.restaurant_id] = inv.id;
      });

      // Fetch plan change history for this billing month for all restaurants
      const { data: planChanges } = await supabase
        .from('plan_change_history')
        .select('restaurant_id, old_plan, new_plan, changed_at')
        .gte('changed_at', `${start}T00:00:00`)
        .lte('changed_at', `${end}T23:59:59`)
        .order('changed_at', { ascending: true });

      // Group plan changes by restaurant
      const planChangesMap: Record<string, Array<{ old_plan: string; new_plan: string; changed_at: string }>> = {};
      (planChanges || []).forEach((c: any) => {
        if (!planChangesMap[c.restaurant_id]) planChangesMap[c.restaurant_id] = [];
        planChangesMap[c.restaurant_id].push(c);
      });

      // Build previews
      const results: InvoicePreview[] = await Promise.all(
        (restaurants || []).map(async (r: Restaurant) => {
          const plan = plans[r.plan] || null;

          // Count outlets
          const { count: outletCount } = await supabase
            .from('outlets')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', r.id);

          // Count bills in period
          const { data: billData } = await supabase
            .from('bills')
            .select('net_amount')
            .eq('restaurant_id', r.id)
            .gte('created_at', `${start}T00:00:00`)
            .lte('created_at', `${end}T23:59:59`);

          const totalBills = billData?.length || 0;
          const totalRevenue = (billData || []).reduce((sum: number, b: any) => sum + (b.net_amount || 0), 0);

          // ── Pro-rated plan fee calculation ──────────────────────────────
          const changes = planChangesMap[r.id] || [];
          let planSegments: PlanSegment[] = [];
          let planFee = 0;
          let isProRated = false;

          if (changes.length === 0) {
            // No plan changes this month — charge full plan fee
            const fee = plan?.price_monthly || 0;
            planFee = fee;
            planSegments = [{ plan: r.plan, days: totalDaysInMonth, fee }];
          } else {
            // One or more plan changes within the month — calculate each segment
            isProRated = true;

            // Build timeline: [ {plan, from, to}, ... ]
            // The restaurant started the month on the plan that was active before the first change
            const segments: Array<{ plan: string; from: Date; to: Date }> = [];

            // First segment: from start of month to first change
            const firstChangePlan = changes[0].old_plan;
            const firstChangeDate = new Date(changes[0].changed_at);
            segments.push({ plan: firstChangePlan, from: periodStart, to: firstChangeDate });

            // Middle segments: between consecutive changes
            for (let i = 0; i < changes.length - 1; i++) {
              const segPlan = changes[i].new_plan;
              const segFrom = new Date(changes[i].changed_at);
              const segTo = new Date(changes[i + 1].changed_at);
              segments.push({ plan: segPlan, from: segFrom, to: segTo });
            }

            // Last segment: from last change to end of month
            const lastChange = changes[changes.length - 1];
            segments.push({ plan: lastChange.new_plan, from: new Date(lastChange.changed_at), to: new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0, 23, 59, 59) });

            // Calculate fee for each segment
            for (const seg of segments) {
              const msInDay = 1000 * 60 * 60 * 24;
              const rawDays = (seg.to.getTime() - seg.from.getTime()) / msInDay;
              const days = Math.max(0, Math.round(rawDays));
              if (days === 0) continue;

              const segPlanConfig = plans[seg.plan] || null;
              const monthlyRate = segPlanConfig?.price_monthly || 0;
              const dailyRate = monthlyRate / totalDaysInMonth;
              const fee = Math.round(dailyRate * days);

              planSegments.push({ plan: seg.plan, days, fee });
              planFee += fee;
            }

            // If segments are empty (edge case), fall back to current plan
            if (planSegments.length === 0) {
              planFee = plan?.price_monthly || 0;
              planSegments = [{ plan: r.plan, days: totalDaysInMonth, fee: planFee }];
              isProRated = false;
            }
          }
          // ────────────────────────────────────────────────────────────────

          const maxOutlets = plan?.max_outlets || 1;
          const outlets = outletCount || 1;
          const overageOutlets = maxOutlets === -1 ? 0 : Math.max(0, outlets - maxOutlets);
          const overageFee = overageOutlets * OVERAGE_RATE_PER_OUTLET;
          const subtotal = planFee + overageFee;
          const gstAmount = Math.round((subtotal * GST_RATE) / 100);
          const totalAmount = subtotal + gstAmount;

          return {
            restaurant: r,
            plan,
            outletCount: outlets,
            totalBills,
            totalRevenue,
            planFee,
            planSegments,
            isProRated,
            overageOutlets,
            overageFee,
            subtotal,
            gstAmount,
            totalAmount,
            alreadyGenerated: !!existingMap[r.id],
            existingInvoiceId: existingMap[r.id],
          };
        })
      );

      setPreviews(results);
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedMonth, supabase, plans]);

  useEffect(() => { loadPreview(); }, [loadPreview, plans]);

  // Generate invoices
  const handleGenerate = async () => {
    const toGenerate = previews.filter((p) => !p.alreadyGenerated);
    if (toGenerate.length === 0) return;

    setGenerating(true);
    setGenerateResult(null);
    const { start, end } = getBillingPeriod(selectedMonth);
    let success = 0;
    const errors: string[] = [];

    for (const preview of toGenerate) {
      try {
        const invoiceNumber = generateInvoiceNumber(preview.restaurant.id, selectedMonth);
        // For pro-rated invoices, store a descriptive plan name listing all segments
        const storedPlanName = preview.isProRated
          ? preview.planSegments.map((s) => `${s.plan}(${s.days}d)`).join('+')
          : preview.restaurant.plan;

        const { error: insErr, data: inserted } = await supabase.from('subscription_invoices').insert({
          restaurant_id: preview.restaurant.id,
          invoice_number: invoiceNumber,
          billing_month: selectedMonth,
          billing_period_start: start,
          billing_period_end: end,
          plan_name: storedPlanName,
          plan_fee: preview.planFee,
          outlet_count: preview.outletCount,
          total_bills: preview.totalBills,
          total_revenue: preview.totalRevenue,
          overage_outlets: preview.overageOutlets,
          overage_fee: preview.overageFee,
          subtotal: preview.subtotal,
          gst_rate: GST_RATE,
          gst_amount: preview.gstAmount,
          total_amount: preview.totalAmount,
          status: 'issued',
          generated_by: superadminId,
          issued_at: new Date().toISOString(),
        }).select().maybeSingle();
        if (insErr) throw insErr;

        // Send email to restaurant owner
        try {
          const { data: ownerData } = await supabase
            .from('restaurant_users')
            .select('users(email)')
            .eq('restaurant_id', preview.restaurant.id)
            .eq('role', 'owner')
            .maybeSingle();
          const ownerEmail = (ownerData as any)?.users?.email;
          if (ownerEmail && inserted) {
            await supabase.functions.invoke('send-invoice-email', {
              body: {
                toEmail: ownerEmail,
                restaurantName: preview.restaurant.name,
                restaurantCity: preview.restaurant.city,
                invoiceNumber,
                billingMonth: selectedMonth,
                billingPeriodStart: start,
                billingPeriodEnd: end,
                planName: preview.restaurant.plan,
                planFee: preview.planFee,
                overageOutlets: preview.overageOutlets,
                overageFee: preview.overageFee,
                subtotal: preview.subtotal,
                gstRate: GST_RATE,
                gstAmount: preview.gstAmount,
                totalAmount: preview.totalAmount,
                status: 'issued',
                generatedAt: new Date().toISOString(),
                issuedAt: new Date().toISOString(),
              },
            });
          }
        } catch {
          // Email failure is non-blocking
        }

        success++;
      } catch (err: any) {
        errors.push(`${preview.restaurant.name}: ${err?.message || 'Unknown error'}`);
      }
    }

    setGenerateResult({ success, skipped: previews.filter((p) => p.alreadyGenerated).length, errors });
    setGenerating(false);
    loadPreview();
    loadHistory();
  };

  // Load invoice history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      let query = supabase
        .from('subscription_invoices')
        .select('*, restaurant:restaurants(name, city)', { count: 'exact' })
        .order('generated_at', { ascending: false })
        .range((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE - 1);

      if (filterStatus) query = query.eq('status', filterStatus);
      if (filterMonth) query = query.eq('billing_month', filterMonth);

      const { data, count, error: hErr } = await query;
      if (hErr) throw hErr;
      setInvoices(data || []);
      setHistoryTotal(count || 0);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [supabase, historyPage, filterStatus, filterMonth]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Update invoice status
  const handleStatusChange = async (invoiceId: string, status: string) => {
    const update: Record<string, any> = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    await supabase.from('subscription_invoices').update(update).eq('id', invoiceId);
    loadHistory();
    if (detailInvoice?.id === invoiceId) {
      setDetailInvoice((prev) => prev ? { ...prev, status, paid_at: status === 'paid' ? new Date().toISOString() : prev.paid_at } : null);
    }
  };

  // Export CSV
  const exportCSV = () => {
    if (invoices.length === 0) return;
    const headers = ['Invoice #', 'Restaurant', 'City', 'Month', 'Plan', 'Plan Fee', 'Overage Fee', 'Subtotal', 'GST', 'Total', 'Status', 'Generated At'];
    const rows = invoices.map((inv) => [
      inv.invoice_number,
      (inv.restaurant as any)?.name || '',
      (inv.restaurant as any)?.city || '',
      inv.billing_month,
      inv.plan_name,
      inv.plan_fee,
      inv.overage_fee,
      inv.subtotal,
      inv.gst_amount,
      inv.total_amount,
      inv.status,
      fmtDate(inv.generated_at),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscription-invoices-${filterMonth || 'all'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Month options (last 12 months)
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(getBillingMonth(d));
  }

  const pendingCount = previews.filter((p) => !p.alreadyGenerated).length;
  const totalAmount = previews.reduce((s, p) => s + p.totalAmount, 0);

  // Charge invoice via Stripe
  const handleStripeCharge = async (invoiceId: string) => {
    setChargingInvoiceId(invoiceId);
    setChargeError('');
    try {
      const res = await fetch('/api/stripe/charge-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Stripe charge failed');
      // Payment intent created — mark as issued in UI
      loadHistory();
      if (detailInvoice?.id === invoiceId) {
        setDetailInvoice((prev) => prev ? { ...prev, status: 'issued' } : null);
      }
    } catch (err: any) {
      setChargeError(err?.message ?? 'Failed to initiate Stripe charge');
    } finally {
      setChargingInvoiceId(null);
    }
  };

  // Send invoice email manually
  const handleSendEmail = async (inv: SubscriptionInvoice) => {
    setEmailingInvoiceId(inv.id);
    setEmailResult(null);
    try {
      const { data: ownerData } = await supabase
        .from('restaurant_users')
        .select('users(email)')
        .eq('restaurant_id', (inv as any).restaurant_id ?? '')
        .eq('role', 'owner')
        .maybeSingle();
      const ownerEmail = (ownerData as any)?.users?.email;
      if (!ownerEmail) throw new Error('Restaurant owner email not found');

      const { error: fnErr } = await supabase.functions.invoke('send-invoice-email', {
        body: {
          toEmail: ownerEmail,
          restaurantName: (inv.restaurant as any)?.name ?? '—',
          restaurantCity: (inv.restaurant as any)?.city,
          invoiceNumber: inv.invoice_number,
          billingMonth: inv.billing_month,
          billingPeriodStart: (inv as any).billing_period_start ?? null,
          billingPeriodEnd: (inv as any).billing_period_end ?? null,
          planName: inv.plan_name,
          planFee: inv.plan_fee,
          overageOutlets: inv.overage_outlets,
          overageFee: inv.overage_fee,
          subtotal: inv.subtotal,
          gstRate: GST_RATE,
          gstAmount: inv.gst_amount,
          totalAmount: inv.total_amount,
          status: inv.status,
          generatedAt: inv.generated_at,
          issuedAt: inv.issued_at,
        },
      });
      if (fnErr) throw fnErr;
      setEmailResult({ id: inv.id, success: true, message: `Invoice emailed to ${ownerEmail}` });
    } catch (err: any) {
      setEmailResult({ id: inv.id, success: false, message: err?.message ?? 'Failed to send email' });
    } finally {
      setEmailingInvoiceId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CalendarClock size={18} className="text-primary" />
            Subscription Charge Scheduler
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Calculate plan fees + usage overages and generate invoices per restaurant
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={loadPreview}
            disabled={previewLoading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={15} className={previewLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-300">
          Invoices are generated on the <strong>1st of each month</strong> for the previous billing period.
          Plan fee is <strong>pro-rated by day</strong> — if a restaurant changed plans mid-month, each segment is charged separately.
          Overage fee of <strong>₹{OVERAGE_RATE_PER_OUTLET}/outlet</strong> applies when outlet count exceeds plan limit.
          GST at <strong>{GST_RATE}%</strong> is added on subtotal.
        </p>
      </div>

      {/* Summary stats */}
      {!previewLoading && previews.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Restaurants', value: previews.length, color: 'text-primary', icon: <Building2 size={15} /> },
            { label: 'Pending Invoices', value: pendingCount, color: 'text-amber-400', icon: <FileText size={15} /> },
            { label: 'Already Issued', value: previews.length - pendingCount, color: 'text-green-400', icon: <CheckCircle2 size={15} /> },
            { label: 'Total Billable', value: fmt(totalAmount), color: 'text-purple-400', icon: <IndianRupee size={15} /> },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <div className={`${s.color} mb-2`}>{s.icon}</div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Generate result banner */}
      {generateResult && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
          generateResult.errors.length > 0
            ? 'bg-amber-500/5 border-amber-500/20' :'bg-green-500/5 border-green-500/20'
        }`}>
          <CheckCircle2 size={15} className={generateResult.errors.length > 0 ? 'text-amber-400' : 'text-green-400'} />
          <div className="text-xs">
            <p className={generateResult.errors.length > 0 ? 'text-amber-300' : 'text-green-300'}>
              Generated <strong>{generateResult.success}</strong> invoice{generateResult.success !== 1 ? 's' : ''} and sent email notifications.
              {generateResult.skipped > 0 && ` Skipped ${generateResult.skipped} already issued.`}
            </p>
            {generateResult.errors.map((e, i) => (
              <p key={i} className="text-red-400 mt-1">{e}</p>
            ))}
          </div>
        </div>
      )}

      {/* Email result banner */}
      {emailResult && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${emailResult.success ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          {emailResult.success ? <CheckCircle2 size={15} className="text-green-400" /> : <AlertCircle size={15} className="text-red-400" />}
          <p className={`text-xs ${emailResult.success ? 'text-green-300' : 'text-red-400'}`}>{emailResult.message}</p>
          <button onClick={() => setEmailResult(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12} /></button>
        </div>
      )}

      {/* Preview table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Invoice Preview — {selectedMonth}
          </h3>
          <button
            onClick={handleGenerate}
            disabled={generating || pendingCount === 0 || previewLoading}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {generating ? 'Generating…' : `Generate ${pendingCount} Invoice${pendingCount !== 1 ? 's' : ''}`}
          </button>
        </div>

        {previewLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : previewError ? (
          <div className="flex items-center gap-2 text-sm text-red-400 px-5 py-8">
            <AlertCircle size={15} />
            {previewError}
          </div>
        ) : previews.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No active restaurants found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {['Restaurant', 'Plan', 'Outlets', 'Bills', 'Plan Fee', 'Overage', 'Subtotal', 'GST (18%)', 'Total', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previews.map((p) => (
                  <tr key={p.restaurant.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{p.restaurant.name}</p>
                      {p.restaurant.city && <p className="text-muted-foreground">{p.restaurant.city}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {p.isProRated ? (
                        <div className="space-y-0.5">
                          {p.planSegments.map((seg, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[seg.plan] || PLAN_COLORS.free}`}>
                                {seg.plan}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{seg.days}d</span>
                            </div>
                          ))}
                          <div className="text-foreground font-semibold border-t border-border/50 pt-0.5 mt-0.5">{fmt(p.planFee)}</div>
                        </div>
                      ) : (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[p.restaurant.plan] || PLAN_COLORS.free}`}>
                          {p.restaurant.plan}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{p.outletCount}</td>
                    <td className="px-4 py-3 text-foreground">{p.totalBills}</td>
                    <td className="px-4 py-3">
                      {p.isProRated ? (
                        <div className="space-y-0.5">
                          {p.planSegments.map((seg, i) => (
                            <div key={i} className="text-foreground text-[10px]">
                              {fmt(seg.fee)} <span className="text-muted-foreground">({seg.days}d)</span>
                            </div>
                          ))}
                          <div className="text-foreground font-semibold border-t border-border/50 pt-0.5 mt-0.5">{fmt(p.planFee)}</div>
                        </div>
                      ) : (
                        <span className="text-foreground">{fmt(p.planFee)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.overageFee > 0 ? (
                        <span className="text-amber-400">{fmt(p.overageFee)} <span className="text-muted-foreground">({p.overageOutlets} extra)</span></span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium">{fmt(p.subtotal)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(p.gstAmount)}</td>
                    <td className="px-4 py-3 text-foreground font-bold">{fmt(p.totalAmount)}</td>
                    <td className="px-4 py-3">
                      {p.alreadyGenerated ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle2 size={11} />
                          Issued
                        </span>
                      ) : (
                        <div>
                          <span className="text-amber-400">Pending</span>
                          {p.isProRated && (
                            <p className="text-[9px] text-blue-400 mt-0.5">Pro-rated</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice History */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Invoice History</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={filterMonth}
                onChange={(e) => { setFilterMonth(e.target.value); setHistoryPage(1); }}
                className="pl-3 pr-7 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none appearance-none"
              >
                <option value="">All Months</option>
                {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setHistoryPage(1); }}
                className="pl-3 pr-7 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none appearance-none"
              >
                <option value="">All Status</option>
                {['draft', 'issued', 'paid', 'overdue', 'void'].map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <button
              onClick={exportCSV}
              disabled={invoices.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
            >
              <Download size={12} />
              Export CSV
            </button>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No invoices found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    {['Invoice #', 'Restaurant', 'Month', 'Plan', 'Plan Fee', 'Overage', 'Total', 'Status', 'Generated', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-foreground">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{(inv.restaurant as any)?.name || '—'}</p>
                        {(inv.restaurant as any)?.city && <p className="text-muted-foreground">{(inv.restaurant as any).city}</p>}
                      </td>
                      <td className="px-4 py-3 text-foreground">{inv.billing_month}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[inv.plan_name] || PLAN_COLORS.free}`}>
                          {inv.plan_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{fmt(inv.plan_fee)}</td>
                      <td className="px-4 py-3">
                        {inv.overage_fee > 0 ? (
                          <span className="text-amber-400">{fmt(inv.overage_fee)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">{fmt(inv.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${STATUS_COLORS[inv.status] || STATUS_COLORS.draft}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(inv.generated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => downloadInvoicePdf(buildPdfData(inv))}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            title="Download PDF"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            onClick={() => handleSendEmail(inv)}
                            disabled={emailingInvoiceId === inv.id}
                            className="p-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-secondary transition-colors disabled:opacity-50"
                            title="Email invoice to restaurant owner"
                          >
                            {emailingInvoiceId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                          </button>
                          <button
                            onClick={() => setDetailInvoice(inv)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {historyTotal > PAGE_SIZE && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {(historyPage - 1) * PAGE_SIZE + 1}–{Math.min(historyPage * PAGE_SIZE, historyTotal)} of {historyTotal}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="px-2.5 py-1 rounded bg-secondary border border-border text-xs text-foreground disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => p + 1)}
                    disabled={historyPage * PAGE_SIZE >= historyTotal}
                    className="px-2.5 py-1 rounded bg-secondary border border-border text-xs text-foreground disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-foreground">{detailInvoice.invoice_number}</h3>
                <p className="text-xs text-muted-foreground">{(detailInvoice.restaurant as any)?.name}</p>
              </div>
              <button
                onClick={() => setDetailInvoice(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Plan Segments (pro-rated) */}
              {(() => {
                const segments = parsePlanSegments(detailInvoice.plan_name, detailInvoice.plan_fee, plans);
                if (!segments) return null;
                const totalDays = segments.reduce((s, seg) => s + seg.days, 0);
                return (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                      Pro-rated Plan Breakdown
                    </p>
                    <div className="bg-secondary/40 border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Plan</th>
                            <th className="text-right px-3 py-2 text-muted-foreground font-medium">Days</th>
                            <th className="text-right px-3 py-2 text-muted-foreground font-medium">Daily Rate</th>
                            <th className="text-right px-3 py-2 text-muted-foreground font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {segments.map((seg, i) => (
                            <tr key={i} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[seg.plan] || PLAN_COLORS.free}`}>
                                  {seg.plan}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-foreground">
                                {seg.days}d
                                <span className="text-muted-foreground ml-1">/ {totalDays}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                {fmt(seg.dailyRate)}/d
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-foreground">
                                {fmt(seg.fee)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-secondary/60">
                            <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                              Total Plan Fee
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-foreground">
                              {fmt(detailInvoice.plan_fee)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Breakdown */}
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Billing Month', value: detailInvoice.billing_month },
                  { label: 'Plan', value: detailInvoice.plan_name },
                  { label: 'Outlets', value: detailInvoice.outlet_count },
                  { label: 'Total Bills', value: detailInvoice.total_bills },
                  { label: 'Plan Fee', value: fmt(detailInvoice.plan_fee) },
                  { label: `Overage (${detailInvoice.overage_outlets} extra outlets)`, value: fmt(detailInvoice.overage_fee) },
                  { label: 'Subtotal', value: fmt(detailInvoice.subtotal), bold: true },
                  { label: `GST (${GST_RATE}%)`, value: fmt(detailInvoice.gst_amount) },
                  { label: 'Total Amount', value: fmt(detailInvoice.total_amount), bold: true, highlight: true },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between ${row.highlight ? 'border-t border-border pt-2' : ''}`}>
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`${row.bold ? 'font-bold text-foreground' : 'text-foreground'} ${row.highlight ? 'text-primary' : ''}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Stripe Charge Button */}
              {(detailInvoice.status === 'issued' || detailInvoice.status === 'overdue' || detailInvoice.status === 'draft') && (
                <div className="space-y-2">
                  <button
                    onClick={() => handleStripeCharge(detailInvoice.id)}
                    disabled={chargingInvoiceId === detailInvoice.id}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {chargingInvoiceId === detailInvoice.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CreditCard size={14} />
                    )}
                    {chargingInvoiceId === detailInvoice.id ? 'Initiating Charge…' : 'Charge via Stripe'}
                  </button>
                  {chargeError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} />
                      {chargeError}
                    </p>
                  )}
                </div>
              )}

              {/* PDF + Email actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => downloadInvoicePdf(buildPdfData(detailInvoice))}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Download size={13} />
                  Download PDF
                </button>
                <button
                  onClick={() => handleSendEmail(detailInvoice)}
                  disabled={emailingInvoiceId === detailInvoice.id}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-blue-400 hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  {emailingInvoiceId === detailInvoice.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  {emailingInvoiceId === detailInvoice.id ? 'Sending…' : 'Email Invoice'}
                </button>
              </div>

              {/* Status update */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Update Status</label>
                <div className="relative">
                  <select
                    value={detailInvoice.status}
                    onChange={(e) => handleStatusChange(detailInvoice.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none"
                  >
                    {['draft', 'issued', 'paid', 'overdue', 'void'].map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Generated: {fmtDate(detailInvoice.generated_at)}</p>
                {detailInvoice.issued_at && <p>Issued: {fmtDate(detailInvoice.issued_at)}</p>}
                {detailInvoice.paid_at && <p>Paid: {fmtDate(detailInvoice.paid_at)}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
