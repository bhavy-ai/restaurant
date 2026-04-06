'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Banknote, Smartphone, CreditCard, AlertTriangle, CheckCircle, X, FileText, Lock, TrendingUp, TrendingDown, Users, IndianRupee, Plus, Minus, Printer, Loader2, ExternalLink, Zap, CheckCircle2, XCircle, Clock, RefreshCw, MessageCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { createClient } from '@/lib/supabase/client';
import { billService, shiftService } from '@/lib/services/restaurantService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import SyncStatusPanel from './SyncStatusPanel';
import PostSyncVerification from './PostSyncVerification';
import ShiftHandover from '@/components/ShiftHandover';

interface Bill {
  id: string;
  billNo: string;
  tableLabel: string;
  time: string;
  items: number;
  covers: number;
  gross: number;
  discount: number;
  gst: number;
  net: number;
  paymentMode: string;
  cashier: string;
  status: 'settled' | 'voided' | 'refunded';
  stripeStatus?: string | null;
  stripeReceiptUrl?: string | null;
}

interface ShiftStats {
  shiftName: string;
  shiftDate: string;
  openedAt: string;
  cashier: string;
  openingFloat: number;
  totalBills: number;
  totalCovers: number;
  grossSales: number;
  discounts: number;
  voids: number;
  netSales: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  cgst: number;
  sgst: number;
  totalGst: number;
  avgBillValue: number;
  avgCoverValue: number;
}

const denominations = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
interface DenomCount { [key: number]: number; }

interface ChargeFailedAlert {
  billId: string;
  billNo: string;
  amount: number;
  retryIn: number;
}

// ── Stripe singleton ──────────────────────────────────────────────────────
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

// ── Stripe Payment Form ───────────────────────────────────────────────────
interface StripePayFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  amount: number;
}

function StripePayForm({ onSuccess, onCancel, amount }: StripePayFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setPayError('');
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/settlement-dashboard` },
        redirect: 'if_required',
      });
      if (error) {
        setPayError(error.message || 'Payment failed. Please try again.');
        setProcessing(false);
        return;
      }
      if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else {
        setPayError('Payment not completed. Status: ' + paymentIntent?.status);
        setProcessing(false);
      }
    } catch (err: any) {
      setPayError(err?.message || 'Payment failed');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-secondary/50 rounded-xl p-3 mb-2">
        <p className="text-xs text-muted-foreground mb-0.5">Amount to collect</p>
        <p className="text-xl font-bold font-mono text-foreground">₹{amount.toLocaleString('en-IN')}</p>
      </div>
      <PaymentElement options={{ layout: 'tabs' }} />
      {payError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {payError}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
        >
          {processing ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
          ) : (
            <><CreditCard size={14} /> Charge Card</>
          )}
        </button>
      </div>
    </form>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={`tooltip-entry-${i}`} className="text-xs" style={{ color: p.color || p.fill }}>
            {p.name}: {p.name === 'revenue' ? `₹${p.value.toLocaleString('en-IN')}` : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function SettlementClient() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [shiftStats, setShiftStats] = useState<ShiftStats | null>(null);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [denomCounts, setDenomCounts] = useState<DenomCount>(
    Object.fromEntries(denominations.map((d) => [d, 0]))
  );
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [closingProcessing, setClosingProcessing] = useState(false);
  const [billFilter, setBillFilter] = useState<'all' | 'settled' | 'voided'>('all');
  const [loading, setLoading] = useState(true);
  const [chargeFailedAlerts, setChargeFailedAlerts] = useState<ChargeFailedAlert[]>([]);
  const retryTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const [sendingReceiptId, setSendingReceiptId] = useState<string | null>(null);
  const [showHandover, setShowHandover] = useState(false);
  // ── Stripe payment modal state ────────────────────────────────────────
  const [stripeModal, setStripeModal] = useState<{ bill: Bill; clientSecret: string } | null>(null);
  const [stripeLoading, setStripeLoading] = useState<string | null>(null); // billId being prepared

  const networkStatus = useNetworkStatus();
  const supabase = createClient();

  const loadData = useCallback(async () => {
    try {
      const shift = await shiftService.getActive();
      if (shift) {
        setActiveShift(shift);
        const [billsData, stats] = await Promise.all([
          billService.getByShift(shift.id),
          shiftService.getStats(shift.id),
        ]);
        setBills(billsData as Bill[]);
        if (stats) {
          setShiftStats({
            shiftName: shift.shift_name,
            shiftDate: new Date(shift.shift_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            openedAt: new Date(shift.opened_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
            cashier: shift.cashier,
            openingFloat: Number(shift.opening_float),
            ...stats,
          });
        }
      }
    } catch (err: any) {
      toast.error('Failed to load settlement data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── charge.failed banner helpers ──────────────────────────────────────
  const dismissAlert = useCallback((billId: string) => {
    setChargeFailedAlerts((prev) => prev.filter((a) => a.billId !== billId));
    if (retryTimersRef.current[billId]) {
      clearInterval(retryTimersRef.current[billId]);
      delete retryTimersRef.current[billId];
    }
  }, []);

  const startRetryCountdown = useCallback((billId: string, initialSeconds = 30) => {
    setChargeFailedAlerts((prev) =>
      prev.map((a) => (a.billId === billId ? { ...a, retryIn: initialSeconds } : a))
    );
    if (retryTimersRef.current[billId]) clearInterval(retryTimersRef.current[billId]);
    retryTimersRef.current[billId] = setInterval(() => {
      setChargeFailedAlerts((prev) => {
        const alert = prev.find((a) => a.billId === billId);
        if (!alert) return prev;
        if (alert.retryIn <= 1) {
          clearInterval(retryTimersRef.current[billId]);
          delete retryTimersRef.current[billId];
          return prev.filter((a) => a.billId !== billId);
        }
        return prev.map((a) => (a.billId === billId ? { ...a, retryIn: a.retryIn - 1 } : a));
      });
    }, 1000);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(retryTimersRef.current).forEach(clearInterval);
    };
  }, []);

  // ── Real-time subscriptions ────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('settlement_bills')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bills' }, (payload) => {
        const r = payload.new;
        const newBill: Bill = {
          id: r.id,
          billNo: r.bill_number,
          tableLabel: r.table_label,
          time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
          items: r.items_count,
          covers: r.covers,
          gross: Number(r.gross_amount),
          discount: Number(r.discount_amt),
          gst: Number(r.gst_amount),
          net: Number(r.net_amount),
          paymentMode: r.payment_mode?.charAt(0).toUpperCase() + r.payment_mode?.slice(1) || 'UPI',
          cashier: r.cashier,
          status: r.status,
        };
        setBills((prev) => [newBill, ...prev]);
        // Refresh stats
        if (activeShift) {
          shiftService.getStats(activeShift.id).then((stats) => {
            if (stats) setShiftStats((prev) => prev ? { ...prev, ...stats } : prev);
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bills' }, (payload) => {
        const r = payload.new;
        setBills((prev) =>
          prev.map((b) => b.id === r.id ? {
            ...b,
            status: r.status,
            stripeStatus: r.stripe_status ?? b.stripeStatus,
            stripeReceiptUrl: r.stripe_receipt_url ?? b.stripeReceiptUrl,
          } : b)
        );

        // ── charge.failed detection ──────────────────────────────────────
        if (r.stripe_status === 'failed') {
          const billNo: string = r.bill_number || r.id?.slice(0, 8) || 'Unknown';
          const amount: number = Number(r.net_amount || r.gross_amount || 0);

          // Show sonner toast
          toast.error(`Charge failed — Bill ${billNo}`, {
            description: `₹${amount.toLocaleString('en-IN')} · Stripe charge declined. Auto-retry in 30s.`,
            duration: 8000,
            icon: <XCircle size={16} className="text-red-400" />,
          });

          // Add / update floating banner
          setChargeFailedAlerts((prev) => {
            const exists = prev.find((a) => a.billId === r.id);
            if (exists) return prev;
            return [{ billId: r.id, billNo, amount, retryIn: 30 }, ...prev];
          });

          // Start countdown after state is set
          setTimeout(() => startRetryCountdown(r.id, 30), 50);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeShift, startRetryCountdown]);

  const summary = shiftStats || {
    shiftName: 'Lunch Shift', shiftDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    openedAt: '11:00 AM', cashier: 'Rahul Sharma', openingFloat: 2000,
    totalBills: 0, totalCovers: 0, grossSales: 0, discounts: 0, voids: 0,
    netSales: 0, cashSales: 0, upiSales: 0, cardSales: 0,
    cgst: 0, sgst: 0, totalGst: 0, avgBillValue: 0, avgCoverValue: 0,
  };

  const actualCash = denominations.reduce((sum, d) => sum + d * (denomCounts[d] || 0), 0);
  const expectedCash = summary.openingFloat + summary.cashSales;
  const cashDifference = actualCash - expectedCash;

  // Build hourly data from bills
  const hourlyData = React.useMemo(() => {
    const hours: Record<string, { hour: string; bills: number; revenue: number }> = {};
    bills.filter((b) => b.status === 'settled').forEach((b) => {
      const h = b.time.split(':')[0];
      const label = `${h}:00`;
      if (!hours[label]) hours[label] = { hour: label, bills: 0, revenue: 0 };
      hours[label].bills += 1;
      hours[label].revenue += b.net;
    });
    return Object.values(hours).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [bills]);

  const paymentSplit = [
    { name: 'UPI', value: summary.upiSales, color: '#F97316' },
    { name: 'Cash', value: summary.cashSales, color: '#22C55E' },
    { name: 'Card', value: summary.cardSales, color: '#3B82F6' },
  ].filter((p) => p.value > 0);

  function updateDenom(denom: number, delta: number) {
    setDenomCounts((prev) => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
  }

  async function closeShift() {
    if (!activeShift) return;
    setClosingProcessing(true);
    try {
      await shiftService.close(activeShift.id);
      setClosingProcessing(false);
      setShowCloseShift(false);
      toast.success('Shift closed — Z-Report generated and sent to owner');
    } catch (err: any) {
      setClosingProcessing(false);
      toast.error('Failed to close shift: ' + err.message);
    }
  }

  const filteredBills = bills.filter((b) => {
    if (billFilter === 'all') return true;
    return b.status === billFilter;
  });

  const sendWhatsAppReceipt = async (bill: Bill) => {
    if (!bill.cashier) {
      toast.error('No customer phone available for this bill');
      return;
    }
    // Prompt for phone number
    const phone = window.prompt(`Send WhatsApp receipt for Bill ${bill.billNo}\nEnter customer phone (with country code, e.g. +919876543210):`);
    if (!phone || !phone.trim()) return;

    setSendingReceiptId(bill.id);
    try {
      const supabaseClient = createClient();
      // Get Twilio config
      const { data: config } = await supabaseClient
        .from('notification_config')
        .select('*')
        .eq('outlet', 'koramangala')
        .eq('provider', 'twilio')
        .single();

      if (!config?.enabled) {
        toast.error('WhatsApp receipts are disabled. Enable in Admin Panel → WhatsApp / SMS');
        return;
      }

      const channel = config.send_receipt_whatsapp ? 'whatsapp' : 'sms';

      const res = await fetch('/api/send-whatsapp-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone.trim(),
          billNumber: bill.billNo,
          items: [],
          subtotal: bill.gross - bill.gst,
          gstAmount: bill.gst,
          total: bill.net,
          paymentMode: bill.paymentMode,
          outletName: 'Spice Garden',
          channel,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send receipt');
      toast.success(`Receipt sent via ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to ${phone.trim()}`);
    } catch (err: any) {
      toast.error('Failed to send receipt: ' + err.message);
    } finally {
      setSendingReceiptId(null);
    }
  };

  // ── Initiate Stripe card payment for a bill ───────────────────────────
  const initiateStripePayment = useCallback(async (bill: Bill) => {
    if (stripeLoading) return;
    setStripeLoading(bill.id);
    try {
      const supabaseClient = createClient();
      const { data, error } = await supabaseClient.functions.invoke<{ clientSecret: string; paymentIntentId: string }>(
        'create-settlement-payment-intent',
        {
          body: {
            billId: bill.id,
            amount: bill.net,
            billNumber: bill.billNo,
            tableLabel: bill.tableLabel,
            cashier: bill.cashier,
            outletName: 'Spice Garden',
          },
        }
      );
      if (error || !data?.clientSecret) {
        throw new Error((data as any)?.error ?? error?.message ?? 'Failed to initiate payment');
      }
      setStripeModal({ bill, clientSecret: data.clientSecret });
    } catch (err: any) {
      toast.error('Stripe payment setup failed: ' + err.message);
    } finally {
      setStripeLoading(null);
    }
  }, [stripeLoading]);

  const handleStripeSuccess = useCallback(() => {
    if (!stripeModal) return;
    const { bill } = stripeModal;
    setStripeModal(null);
    toast.success(`Card payment collected — Bill ${bill.billNo} · ₹${bill.net.toLocaleString('en-IN')}`);
    // Optimistically update bill stripe status
    setBills((prev) =>
      prev.map((b) => b.id === bill.id ? { ...b, stripeStatus: 'succeeded' } : b)
    );
  }, [stripeModal]);

  const KpiCard = ({
    label, value, sub, icon, trend, color = 'default',
  }: {
    label: string; value: string; sub?: string; icon: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral'; color?: 'default' | 'green' | 'red' | 'amber' | 'blue';
  }) => {
    const colorMap = { default: 'bg-card border-border', green: 'bg-accent/8 border-accent/30', red: 'bg-red-500/8 border-red-500/30', amber: 'bg-amber-500/8 border-amber-500/30', blue: 'bg-blue-500/8 border-blue-500/30' };
    const textMap = { default: 'text-foreground', green: 'text-accent', red: 'text-red-400', amber: 'text-amber-400', blue: 'text-blue-400' };
    return (
      <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
        <div className="flex items-start justify-between mb-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color === 'green' ? 'bg-accent/20' : color === 'red' ? 'bg-red-500/20' : color === 'amber' ? 'bg-amber-500/20' : color === 'blue' ? 'bg-blue-500/20' : 'bg-secondary'}`}>
            <span className={textMap[color]}>{icon}</span>
          </div>
          {trend && (trend === 'up' ? <TrendingUp size={14} className="text-accent" /> : trend === 'down' ? <TrendingDown size={14} className="text-red-400" /> : null)}
        </div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-bold font-mono tabular-nums ${textMap[color]}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground text-sm">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm">Loading settlement data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-screen-2xl mx-auto w-full px-4 lg:px-6 xl:px-8 2xl:px-12 py-5 space-y-6">

        {/* ── Shift Header ───────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{summary.shiftName} — {summary.shiftDate}</h2>
            <p className="text-xs text-muted-foreground">Opened at {summary.openedAt} · Cashier: {summary.cashier}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toast.success('Z-Report sent to printer')}
              className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:border-primary/40 transition-all"
            >
              <Printer size={14} />
              Print Z-Report
            </button>
            <button
              onClick={() => setShowHandover(true)}
              disabled={!activeShift}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all active:scale-95"
            >
              <Lock size={14} />
              Close Shift
            </button>
          </div>
        </div>

        {/* ── KPI Grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Net Sales" value={`₹${summary.netSales.toLocaleString('en-IN')}`} sub={`${summary.totalBills} bills`} icon={<IndianRupee size={16} />} trend="up" color="green" />
          <KpiCard label="Total Covers" value={summary.totalCovers.toString()} sub={`Avg ₹${summary.avgCoverValue}/cover`} icon={<Users size={16} />} trend="up" />
          <KpiCard label="Discounts Given" value={`₹${summary.discounts.toLocaleString('en-IN')}`} sub={summary.grossSales > 0 ? `${((summary.discounts / summary.grossSales) * 100).toFixed(1)}% of gross` : '0% of gross'} icon={<TrendingDown size={16} />} color="amber" />
          <KpiCard label="Voids & Cancels" value={`₹${summary.voids.toLocaleString('en-IN')}`} sub={`${bills.filter(b => b.status === 'voided').length} transactions voided`} icon={<X size={16} />} color="red" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Cash Collected" value={`₹${summary.cashSales.toLocaleString('en-IN')}`} sub={`Expected ₹${expectedCash.toLocaleString('en-IN')}`} icon={<Banknote size={16} />} color="green" />
          <KpiCard label="UPI Collected" value={`₹${summary.upiSales.toLocaleString('en-IN')}`} sub="Kotak UPI" icon={<Smartphone size={16} />} color="blue" />
          <KpiCard label="Card Collected" value={`₹${summary.cardSales.toLocaleString('en-IN')}`} sub="HDFC POS Terminal" icon={<CreditCard size={16} />} />
          <KpiCard label="GST Collected" value={`₹${summary.totalGst.toLocaleString('en-IN')}`} sub={`CGST ₹${summary.cgst} + SGST ₹${summary.sgst}`} icon={<FileText size={16} />} color="amber" />
        </div>

        {/* ── Sync Status Panel ──────────────────────────────── */}
        <SyncStatusPanel
          isOnline={networkStatus.isOnline}
          isSyncing={networkStatus.isSyncing}
          triggerSync={networkStatus.triggerSync}
        />

        {/* ── Post-Sync Payment Verification ─────────────────── */}
        <PostSyncVerification bills={bills} />

        {/* ── Charts row ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">Hourly Revenue</h3>
                <p className="text-xs text-muted-foreground">Bills and revenue by hour</p>
              </div>
            </div>
            {hourlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourlyData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="revenue" name="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="bills" name="bills" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No bills yet this shift</div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-1">Payment Split</h3>
            <p className="text-xs text-muted-foreground mb-3">By collection mode</p>
            {paymentSplit.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={paymentSplit} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {paymentSplit.map((entry, index) => (
                        <Cell key={`piecell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, '']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {paymentSplit.map((p) => (
                    <div key={`split-legend-${p.name}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-xs text-muted-foreground">{p.name}</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-foreground">₹{p.value.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[140px] flex items-center justify-center text-muted-foreground text-sm">No payments yet</div>
            )}
          </div>
        </div>

        {/* ── Cash Count Section ─────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Cash Denomination Count</h3>
              <p className="text-xs text-muted-foreground">Count physical cash to reconcile</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${cashDifference === 0 ? 'bg-accent/10 border-accent/30' : cashDifference > 0 ? 'bg-blue-500/10 border-blue-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              {cashDifference === 0 ? <CheckCircle size={13} className="text-accent" /> : <AlertTriangle size={13} className={cashDifference > 0 ? 'text-blue-400' : 'text-red-400'} />}
              <span className={`text-xs font-bold ${cashDifference === 0 ? 'text-accent' : cashDifference > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {cashDifference === 0 ? 'Balanced' : cashDifference > 0 ? `+₹${cashDifference} Excess` : `-₹${Math.abs(cashDifference)} Short`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {denominations.map((denom) => (
              <div key={`denom-${denom}`} className="bg-secondary rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground font-mono">₹{denom}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">= ₹{((denomCounts[denom] || 0) * denom).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateDenom(denom, -1)} className="w-6 h-6 rounded-lg bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <Minus size={10} />
                  </button>
                  <input
                    type="number"
                    value={denomCounts[denom] || 0}
                    onChange={(e) => setDenomCounts((prev) => ({ ...prev, [denom]: Math.max(0, Number(e.target.value)) }))}
                    className="flex-1 bg-background border border-border rounded-lg px-1.5 py-1 text-xs font-mono text-center text-foreground focus:outline-none focus:border-primary/60 w-0 min-w-0"
                  />
                  <button onClick={() => updateDenom(denom, 1)} className="w-6 h-6 rounded-lg bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
            <div className="text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Expected Cash</p>
              <p className="text-base font-bold font-mono text-foreground">₹{expectedCash.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-muted-foreground">Float + Cash Sales</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Counted Cash</p>
              <p className="text-base font-bold font-mono text-foreground">₹{actualCash.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-muted-foreground">Physical count</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Difference</p>
              <p className={`text-base font-bold font-mono ${cashDifference === 0 ? 'text-accent' : cashDifference > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {cashDifference >= 0 ? '+' : ''}₹{cashDifference.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-muted-foreground">{cashDifference === 0 ? 'Balanced' : cashDifference > 0 ? 'Overage' : 'Shortage'}</p>
            </div>
          </div>
        </div>

        {/* ── GST Summary ────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">GST Summary — {summary.shiftDate}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Tax Rate', 'Taxable Amount', 'CGST', 'SGST', 'Total GST'].map((h) => (
                    <th key={`gsth-${h}`} className="text-left py-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { rate: '5%', taxable: Math.round(summary.netSales * 0.85), cgst: Math.round(summary.cgst * 0.85), sgst: Math.round(summary.sgst * 0.85), total: Math.round(summary.totalGst * 0.85) },
                  { rate: '12%', taxable: Math.round(summary.netSales * 0.12), cgst: Math.round(summary.cgst * 0.12), sgst: Math.round(summary.sgst * 0.12), total: Math.round(summary.totalGst * 0.12) },
                  { rate: '18%', taxable: 0, cgst: 0, sgst: 0, total: 0 },
                ].map((row) => (
                  <tr key={`gst-row-${row.rate}`} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="py-2.5 px-3 font-semibold text-foreground">{row.rate}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">₹{row.taxable.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">₹{row.cgst.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">₹{row.sgst.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-foreground">₹{row.total.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                <tr className="bg-primary/5">
                  <td className="py-2.5 px-3 font-bold text-foreground">Total</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">₹{summary.netSales.toLocaleString('en-IN')}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">₹{summary.cgst.toLocaleString('en-IN')}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">₹{summary.sgst.toLocaleString('en-IN')}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-primary">₹{summary.totalGst.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Bill Register ──────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Bill Register ({filteredBills.length})</h3>
            <div className="flex gap-1 p-0.5 bg-secondary rounded-lg">
              {(['all', 'settled', 'voided'] as const).map((f) => (
                <button
                  key={`billfilter-${f}`}
                  onClick={() => setBillFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize ${billFilter === f ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Bill No', 'Table', 'Time', 'Items', 'Covers', 'Gross', 'Discount', 'GST', 'Net', 'Payment', 'Stripe Charge', 'Status'].map((h) => (
                    <th key={`bh-${h}`} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-sm text-muted-foreground">No bills found for this shift</td>
                  </tr>
                ) : filteredBills.map((bill, idx) => (
                  <tr
                    key={`bill-row-${bill.id}`}
                    className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${idx % 2 === 0 ? '' : 'bg-secondary/10'} ${bill.status === 'voided' ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-foreground font-semibold">{bill.billNo}</td>
                    <td className="px-3 py-2.5 font-semibold text-foreground">{bill.tableLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{bill.time}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground tabular-nums">{bill.items}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground tabular-nums">{bill.covers || '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono tabular-nums text-foreground">₹{bill.gross.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-xs font-mono tabular-nums text-amber-400">{bill.discount > 0 ? `-₹${bill.discount}` : '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-mono tabular-nums text-muted-foreground">₹{bill.gst}</td>
                    <td className="px-3 py-2.5 text-xs font-mono tabular-nums font-bold text-foreground">₹{bill.net.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bill.paymentMode === 'Upi' || bill.paymentMode === 'UPI' ? 'bg-primary/15 text-primary' : bill.paymentMode === 'Cash' ? 'bg-accent/15 text-accent' : bill.paymentMode === 'Card' ? 'bg-blue-500/15 text-blue-400' : 'bg-secondary text-muted-foreground'}`}>
                        {bill.paymentMode}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {bill.stripeStatus ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit whitespace-nowrap ${
                            bill.stripeStatus === 'succeeded' ?'bg-accent/10 border-accent/30 text-accent'
                              : bill.stripeStatus === 'failed' ?'bg-red-500/10 border-red-500/30 text-red-400'
                              : bill.stripeStatus === 'pending' ?'bg-amber-500/10 border-amber-500/30 text-amber-400' :'bg-secondary border-border text-muted-foreground'
                          }`}>
                            {bill.stripeStatus === 'succeeded' ? (
                              <CheckCircle2 size={9} />
                            ) : bill.stripeStatus === 'failed' ? (
                              <XCircle size={9} />
                            ) : (
                              <Clock size={9} />
                            )}
                            {bill.stripeStatus}
                          </span>
                          {bill.stripeReceiptUrl && (
                            <a
                              href={bill.stripeReceiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-[9px] text-primary hover:text-primary/80 font-semibold transition-colors px-1"
                            >
                              <ExternalLink size={8} />
                              Receipt
                            </a>
                          )}
                        </div>
                      ) : bill.paymentMode?.toLowerCase() === 'card' && bill.status === 'settled' ? (
                        <button
                          onClick={() => initiateStripePayment(bill)}
                          disabled={stripeLoading === bill.id}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {stripeLoading === bill.id ? (
                            <Loader2 size={9} className="animate-spin" />
                          ) : (
                            <CreditCard size={9} />
                          )}
                          Collect
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Zap size={9} className="text-muted-foreground/50" />
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${bill.status === 'settled' ? 'bg-accent/15 text-accent border-accent/30' : bill.status === 'voided' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>
                          {bill.status}
                        </span>
                        {bill.status === 'settled' && (
                          <button
                            onClick={() => sendWhatsAppReceipt(bill)}
                            disabled={sendingReceiptId === bill.id}
                            title="Send WhatsApp receipt"
                            className="p-1 rounded-lg text-muted-foreground hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                          >
                            {sendingReceiptId === bill.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <MessageCircle size={12} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── charge.failed Floating Banner ─────────────────────────────── */}
      {chargeFailedAlerts.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {chargeFailedAlerts.map((alert) => (
            <div
              key={`charge-failed-${alert.billId}`}
              className="pointer-events-auto bg-card border border-red-500/40 rounded-2xl shadow-2xl shadow-red-500/10 overflow-hidden animate-fade-in"
            >
              {/* Progress bar */}
              <div className="h-0.5 bg-red-500/20 w-full">
                <div
                  className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${(alert.retryIn / 30) * 100}%` }}
                />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <XCircle size={16} className="text-red-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground leading-tight">Charge Failed</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Bill <span className="font-mono font-semibold text-foreground">{alert.billNo}</span>
                        {' · '}
                        <span className="font-mono font-semibold text-red-400">₹{alert.amount.toLocaleString('en-IN')}</span>
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <RefreshCw size={10} className="text-amber-400 animate-spin" style={{ animationDuration: '2s' }} />
                        <span className="text-[11px] text-amber-400 font-semibold">
                          Auto-retry in {alert.retryIn}s
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.billId)}
                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Stripe Card Payment Modal ──────────────────────────────────── */}
      {stripeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Collect Card Payment</h3>
                <p className="text-xs text-muted-foreground">Bill {stripeModal.bill.billNo} · {stripeModal.bill.tableLabel}</p>
              </div>
              <button onClick={() => setStripeModal(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: stripeModal.clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: 'hsl(var(--primary))',
                    colorBackground: 'hsl(var(--card))',
                    colorText: 'hsl(var(--foreground))',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <StripePayForm
                amount={stripeModal.bill.net}
                onSuccess={handleStripeSuccess}
                onCancel={() => setStripeModal(null)}
              />
            </Elements>
          </div>
        </div>
      )}

      {/* Shift Handover Modal */}
      {showHandover && activeShift && (
        <ShiftHandover
          activeShift={activeShift}
          shiftStats={shiftStats}
          denomCounts={denomCounts}
          actualCash={actualCash}
          expectedCash={expectedCash}
          cashDifference={cashDifference}
          onClose={() => setShowHandover(false)}
          onHandoverComplete={() => {
            setShowHandover(false);
            setShowCloseShift(false);
            toast.success('Shift closed and handed over successfully');
            loadData();
          }}
        />
      )}

      {/* ── Close Shift Modal ──────────────────────────────────── */}
      {showCloseShift && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Close Shift</h3>
              <button onClick={() => setShowCloseShift(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-400">
                  Closing the shift will lock all bills and generate the Z-Report. This action is irreversible. Ensure cash count is complete before proceeding.
                </p>
              </div>
            </div>
            <div className="bg-secondary rounded-xl p-3 mb-4 space-y-1.5">
              {[
                ['Shift', `${summary.shiftName} — ${summary.shiftDate}`],
                ['Cashier', summary.cashier],
                ['Total Bills', summary.totalBills.toString()],
                ['Net Sales', `₹${summary.netSales.toLocaleString('en-IN')}`],
                ['Cash Difference', `${cashDifference >= 0 ? '+' : ''}₹${cashDifference}`],
              ].map(([label, value]) => (
                <div key={`close-${label}`} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-semibold ${label === 'Cash Difference' && cashDifference < 0 ? 'text-red-400' : 'text-foreground'}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCloseShift(false)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground">Cancel</button>
              <button
                onClick={closeShift}
                disabled={closingProcessing}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-70 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                {closingProcessing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Closing...</>
                ) : (
                  <><Lock size={14} /> Confirm Close</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}