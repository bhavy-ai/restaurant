import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface PollRequest {
  billId: string;
  billNo: string;
  paymentMode: string;
  amount: number;
  stripePaymentIntentId?: string;
}

interface PollResult {
  billId: string;
  billNo: string;
  paymentMode: string;
  amount: number;
  verificationStatus: 'verified' | 'failed' | 'pending' | 'unverified';
  providerRef?: string;
  providerMessage: string;
  verifiedAt: string;
  requiresCashierReview: boolean;
  reviewReason?: string;
  stripeChargeId?: string;
  stripeReceiptUrl?: string;
  stripeStatus?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = (await req.json()) as PollRequest;
    const { billId, billNo, paymentMode, amount, stripePaymentIntentId } = body;

    const mode = paymentMode.toLowerCase();
    const verifiedAt = new Date().toISOString();

    // Cash payments don't need Stripe verification
    if (mode === 'cash') {
      const result: PollResult = {
        billId,
        billNo,
        paymentMode,
        amount,
        verificationStatus: 'verified',
        providerMessage: 'Cash payment — no provider check required',
        verifiedAt,
        requiresCashierReview: false,
      };
      await persistVerification(billId, result);
      return jsonResponse(result);
    }

    // If no Stripe PaymentIntent ID, mark as pending for manual review
    if (!stripePaymentIntentId) {
      const result: PollResult = {
        billId,
        billNo,
        paymentMode,
        amount,
        verificationStatus: 'pending',
        providerMessage: `No Stripe PaymentIntent ID linked — ${mode.toUpperCase()} charge requires manual verification`,
        verifiedAt,
        requiresCashierReview: true,
        reviewReason: `${paymentMode} charge has no Stripe reference — verify with POS terminal`,
      };
      await persistVerification(billId, result);
      return jsonResponse(result);
    }

    // Poll Stripe for real payment intent status
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
        expand: ['latest_charge'],
      });
    } catch (stripeErr: any) {
      const result: PollResult = {
        billId,
        billNo,
        paymentMode,
        amount,
        verificationStatus: 'failed',
        providerMessage: `Stripe lookup failed: ${stripeErr?.message ?? 'Unknown error'}`,
        verifiedAt,
        requiresCashierReview: true,
        reviewReason: `Stripe API error — ${stripeErr?.message ?? 'could not retrieve payment intent'}`,
      };
      await persistVerification(billId, result);
      return jsonResponse(result);
    }

    // Map Stripe status to our verification status
    let verificationStatus: PollResult['verificationStatus'];
    let providerMessage: string;
    let requiresCashierReview = false;
    let reviewReason: string | undefined;

    const charge = paymentIntent.latest_charge as Stripe.Charge | null;
    const stripeChargeId = charge?.id;
    const stripeReceiptUrl = charge?.receipt_url ?? undefined;
    const stripeStatus = paymentIntent.status;

    switch (paymentIntent.status) {
      case 'succeeded':
        verificationStatus = 'verified';
        providerMessage = `Stripe charge confirmed — ${charge?.payment_method_details?.type ?? mode} payment succeeded`;
        break;
      case 'processing':
        verificationStatus = 'pending';
        providerMessage = 'Stripe payment still processing — awaiting final confirmation';
        requiresCashierReview = true;
        reviewReason = 'Payment processing at Stripe — check again before shift close';
        break;
      case 'requires_payment_method': case'requires_confirmation': case'requires_action':
        verificationStatus = 'pending';
        providerMessage = `Stripe payment requires action (status: ${paymentIntent.status})`;
        requiresCashierReview = true;
        reviewReason = `Stripe payment incomplete — status: ${paymentIntent.status}`;
        break;
      case 'canceled':
        verificationStatus = 'failed';
        providerMessage = 'Stripe payment was canceled — charge did not go through';
        requiresCashierReview = true;
        reviewReason = 'Stripe payment canceled — verify with customer and re-collect if needed';
        break;
      default:
        verificationStatus = 'failed';
        providerMessage = `Unexpected Stripe status: ${paymentIntent.status}`;
        requiresCashierReview = true;
        reviewReason = `Unknown Stripe payment status: ${paymentIntent.status}`;
    }

    const result: PollResult = {
      billId,
      billNo,
      paymentMode,
      amount,
      verificationStatus,
      providerRef: stripeChargeId,
      providerMessage,
      verifiedAt,
      requiresCashierReview,
      reviewReason,
      stripeChargeId,
      stripeReceiptUrl: stripeReceiptUrl ?? undefined,
      stripeStatus,
    };

    await persistVerification(billId, result);
    return jsonResponse(result);
  } catch (err: any) {
    console.error('poll-stripe-payment error:', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});

async function persistVerification(billId: string, result: PollResult) {
  try {
    await supabase
      .from('bills')
      .update({
        verification_status: result.verificationStatus,
        verification_ref: result.providerRef ?? null,
        verification_message: result.providerMessage,
        verified_at: result.verifiedAt,
        requires_cashier_review: result.requiresCashierReview,
        review_reason: result.reviewReason ?? null,
        stripe_charge_id: result.stripeChargeId ?? null,
        stripe_receipt_url: result.stripeReceiptUrl ?? null,
        stripe_status: result.stripeStatus ?? null,
      })
      .eq('id', billId);
  } catch (e) {
    console.error('Failed to persist verification for bill', billId, e);
  }
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
