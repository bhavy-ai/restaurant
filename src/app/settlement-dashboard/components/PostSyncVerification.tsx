'use client';

import React, { useState, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Clock, Loader2, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Smartphone, CreditCard, Banknote, Eye, RotateCcw, ExternalLink, Zap,  } from 'lucide-react';
import {
  paymentVerificationService,
  PaymentVerificationResult,
  VerificationSummary,
  VerificationStatus,
} from '@/lib/services/paymentVerificationService';

interface Bill {
  id: string;
  billNo: string;
  tableLabel: string;
  paymentMode: string;
  net: number;
  status: string;
  stripePaymentIntentId?: string;
}

interface PostSyncVerificationProps {
  bills: Bill[];
}

const statusConfig: Record<VerificationStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  verified: {
    label: 'Verified',
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/30',
    icon: <CheckCircle size={13} />,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: <XCircle size={13} />,
  },
  pending: {
    label: 'Pending',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: <Clock size={13} />,
  },
  unverified: {
    label: 'Unverified',
    color: 'text-muted-foreground',
    bg: 'bg-secondary',
    border: 'border-border',
    icon: <Eye size={13} />,
  },
};

const paymentIcon = (mode: string) => {
  const m = mode.toLowerCase();
  if (m === 'upi') return <Smartphone size={13} className="text-primary" />;
  if (m === 'card') return <CreditCard size={13} className="text-blue-400" />;
  return <Banknote size={13} className="text-accent" />;
};

export default function PostSyncVerification({ bills }: PostSyncVerificationProps) {
  const [results, setResults] = useState<PaymentVerificationResult[]>([]);
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const eligibleCount = bills.filter(
    (b) => b.status === 'settled' && ['upi', 'card', 'split'].includes(b.paymentMode.toLowerCase())
  ).length;

  const runVerification = useCallback(async () => {
    setRunning(true);
    setProgress({ done: 0, total: eligibleCount });
    setResults([]);
    setSummary(null);

    try {
      const res = await paymentVerificationService.verifyShiftBills(bills, (done, total) => {
        setProgress({ done, total });
      });
      setResults(res);
      setSummary(paymentVerificationService.summarise(res));
      setHasRun(true);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [bills, eligibleCount]);

  const handleRetry = useCallback(async (result: PaymentVerificationResult) => {
    setRetryingId(result.billId);
    try {
      const bill = bills.find((b) => b.id === result.billId);
      if (!bill) return;
      const updated = await paymentVerificationService.retryVerification(bill);
      setResults((prev) => {
        const next = prev.map((r) => (r.billId === updated.billId ? updated : r));
        setSummary(paymentVerificationService.summarise(next));
        return next;
      });
    } finally {
      setRetryingId(null);
    }
  }, [bills]);

  const displayResults = showFlaggedOnly ? results.filter((r) => r.requiresCashierReview) : results;

  const panelStatus = () => {
    if (!hasRun) return { label: 'Not Run', color: 'text-muted-foreground', bg: 'bg-secondary border-border', icon: <ShieldCheck size={12} /> };
    if (running) return { label: 'Verifying…', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: <Loader2 size={12} className="animate-spin" /> };
    if (summary && summary.flaggedForReview > 0) return { label: `${summary.flaggedForReview} Flagged`, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: <ShieldAlert size={12} /> };
    if (summary && summary.failed === 0 && summary.pending === 0) return { label: 'All Clear', color: 'text-accent', bg: 'bg-accent/10 border-accent/30', icon: <ShieldCheck size={12} /> };
    return { label: 'Issues Found', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: <ShieldAlert size={12} /> };
  };

  const badge = panelStatus();

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* ── Panel Header ── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
            <Zap size={16} className="text-muted-foreground" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-foreground">Stripe Payment Verification</h3>
            <p className="text-xs text-muted-foreground">Real-time UPI &amp; card charge status via Stripe</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${badge.bg} ${badge.color}`}>
            {badge.icon}
            {badge.label}
          </span>
          {expanded ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* ── Action Bar ── */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-secondary/20">
            <p className="text-xs text-muted-foreground">
              {eligibleCount} UPI/card bill{eligibleCount !== 1 ? 's' : ''} eligible · Stripe live polling
            </p>
            <div className="flex items-center gap-2">
              {hasRun && summary && summary.flaggedForReview > 0 && (
                <button
                  onClick={() => setShowFlaggedOnly((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${showFlaggedOnly ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
                >
                  <AlertTriangle size={11} />
                  {showFlaggedOnly ? 'Show All' : `Show Flagged (${summary.flaggedForReview})`}
                </button>
              )}
              <button
                onClick={runVerification}
                disabled={running || eligibleCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 border border-primary/30 text-primary rounded-lg text-xs font-semibold hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {running ? (
                  <><Loader2 size={11} className="animate-spin" /> Polling Stripe…</>
                ) : (
                  <><Zap size={11} /> {hasRun ? 'Re-poll Stripe' : 'Poll Stripe'}</>
                )}
              </button>
            </div>
          </div>

          {/* ── Progress Bar ── */}
          {running && progress && (
            <div className="px-5 py-2 border-t border-border bg-secondary/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">Polling Stripe for charge status…</span>
                <span className="text-[11px] font-mono text-muted-foreground">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {/* ── Summary Tiles ── */}
          {summary && !running && (
            <div className="grid grid-cols-4 gap-0 border-t border-border divide-x divide-border">
              {[
                { label: 'Verified', count: summary.verified, color: 'text-accent', icon: <CheckCircle size={14} /> },
                { label: 'Failed', count: summary.failed, color: 'text-red-400', icon: <XCircle size={14} /> },
                { label: 'Pending', count: summary.pending, color: 'text-amber-400', icon: <Clock size={14} /> },
                { label: 'Flagged', count: summary.flaggedForReview, color: 'text-orange-400', icon: <ShieldAlert size={14} /> },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center py-3 px-2">
                  <span className={`${stat.color} mb-1`}>{stat.icon}</span>
                  <span className={`text-lg font-bold font-mono tabular-nums ${stat.count > 0 ? stat.color : 'text-muted-foreground'}`}>{stat.count}</span>
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{stat.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Cashier Review Banner ── */}
          {summary && summary.flaggedForReview > 0 && !running && (
            <div className="mx-5 mt-3 mb-0 flex items-start gap-2.5 bg-red-500/8 border border-red-500/25 rounded-xl px-4 py-3">
              <ShieldX size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-400 mb-0.5">Cashier Review Required</p>
                <p className="text-[11px] text-red-400/80">
                  {summary.flaggedForReview} transaction{summary.flaggedForReview !== 1 ? 's' : ''} could not be confirmed by Stripe.
                  Verify with UPI/POS terminal before closing the shift.
                </p>
              </div>
            </div>
          )}

          {/* ── Results Table ── */}
          {hasRun && !running && (
            <div className="border-t border-border mt-3">
              {displayResults.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <CheckCircle size={22} className="text-accent/60" />
                  <p className="text-xs font-medium">No flagged transactions</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Bill No', 'Table', 'Mode', 'Amount', 'Status', 'Stripe Response', 'Charge ID', 'Receipt', 'Action'].map((h) => (
                          <th key={`pvh-${h}`} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayResults.map((r, idx) => {
                        const cfg = statusConfig[r.verificationStatus];
                        const bill = bills.find((b) => b.id === r.billId);
                        return (
                          <tr
                            key={`pvr-${r.billId}`}
                            className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${idx % 2 !== 0 ? 'bg-secondary/10' : ''} ${r.requiresCashierReview ? 'bg-red-500/3' : ''}`}
                          >
                            <td className="px-3 py-2.5 font-mono text-xs font-semibold text-foreground">{r.billNo}</td>
                            <td className="px-3 py-2.5 text-xs text-foreground">{bill?.tableLabel || '—'}</td>
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-1 text-xs text-foreground">
                                {paymentIcon(r.paymentMode)}
                                {r.paymentMode}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs font-mono tabular-nums font-bold text-foreground">
                              ₹{r.amount.toLocaleString('en-IN')}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                                  {cfg.icon}
                                  {cfg.label}
                                </span>
                                {r.stripeStatus && (
                                  <span className="text-[9px] font-mono text-muted-foreground px-1">
                                    stripe: {r.stripeStatus}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-muted-foreground max-w-[200px]">
                              <span className={r.requiresCashierReview ? 'text-amber-400' : ''}>
                                {r.providerMessage || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
                              {r.stripeChargeId || r.providerRef || '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              {r.stripeReceiptUrl ? (
                                <a
                                  href={r.stripeReceiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold transition-colors"
                                >
                                  <ExternalLink size={10} />
                                  View
                                </a>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {r.requiresCashierReview && (
                                <button
                                  onClick={() => handleRetry(r)}
                                  disabled={retryingId === r.billId}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-primary/15 border border-primary/30 text-primary rounded-lg text-[10px] font-semibold hover:bg-primary/25 disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                  {retryingId === r.billId ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <RotateCcw size={10} />
                                  )}
                                  Retry
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Empty / Not Run State ── */}
          {!hasRun && !running && (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground border-t border-border">
              <Zap size={28} className="text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-xs font-semibold text-foreground mb-0.5">No Stripe verification run yet</p>
                <p className="text-[11px] text-muted-foreground">
                  Click "Poll Stripe" to check all UPI &amp; card charges against Stripe in real-time.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
