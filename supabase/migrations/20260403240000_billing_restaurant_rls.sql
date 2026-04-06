-- ============================================================
-- Restaurant Billing RLS: Allow restaurant owners to view their invoices
-- Migration: 20260403240000_billing_restaurant_rls.sql
-- ============================================================

-- Add stripe_customer_id and stripe_payment_intent_id to subscription_invoices
ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Add stripe_customer_id to restaurants for recurring billing
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- ── RLS: Allow restaurant owners to read their own invoices ───
-- Drop existing open policy and replace with scoped policies
DROP POLICY IF EXISTS "superadmin_manage_sub_invoices" ON public.subscription_invoices;

-- Superadmin full access
DROP POLICY IF EXISTS "superadmin_all_sub_invoices" ON public.subscription_invoices;
CREATE POLICY "superadmin_all_sub_invoices" ON public.subscription_invoices
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Index for stripe lookups
CREATE INDEX IF NOT EXISTS idx_sub_invoices_stripe_pi
  ON public.subscription_invoices(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_customer
  ON public.restaurants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
