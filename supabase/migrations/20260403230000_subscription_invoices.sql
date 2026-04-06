-- ============================================================
-- Subscription Charge Scheduler: subscription_invoices table
-- Migration: 20260403230000_subscription_invoices.sql
-- ============================================================

-- ── STEP 1: Create subscription_invoices table ────────────────
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       UUID          NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_number      TEXT          NOT NULL UNIQUE,
  billing_month       TEXT          NOT NULL,           -- e.g. "2026-04"
  billing_period_start DATE         NOT NULL,
  billing_period_end   DATE         NOT NULL,
  plan_name           TEXT          NOT NULL,
  plan_fee            NUMERIC(12,2) NOT NULL DEFAULT 0,
  outlet_count        INTEGER       NOT NULL DEFAULT 1,
  total_bills         INTEGER       NOT NULL DEFAULT 0,
  total_revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,
  overage_outlets     INTEGER       NOT NULL DEFAULT 0,
  overage_fee         NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate            NUMERIC(5,2)  NOT NULL DEFAULT 18,
  gst_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','paid','overdue','void')),
  notes               TEXT,
  generated_by        UUID          REFERENCES public.platform_superadmins(id),
  generated_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_at           TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── STEP 2: Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sub_invoices_restaurant
  ON public.subscription_invoices(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_billing_month
  ON public.subscription_invoices(billing_month);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_status
  ON public.subscription_invoices(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_invoices_restaurant_month
  ON public.subscription_invoices(restaurant_id, billing_month);

-- ── STEP 3: RLS ───────────────────────────────────────────────
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_manage_sub_invoices" ON public.subscription_invoices;
CREATE POLICY "superadmin_manage_sub_invoices" ON public.subscription_invoices
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 4: updated_at trigger ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_invoices_updated_at ON public.subscription_invoices;
CREATE TRIGGER trg_sub_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
