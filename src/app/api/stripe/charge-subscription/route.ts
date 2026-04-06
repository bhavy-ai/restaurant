import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-06-20',
});

// POST /api/stripe/charge-subscription
// Body: { invoiceId: string }
// Charges the restaurant's Stripe customer for a subscription invoice
export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch the invoice with restaurant info
    const { data: invoice, error: invErr } = await supabase
      .from('subscription_invoices')
      .select('*, restaurant:restaurants(id, name, stripe_customer_id, gstin)')
      .eq('id', invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });
    }

    const restaurant = invoice.restaurant as any;
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    // Get or create Stripe customer for this restaurant
    let stripeCustomerId: string = restaurant.stripe_customer_id ?? '';

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: restaurant.name,
        metadata: {
          restaurant_id: restaurant.id,
          gstin: restaurant.gstin ?? '',
        },
      });
      stripeCustomerId = customer.id;

      // Persist customer id
      await supabase
        .from('restaurants')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', restaurant.id);
    }

    // Amount in paise (INR smallest unit)
    const amountPaise = Math.round(invoice.total_amount * 100);

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPaise,
      currency: 'inr',
      customer: stripeCustomerId,
      description: `RestroOS Subscription — ${invoice.plan_name} plan — ${invoice.billing_month}`,
      metadata: {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        restaurant_id: restaurant.id,
        billing_month: invoice.billing_month,
      },
      automatic_payment_methods: { enabled: true },
    });

    // Update invoice with payment intent
    await supabase
      .from('subscription_invoices')
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_payment_intent_id: paymentIntent.id,
        status: 'issued',
        issued_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: invoice.total_amount,
      currency: 'INR',
    });
  } catch (err: any) {
    console.error('charge-subscription error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

// GET /api/stripe/charge-subscription?restaurantId=xxx
// Returns all invoices for a restaurant
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get('restaurantId');

    if (!restaurantId) {
      return NextResponse.json({ error: 'restaurantId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: invoices, error } = await supabase
      .from('subscription_invoices')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('billing_month', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoices: invoices ?? [] });
  } catch (err: any) {
    console.error('get-invoices error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
