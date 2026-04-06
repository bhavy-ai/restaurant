-- ============================================================
-- Stripe Webhook Event Tracking
-- Migration: 20260324174000_stripe_webhook_events.sql
-- ============================================================

-- Table to track processed Stripe webhook events (idempotency guard)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id   TEXT        NOT NULL UNIQUE,
  event_type        TEXT        NOT NULL,
  processed         BOOLEAN     NOT NULL DEFAULT false,
  processed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup by stripe_event_id for idempotency checks
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_stripe_event_id
  ON public.stripe_webhook_events (stripe_event_id);

-- Index for querying failed events
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
  ON public.stripe_webhook_events (processed, created_at DESC);

-- Enable RLS
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role (Edge Function) has full access; anon/authenticated have no access
DROP POLICY IF EXISTS "service_role_manage_stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "service_role_manage_stripe_webhook_events"
  ON public.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
