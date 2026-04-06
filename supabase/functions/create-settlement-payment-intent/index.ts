import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { billId, amount, billNumber, tableLabel, cashier, outletName } = await req.json();

    if (!billId || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'billId and amount are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if bill already has a payment intent
    const { data: existingBill } = await supabase
      .from('bills')
      .select('stripe_payment_intent_id, stripe_status')
      .eq('id', billId)
      .single();

    if (existingBill?.stripe_payment_intent_id && existingBill?.stripe_status === 'succeeded') {
      return new Response(JSON.stringify({ error: 'Bill already has a successful Stripe payment' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reuse existing pending payment intent if available
    if (existingBill?.stripe_payment_intent_id && existingBill?.stripe_status !== 'failed') {
      const existing = await stripe.paymentIntents.retrieve(existingBill.stripe_payment_intent_id);
      if (existing.status === 'requires_payment_method' || existing.status === 'requires_confirmation') {
        return new Response(
          JSON.stringify({ clientSecret: existing.client_secret, paymentIntentId: existing.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create new Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // paise
      currency: 'inr',
      description: `Bill ${billNumber} — ${tableLabel} — ${outletName || 'RestroOS'}`,
      metadata: {
        bill_id: billId,
        bill_number: billNumber,
        table_label: tableLabel,
        cashier: cashier || '',
        outlet: outletName || 'RestroOS',
      },
      automatic_payment_methods: { enabled: true },
    });

    // Save payment intent id to bill
    await supabase
      .from('bills')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        stripe_status: 'pending',
      })
      .eq('id', billId);

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('create-settlement-payment-intent error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Failed to create payment intent' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
