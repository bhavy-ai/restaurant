import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

// Map Stripe charge/payment_intent status to our internal fields
function mapChargeStatus(charge: Stripe.Charge): {
  stripeStatus: string;
  verificationStatus: 'verified' | 'failed' | 'pending';
  verificationMessage: string;
  requiresCashierReview: boolean;
  reviewReason: string | null;
} {
  switch (charge.status) {
    case 'succeeded':
      return {
        stripeStatus: 'succeeded',
        verificationStatus: 'verified',
        verificationMessage: `Stripe charge confirmed — ${charge.payment_method_details?.type ?? 'card'} payment succeeded`,
        requiresCashierReview: false,
        reviewReason: null,
      };
    case 'failed':
      return {
        stripeStatus: 'failed',
        verificationStatus: 'failed',
        verificationMessage: `Stripe charge failed — ${charge.failure_message ?? 'payment declined'}`,
        requiresCashierReview: true,
        reviewReason: `Stripe charge failed: ${charge.failure_message ?? 'unknown reason'} — re-collect payment`,
      };
    case 'pending':
      return {
        stripeStatus: 'pending',
        verificationStatus: 'pending',
        verificationMessage: 'Stripe charge pending — awaiting bank confirmation',
        requiresCashierReview: true,
        reviewReason: 'Stripe charge still pending — check again before shift close',
      };
    default:
      return {
        stripeStatus: charge.status,
        verificationStatus: 'pending',
        verificationMessage: `Stripe charge status: ${charge.status}`,
        requiresCashierReview: true,
        reviewReason: `Unexpected Stripe charge status: ${charge.status}`,
      };
  }
}

async function handleChargeEvent(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;

  if (!paymentIntentId) {
    console.warn('stripe-webhook: charge has no payment_intent id, skipping bill update');
    return { updated: false, reason: 'no_payment_intent_id' };
  }

  // Find the bill linked to this payment intent
  const { data: bills, error: fetchError } = await supabase
    .from('bills')
    .select('id, bill_number, stripe_charge_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .limit(5);

  if (fetchError) {
    console.error('stripe-webhook: failed to fetch bills', fetchError);
    throw new Error(`DB fetch error: ${fetchError.message}`);
  }

  if (!bills || bills.length === 0) {
    console.info(`stripe-webhook: no bill found for payment_intent ${paymentIntentId}`);
    return { updated: false, reason: 'no_matching_bill' };
  }

  const mapped = mapChargeStatus(charge);
  const now = new Date().toISOString();

  // Update all matching bills (usually 1)
  const updatePayload = {
    stripe_charge_id: charge.id,
    stripe_receipt_url: charge.receipt_url ?? null,
    stripe_status: mapped.stripeStatus,
    verification_status: mapped.verificationStatus,
    verification_ref: charge.id,
    verification_message: mapped.verificationMessage,
    verified_at: now,
    requires_cashier_review: mapped.requiresCashierReview,
    review_reason: mapped.reviewReason,
    // Mark bill as refunded if charge was reversed
    ...(charge.refunded ? { status: 'refunded' } : {}),
  };

  const { error: updateError } = await supabase
    .from('bills')
    .update(updatePayload)
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (updateError) {
    console.error('stripe-webhook: failed to update bills', updateError);
    throw new Error(`DB update error: ${updateError.message}`);
  }

  console.info(
    `stripe-webhook: updated ${bills.length} bill(s) for payment_intent ${paymentIntentId} → status=${mapped.stripeStatus}`
  );
  return { updated: true, billCount: bills.length, stripeStatus: mapped.stripeStatus };
}

async function recordWebhookEvent(eventId: string, eventType: string, processed: boolean, error?: string) {
  try {
    await supabase.from('stripe_webhook_events').upsert(
      {
        stripe_event_id: eventId,
        event_type: eventType,
        processed,
        processed_at: new Date().toISOString(),
        error_message: error ?? null,
      },
      { onConflict: 'stripe_event_id' }
    );
  } catch (e) {
    console.error('stripe-webhook: failed to record event', e);
  }
}

async function isEventAlreadyProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from('stripe_webhook_events')
    .select('processed')
    .eq('stripe_event_id', eventId)
    .eq('processed', true)
    .maybeSingle();
  return data !== null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  // Verify Stripe webhook signature (skip if no secret configured — dev mode)
  let event: Stripe.Event;
  if (WEBHOOK_SECRET) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature ?? '', WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('stripe-webhook: signature verification failed', err?.message);
      return new Response(JSON.stringify({ error: `Webhook signature invalid: ${err?.message}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // Dev/test mode: parse without verification
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Idempotency check — skip already-processed events
  const alreadyDone = await isEventAlreadyProcessed(event.id);
  if (alreadyDone) {
    console.info(`stripe-webhook: event ${event.id} already processed, skipping`);
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle supported charge events
  const supportedEvents = ['charge.succeeded', 'charge.failed', 'charge.updated'];

  if (!supportedEvents.includes(event.type)) {
    // Acknowledge unsupported events without error
    return new Response(JSON.stringify({ received: true, handled: false, type: event.type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const charge = event.data.object as Stripe.Charge;
    const result = await handleChargeEvent(charge);
    await recordWebhookEvent(event.id, event.type, true);

    return new Response(JSON.stringify({ received: true, handled: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`stripe-webhook: error handling ${event.type}`, err);
    await recordWebhookEvent(event.id, event.type, false, err?.message);

    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
