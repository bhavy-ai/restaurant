-- ============================================================
-- Stripe Payment Tracking — Add Stripe columns to bills table
-- Migration: 20260324173200_stripe_payment_tracking.sql
-- ============================================================

-- Add Stripe-specific columns to bills table (idempotent)
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS stripe_status TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_ref TEXT,
  ADD COLUMN IF NOT EXISTS verification_message TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_cashier_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- Index for fast lookup by stripe payment intent
CREATE INDEX IF NOT EXISTS idx_bills_stripe_payment_intent_id
  ON public.bills (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Index for verification status queries
CREATE INDEX IF NOT EXISTS idx_bills_verification_status
  ON public.bills (verification_status);
