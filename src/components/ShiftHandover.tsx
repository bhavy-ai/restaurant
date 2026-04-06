'use client';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { X, AlertTriangle, User, FileText, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ShiftHandoverProps {
  activeShift: any;
  shiftStats: any;
  denomCounts: Record<number, number>;
  actualCash: number;
  expectedCash: number;
  cashDifference: number;
  onClose: () => void;
  onHandoverComplete: () => void;
}

const denominations = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function ShiftHandover({
  activeShift, shiftStats, denomCounts, actualCash, expectedCash, cashDifference,
  onClose, onHandoverComplete,
}: ShiftHandoverProps) {
  const supabase = createClient();
  const [incomingCashier, setIncomingCashier] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'review' | 'signoff'>('review');

  async function completeHandover() {
    if (!incomingCashier.trim()) {
      toast.error('Enter incoming cashier name');
      return;
    }

    setProcessing(true);
    try {
      // Update shift with handover details
      await supabase
        .from('shifts')
        .update({
          closing_cash_count: actualCash,
          cash_difference: cashDifference,
          handover_notes: handoverNotes,
          incoming_cashier: incomingCashier,
          signed_off_by: shiftStats?.cashier || 'Cashier',
          signed_off_at: new Date().toISOString(),
          is_closed: true,
          closed_at: new Date().toISOString(),
        })
        .eq('id', activeShift.id);

      // Log to audit
      await supabase.from('audit_logs').insert({
        staff_name: shiftStats?.cashier || 'Cashier',
        staff_role: 'cashier',
        action: 'shift_handover',
        entity: 'shifts',
        details: `Shift closed. Cash count: ₹${actualCash}. Difference: ₹${cashDifference}. Handed over to: ${incomingCashier}. Notes: ${handoverNotes || 'None'}`,
        severity: cashDifference !== 0 ? 'warning' : 'info',
        outlet: activeShift.outlet || 'koramangala',
      });

      toast.success(`Shift handed over to ${incomingCashier} — Z-Report generated`);
      onHandoverComplete();
    } catch (err: any) {
      toast.error('Handover failed: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-foreground">Shift Handover</h3>
            <p className="text-xs text-muted-foreground">Cash count sign-off & shift closure</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
          {/* Shift Summary */}
          <div className="bg-secondary rounded-2xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shift Summary</h4>
            {[
              ['Shift', `${shiftStats?.shiftName || 'Shift'} — ${shiftStats?.shiftDate || ''}`],
              ['Outgoing Cashier', shiftStats?.cashier || '—'],
              ['Total Bills', shiftStats?.totalBills?.toString() || '0'],
              ['Net Sales', `₹${(shiftStats?.netSales || 0).toLocaleString('en-IN')}`],
              ['Cash Sales', `₹${(shiftStats?.cashSales || 0).toLocaleString('en-IN')}`],
            ].map(([label, value]) => (
              <div key={`hs-${label}`} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>

          {/* Cash Count Summary */}
          <div className={`rounded-2xl p-4 border ${cashDifference === 0 ? 'bg-accent/8 border-accent/30' : cashDifference > 0 ? 'bg-blue-500/8 border-blue-500/30' : 'bg-red-500/8 border-red-500/30'}`}>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Cash Count</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Expected</p>
                <p className="text-sm font-bold font-mono text-foreground">₹{expectedCash.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Counted</p>
                <p className="text-sm font-bold font-mono text-foreground">₹{actualCash.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Difference</p>
                <p className={`text-sm font-bold font-mono ${cashDifference === 0 ? 'text-accent' : cashDifference > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {cashDifference >= 0 ? '+' : ''}₹{cashDifference.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            {cashDifference !== 0 && (
              <div className="flex items-start gap-2 mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-amber-400">
                  Cash {cashDifference > 0 ? 'overage' : 'shortage'} of ₹{Math.abs(cashDifference)} detected. This will be recorded in the audit log.
                </p>
              </div>
            )}
          </div>

          {/* Denomination Breakdown */}
          <div className="bg-secondary rounded-2xl p-4">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Denomination Breakdown</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {denominations.filter((d) => (denomCounts[d] || 0) > 0).map((d) => (
                <div key={`denom-${d}`} className="flex justify-between text-xs px-2 py-1 bg-background rounded-lg">
                  <span className="text-muted-foreground">₹{d} × {denomCounts[d]}</span>
                  <span className="font-mono font-semibold text-foreground">₹{(d * (denomCounts[d] || 0)).toLocaleString('en-IN')}</span>
                </div>
              ))}
              {denominations.every((d) => !denomCounts[d]) && (
                <p className="text-xs text-muted-foreground col-span-2 text-center py-2">No denominations counted</p>
              )}
            </div>
          </div>

          {/* Handover Details */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                <User size={12} className="inline mr-1" />
                Incoming Cashier Name *
              </label>
              <input
                value={incomingCashier}
                onChange={(e) => setIncomingCashier(e.target.value)}
                placeholder="Enter name of incoming cashier"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                <FileText size={12} className="inline mr-1" />
                Handover Notes
              </label>
              <textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Any pending issues, special notes, or observations..."
                rows={3}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-400">
              Completing handover will close this shift permanently. All bills will be locked and a Z-Report will be generated.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all">
            Cancel
          </button>
          <button
            onClick={completeHandover}
            disabled={processing || !incomingCashier.trim()}
            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
          >
            {processing ? (
              <><Loader2 size={14} className="animate-spin" /> Processing...</>
            ) : (
              <><Lock size={14} /> Complete Handover</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
