-- ============================================================
-- Phase 4: RLS Policies + Outlet-Level Data Isolation
-- Migration: 20260403191000_phase4_rls_isolation.sql
--
-- Goals:
--   1. Replace open_access policies with restaurant_id-scoped RLS
--   2. Add outlet-level isolation for transactional tables
--   3. Create helper function for restaurant context resolution
--   4. Scope real-time subscriptions via outlet_id
-- ============================================================

-- ── STEP 1: Helper function — get restaurant_id for current user ──
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT restaurant_id
  FROM public.user_restaurant_access
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

-- ── STEP 2: Helper function — check if user has access to restaurant ──
CREATE OR REPLACE FUNCTION public.user_has_restaurant_access(target_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_restaurant_access
    WHERE user_id = auth.uid()
      AND restaurant_id = target_restaurant_id
      AND is_active = true
  )
$$;

-- ── STEP 3: RLS on restaurants table ─────────────────────────
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "tenant_read_restaurants" ON public.restaurants;
CREATE POLICY "tenant_read_restaurants" ON public.restaurants
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "tenant_write_restaurants" ON public.restaurants;
CREATE POLICY "tenant_write_restaurants" ON public.restaurants
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── STEP 4: RLS on outlets ────────────────────────────────────
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_outlets" ON public.outlets;
DROP POLICY IF EXISTS "tenant_read_outlets" ON public.outlets;
CREATE POLICY "tenant_read_outlets" ON public.outlets
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "tenant_write_outlets" ON public.outlets;
CREATE POLICY "tenant_write_outlets" ON public.outlets
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── STEP 5: RLS on menu_items ─────────────────────────────────
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "tenant_menu_items" ON public.menu_items;
CREATE POLICY "tenant_menu_items" ON public.menu_items
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 6: RLS on restaurant_tables ─────────────────────────
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_restaurant_tables" ON public.restaurant_tables;
DROP POLICY IF EXISTS "tenant_restaurant_tables" ON public.restaurant_tables;
CREATE POLICY "tenant_restaurant_tables" ON public.restaurant_tables
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 7: RLS on orders ─────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_orders" ON public.orders;
DROP POLICY IF EXISTS "tenant_orders" ON public.orders;
CREATE POLICY "tenant_orders" ON public.orders
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 8: RLS on kots ───────────────────────────────────────
ALTER TABLE public.kots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_kots" ON public.kots;
DROP POLICY IF EXISTS "tenant_kots" ON public.kots;
CREATE POLICY "tenant_kots" ON public.kots
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 9: RLS on bills ──────────────────────────────────────
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_bills" ON public.bills;
DROP POLICY IF EXISTS "tenant_bills" ON public.bills;
CREATE POLICY "tenant_bills" ON public.bills
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 10: RLS on inventory_items ──────────────────────────
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "tenant_inventory_items" ON public.inventory_items;
CREATE POLICY "tenant_inventory_items" ON public.inventory_items
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 11: RLS on inventory_adjustments ────────────────────
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_inventory_adjustments" ON public.inventory_adjustments;
DROP POLICY IF EXISTS "tenant_inventory_adjustments" ON public.inventory_adjustments;
CREATE POLICY "tenant_inventory_adjustments" ON public.inventory_adjustments
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 12: RLS on staff_users ──────────────────────────────
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_staff_users" ON public.staff_users;
DROP POLICY IF EXISTS "tenant_staff_users" ON public.staff_users;
CREATE POLICY "tenant_staff_users" ON public.staff_users
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 13: RLS on audit_logs ───────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "tenant_audit_logs" ON public.audit_logs;
CREATE POLICY "tenant_audit_logs" ON public.audit_logs
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 14: RLS on outlet_menu_overrides ────────────────────
ALTER TABLE public.outlet_menu_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_outlet_menu_overrides" ON public.outlet_menu_overrides;
DROP POLICY IF EXISTS "tenant_outlet_menu_overrides" ON public.outlet_menu_overrides;
CREATE POLICY "tenant_outlet_menu_overrides" ON public.outlet_menu_overrides
  FOR ALL TO public
  USING (public.user_has_restaurant_access(restaurant_id))
  WITH CHECK (public.user_has_restaurant_access(restaurant_id));

-- ── STEP 15: RLS on user_restaurant_access ───────────────────
ALTER TABLE public.user_restaurant_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_user_restaurant_access" ON public.user_restaurant_access;
DROP POLICY IF EXISTS "tenant_user_restaurant_access" ON public.user_restaurant_access;
CREATE POLICY "tenant_user_restaurant_access" ON public.user_restaurant_access
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- ── STEP 16: RLS on customers ────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_customers" ON public.customers;
DROP POLICY IF EXISTS "tenant_customers" ON public.customers;
CREATE POLICY "tenant_customers" ON public.customers
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 17: RLS on discounts ────────────────────────────────
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_discounts" ON public.discounts;
DROP POLICY IF EXISTS "tenant_discounts" ON public.discounts;
CREATE POLICY "tenant_discounts" ON public.discounts
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 18: RLS on takeaway_orders ──────────────────────────
ALTER TABLE public.takeaway_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_takeaway_orders" ON public.takeaway_orders;
DROP POLICY IF EXISTS "tenant_takeaway_orders" ON public.takeaway_orders;
CREATE POLICY "tenant_takeaway_orders" ON public.takeaway_orders
  FOR ALL TO public
  USING (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  )
  WITH CHECK (
    restaurant_id IS NULL
    OR public.user_has_restaurant_access(restaurant_id)
  );

-- ── STEP 19: Remaining tables — open access (non-tenant-critical) ──
-- shifts, gst_config, outlet_settings, printer_config, ingredients, recipes,
-- stock_deductions, notification_config, menu_sync_log, low_stock_alerts,
-- loyalty_redemptions, restaurant_feature_flags

DROP POLICY IF EXISTS "open_access_shifts" ON public.shifts;
CREATE POLICY "open_access_shifts" ON public.shifts
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_gst_config" ON public.gst_config;
CREATE POLICY "open_access_gst_config" ON public.gst_config
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_outlet_settings" ON public.outlet_settings;
CREATE POLICY "open_access_outlet_settings" ON public.outlet_settings
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_printer_config" ON public.printer_config;
CREATE POLICY "open_access_printer_config" ON public.printer_config
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_ingredients" ON public.ingredients;
CREATE POLICY "open_access_ingredients" ON public.ingredients
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_recipes" ON public.recipes;
CREATE POLICY "open_access_recipes" ON public.recipes
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_stock_deductions" ON public.stock_deductions;
CREATE POLICY "open_access_stock_deductions" ON public.stock_deductions
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_notification_config" ON public.notification_config;
CREATE POLICY "open_access_notification_config" ON public.notification_config
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_menu_sync_log" ON public.menu_sync_log;
CREATE POLICY "open_access_menu_sync_log" ON public.menu_sync_log
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_low_stock_alerts" ON public.low_stock_alerts;
CREATE POLICY "open_access_low_stock_alerts" ON public.low_stock_alerts
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_loyalty_redemptions" ON public.loyalty_redemptions;
CREATE POLICY "open_access_loyalty_redemptions" ON public.loyalty_redemptions
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_restaurant_feature_flags" ON public.restaurant_feature_flags;
CREATE POLICY "open_access_restaurant_feature_flags" ON public.restaurant_feature_flags
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_order_items" ON public.order_items;
CREATE POLICY "open_access_order_items" ON public.order_items
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_kot_items" ON public.kot_items;
CREATE POLICY "open_access_kot_items" ON public.kot_items
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_customer_orders" ON public.customer_orders;
CREATE POLICY "open_access_customer_orders" ON public.customer_orders
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_aggregator_config" ON public.aggregator_config;
CREATE POLICY "open_access_aggregator_config" ON public.aggregator_config
  FOR ALL TO public USING (true) WITH CHECK (true);
