'use client';

import { createClient } from '@/lib/supabase/client';

export type VerificationStatus = 'verified' | 'failed' | 'pending' | 'unverified';

export interface PaymentVerificationResult {
  billId: string;
  billNo: string;
  paymentMode: string;
  amount: number;
  verificationStatus: VerificationStatus;
  providerRef?: string;
  providerMessage?: string;
  verifiedAt?: string;
  requiresCashierReview: boolean;
  reviewReason?: string;
  // Stripe-specific fields
  stripeChargeId?: string;
  stripeReceiptUrl?: string;
  stripeStatus?: string;
}

export interface VerificationSummary {
  total: number;
  verified: number;
  failed: number;
  pending: number;
  unverified: number;
  flaggedForReview: number;
}

export const paymentVerificationService = {
  /**
   * Verify a single bill's payment via the Stripe polling Edge Function.
   * Falls back gracefully if the function is unavailable.
   */
  async verifyBill(bill: {
    id: string;
    billNo: string;
    paymentMode: string;
    net: number;
    stripePaymentIntentId?: string;
  }): Promise<PaymentVerificationResult> {
    const supabase = createClient();
    const mode = bill.paymentMode.toLowerCase();

    // Cash bills don't need provider verification
    if (mode === 'cash') {
      return {
        billId: bill.id,
        billNo: bill.billNo,
        paymentMode: bill.paymentMode,
        amount: bill.net,
        verificationStatus: 'verified',
        providerMessage: 'Cash payment — no provider check required',
        verifiedAt: new Date().toISOString(),
        requiresCashierReview: false,
      };
    }

    try {
      // Call the Stripe polling Edge Function
      const { data, error } = await supabase.functions.invoke<PaymentVerificationResult>(
        'poll-stripe-payment',
        {
          body: {
            billId: bill.id,
            billNo: bill.billNo,
            paymentMode: bill.paymentMode,
            amount: bill.net,
            stripePaymentIntentId: bill.stripePaymentIntentId ?? null,
          },
        }
      );

      if (error) {
        console.error('poll-stripe-payment edge function error:', error);
        throw new Error((data as any)?.error ?? error.message ?? 'Stripe polling failed');
      }

      return data as PaymentVerificationResult;
    } catch (err: any) {
      // Graceful fallback: mark as pending with cashier review
      console.error('Stripe verification failed for bill', bill.billNo, err);

      const fallbackResult: PaymentVerificationResult = {
        billId: bill.id,
        billNo: bill.billNo,
        paymentMode: bill.paymentMode,
        amount: bill.net,
        verificationStatus: 'pending',
        providerMessage: `Stripe verification unavailable — ${err?.message ?? 'network error'}. Manual review required.`,
        verifiedAt: new Date().toISOString(),
        requiresCashierReview: true,
        reviewReason: 'Stripe API unreachable — verify payment manually with POS terminal',
      };

      // Best-effort persist fallback status
      try {
        await supabase
          .from('bills')
          .update({
            verification_status: 'pending',
            verification_message: fallbackResult.providerMessage,
            verified_at: fallbackResult.verifiedAt,
            requires_cashier_review: true,
            review_reason: fallbackResult.reviewReason,
          })
          .eq('id', bill.id);
      } catch (_) {
        // Non-fatal
      }

      return fallbackResult;
    }
  },

  /**
   * Run post-sync verification on all UPI/card bills in a shift.
   * Processes in parallel batches of 5 to avoid overwhelming Stripe API.
   */
  async verifyShiftBills(
    bills: Array<{ id: string; billNo: string; paymentMode: string; net: number; status: string; stripePaymentIntentId?: string }>,
    onProgress?: (done: number, total: number) => void
  ): Promise<PaymentVerificationResult[]> {
    const eligible = bills.filter(
      (b) => b.status === 'settled' && ['upi', 'card', 'split'].includes(b.paymentMode.toLowerCase())
    );

    const results: PaymentVerificationResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < eligible.length; i += batchSize) {
      const batch = eligible.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((b) => this.verifyBill(b)));
      results.push(...batchResults);
      onProgress?.(Math.min(i + batchSize, eligible.length), eligible.length);
    }

    return results;
  },

  /**
   * Summarise verification results for display.
   */
  summarise(results: PaymentVerificationResult[]): VerificationSummary {
    return {
      total: results.length,
      verified: results.filter((r) => r.verificationStatus === 'verified').length,
      failed: results.filter((r) => r.verificationStatus === 'failed').length,
      pending: results.filter((r) => r.verificationStatus === 'pending').length,
      unverified: results.filter((r) => r.verificationStatus === 'unverified').length,
      flaggedForReview: results.filter((r) => r.requiresCashierReview).length,
    };
  },

  /**
   * Re-verify a single bill (e.g., after cashier manually retries).
   */
  async retryVerification(bill: {
    id: string;
    billNo: string;
    paymentMode: string;
    net: number;
    stripePaymentIntentId?: string;
  }): Promise<PaymentVerificationResult> {
    return this.verifyBill(bill);
  },
};
