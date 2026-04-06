-- ============================================================
-- Phase 1: Multi-Tenant Migration — Add restaurant_id to all tables
-- Migration: 20260403182233_phase1_restaurant_id_multitenant.sql
--
-- Goals:
--   1. Create public.restaurants table (the tenant root)
--   2. Add restaurant_id (nullable) to every table that is missing it
--   3. Backfill restaurant_id with the single existing restaurant
--   4. Add composite indexes for tenant-scoped queries
--   5. Make restaurant_id NOT NULL on tables where backfill is safe
-- ============================================================

-- ── STEP 1: Create restaurants table ─────────────────────────
CREATE TABLE IF NOT EXISTS public.restaurants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL DEFAULT 'Spice Garden',
  gstin       TEXT,
  fssai       TEXT,
  plan        TEXT        NOT NULL DEFAULT 'free',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_restaurants" ON public.restaurants;
CREATE POLICY "open_access_restaurants" ON public.restaurants
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Seed the one existing restaurant so backfill has a target
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.restaurants LIMIT 1) THEN
    INSERT INTO public.restaurants (name, gstin, fssai, plan, is_active)
    VALUES ('Spice Garden', '29AABCS1429B1Z1', '11222333444455', 'free', true);
  END IF;
END $$;

-- ── STEP 2: Add restaurant_id column to all tables (nullable first) ──

-- menu_items
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- restaurant_tables
ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- kots
ALTER TABLE public.kots
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- bills
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- inventory_adjustments
ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- staff_users
ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- gst_config
ALTER TABLE public.gst_config
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- outlet_settings
ALTER TABLE public.outlet_settings
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- printer_config
ALTER TABLE public.printer_config
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- aggregator_config
-- NOTE: aggregator_config already has a column named restaurant_id (TEXT, stores external ID)
-- We add a separate tenant_restaurant_id column to avoid collision
ALTER TABLE public.aggregator_config
  ADD COLUMN IF NOT EXISTS tenant_restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- ingredients
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- stock_deductions
ALTER TABLE public.stock_deductions
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- customer_orders
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- discounts
ALTER TABLE public.discounts
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- takeaway_orders
ALTER TABLE public.takeaway_orders
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- notification_config
ALTER TABLE public.notification_config
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- menu_sync_log
ALTER TABLE public.menu_sync_log
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- low_stock_alerts
ALTER TABLE public.low_stock_alerts
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- loyalty_redemptions
ALTER TABLE public.loyalty_redemptions
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- ── STEP 3: Backfill restaurant_id with the single existing restaurant ──
DO $$
DECLARE
  v_restaurant_id UUID;
BEGIN
  SELECT id INTO v_restaurant_id FROM public.restaurants LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'No restaurant found for backfill. Seed step failed.';
  END IF;

  -- Core transactional tables
  UPDATE public.menu_items        SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.restaurant_tables SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.shifts            SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.orders            SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.kots              SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.bills             SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.inventory_items   SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.inventory_adjustments SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.staff_users       SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.audit_logs        SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;

  -- Config tables
  UPDATE public.gst_config           SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.outlet_settings      SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.printer_config       SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.aggregator_config    SET tenant_restaurant_id = v_restaurant_id WHERE tenant_restaurant_id IS NULL;
  UPDATE public.notification_config  SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;

  -- Module tables
  UPDATE public.ingredients          SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.stock_deductions     SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.customers            SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.customer_orders      SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.discounts            SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.takeaway_orders      SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.menu_sync_log        SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.low_stock_alerts     SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE public.loyalty_redemptions  SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;

  RAISE NOTICE 'Backfill complete for restaurant_id = %', v_restaurant_id;
END $$;

-- ── STEP 4: Add composite indexes for tenant-scoped queries ──

-- Core transactional tables — restaurant_id + outlet + created_at
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id
  ON public.menu_items(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_restaurant_outlet
  ON public.restaurant_tables(restaurant_id, outlet);

CREATE INDEX IF NOT EXISTS idx_shifts_restaurant_outlet
  ON public.shifts(restaurant_id, outlet);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_outlet_created
  ON public.orders(restaurant_id, outlet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kots_restaurant_outlet_status
  ON public.kots(restaurant_id, outlet, status);

CREATE INDEX IF NOT EXISTS idx_bills_restaurant_outlet_created
  ON public.bills(restaurant_id, outlet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant_outlet
  ON public.inventory_items(restaurant_id, outlet);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_restaurant
  ON public.inventory_adjustments(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_staff_users_restaurant_id
  ON public.staff_users(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant_created
  ON public.audit_logs(restaurant_id, created_at DESC);

-- Config tables
CREATE INDEX IF NOT EXISTS idx_gst_config_restaurant_id
  ON public.gst_config(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_outlet_settings_restaurant_id
  ON public.outlet_settings(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_printer_config_restaurant_id
  ON public.printer_config(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_aggregator_config_tenant_restaurant
  ON public.aggregator_config(tenant_restaurant_id);

CREATE INDEX IF NOT EXISTS idx_notification_config_restaurant_id
  ON public.notification_config(restaurant_id);

-- Module tables
CREATE INDEX IF NOT EXISTS idx_ingredients_restaurant_outlet
  ON public.ingredients(restaurant_id, outlet);

CREATE INDEX IF NOT EXISTS idx_stock_deductions_restaurant
  ON public.stock_deductions(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant_id
  ON public.customers(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_customer_orders_restaurant_id
  ON public.customer_orders(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_discounts_restaurant_id
  ON public.discounts(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_takeaway_orders_restaurant_outlet
  ON public.takeaway_orders(restaurant_id, outlet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_menu_sync_log_restaurant_id
  ON public.menu_sync_log(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_restaurant_id
  ON public.low_stock_alerts(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_restaurant_id
  ON public.loyalty_redemptions(restaurant_id);

-- ── STEP 5: Make restaurant_id NOT NULL on tables where backfill is safe ──
-- All rows have been backfilled above, so it is safe to enforce NOT NULL
-- on the core operational tables. Config tables and log tables are also safe.

ALTER TABLE public.menu_items
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.restaurant_tables
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.shifts
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.kots
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.bills
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.inventory_items
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.inventory_adjustments
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.staff_users
  ALTER COLUMN restaurant_id SET NOT NULL;

-- audit_logs: keep nullable — system-level logs may not have a restaurant context
-- (e.g., platform-level events before restaurant is selected)

ALTER TABLE public.gst_config
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.outlet_settings
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.printer_config
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.ingredients
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.stock_deductions
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.customers
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.customer_orders
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.discounts
  ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE public.takeaway_orders
  ALTER COLUMN restaurant_id SET NOT NULL;

-- notification_config, menu_sync_log, low_stock_alerts, loyalty_redemptions:
-- keep nullable for now — these are lower-risk and may have edge cases
-- They will be made NOT NULL in Phase 3 after app-layer enforcement is added.

-- ── STEP 6: updated_at trigger for restaurants ────────────────
DROP TRIGGER IF EXISTS set_restaurants_updated_at ON public.restaurants;
CREATE TRIGGER set_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
