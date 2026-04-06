-- ============================================================
-- Phase 6: Hardening — Indexes, Constraints, Audit Improvements
-- Migration: 20260403192000_phase6_hardening.sql
--
-- Goals:
--   1. Add composite indexes for all tenant-scoped queries
--   2. Add updated_at trigger for restaurants and outlets
--   3. Add soft-delete support (deleted_at) on key tables
--   4. Add bill_items table for price snapshot (historical correctness)
--   5. Add cross-restaurant reporting index
-- ============================================================

-- ── STEP 1: Composite indexes for tenant-scoped queries ───────

-- bills: most queried table
CREATE INDEX IF NOT EXISTS idx_bills_restaurant_outlet_date
  ON public.bills(restaurant_id, outlet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bills_restaurant_status
  ON public.bills(restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_bills_shift
  ON public.bills(shift_id, restaurant_id);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_outlet
  ON public.orders(restaurant_id, outlet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders(restaurant_id, status);

-- kots
CREATE INDEX IF NOT EXISTS idx_kots_restaurant_outlet_status
  ON public.kots(restaurant_id, outlet, status);

-- menu_items
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant
  ON public.menu_items(restaurant_id, category);

-- restaurant_tables
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_outlet
  ON public.restaurant_tables(restaurant_id, outlet, status);

-- inventory_items
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant_outlet
  ON public.inventory_items(restaurant_id, outlet);

-- staff_users
CREATE INDEX IF NOT EXISTS idx_staff_restaurant
  ON public.staff_users(restaurant_id, role);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_restaurant_outlet_date
  ON public.audit_logs(restaurant_id, outlet, created_at DESC);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_restaurant
  ON public.customers(restaurant_id);

-- discounts
CREATE INDEX IF NOT EXISTS idx_discounts_restaurant
  ON public.discounts(restaurant_id);

-- takeaway_orders
CREATE INDEX IF NOT EXISTS idx_takeaway_restaurant_outlet
  ON public.takeaway_orders(restaurant_id, outlet, created_at DESC);

-- ── STEP 2: Add soft-delete to key tables ─────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── STEP 3: Add updated_at trigger for restaurants ────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurants_updated_at ON public.restaurants;
CREATE TRIGGER trg_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_outlets_updated_at ON public.outlets;
CREATE TRIGGER trg_outlets_updated_at
  BEFORE UPDATE ON public.outlets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── STEP 4: bill_items table for price snapshot ───────────────
-- Ensures historical correctness: prices at order time are preserved
-- even if menu prices change later
CREATE TABLE IF NOT EXISTS public.bill_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       UUID        NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  menu_item_id  UUID,
  restaurant_id UUID        REFERENCES public.restaurants(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  price         NUMERIC     NOT NULL,
  qty           INTEGER     NOT NULL DEFAULT 1,
  gst_rate      NUMERIC     NOT NULL DEFAULT 5,
  is_veg        BOOLEAN     NOT NULL DEFAULT true,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_restaurant ON public.bill_items(restaurant_id);

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_bill_items" ON public.bill_items;
CREATE POLICY "open_access_bill_items" ON public.bill_items
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 5: Add restaurant_id index on user_restaurant_access ─
CREATE INDEX IF NOT EXISTS idx_ura_user_restaurant
  ON public.user_restaurant_access(user_id, restaurant_id, is_active);

-- ── STEP 6: Add plan_expires_at to restaurants for SaaS billing ──
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- ── STEP 7: Add display_order to outlets ─────────────────────
ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- ── STEP 8: Ensure outlets have restaurant_id index ───────────
CREATE INDEX IF NOT EXISTS idx_outlets_restaurant_active
  ON public.outlets(restaurant_id, is_active);

-- ── STEP 9: Add restaurant_id to shifts ──────────────────────
-- (already added in phase 1, ensure index exists)
CREATE INDEX IF NOT EXISTS idx_shifts_restaurant_outlet
  ON public.shifts(restaurant_id, outlet, is_closed);
