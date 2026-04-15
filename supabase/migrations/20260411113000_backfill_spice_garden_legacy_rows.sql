-- ============================================================
-- Backfill legacy rows to Spice Garden tenant scope
-- Migration: 20260411113000_backfill_spice_garden_legacy_rows.sql
--
-- Why:
-- Older rows (created before strict tenant scoping) may have NULL/invalid
-- restaurant references and therefore don't appear in tenant-scoped modules.
--
-- Safety:
-- 1) Only updates rows with NULL or invalid tenant reference.
-- 2) Does NOT overwrite valid restaurant_id / tenant_restaurant_id values.
-- 3) Idempotent: can be rerun safely.
-- ============================================================

DO $$
DECLARE
  v_restaurant_id UUID;
BEGIN
  -- Prefer the known first tenant by name.
  SELECT id
  INTO v_restaurant_id
  FROM public.restaurants
  WHERE lower(name) = lower('Spice Garden')
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback to first restaurant if name changed.
  IF v_restaurant_id IS NULL THEN
    SELECT id
    INTO v_restaurant_id
    FROM public.restaurants
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Backfill aborted: no restaurant found in public.restaurants';
  END IF;

  -- Core + module tables with restaurant_id
  UPDATE public.menu_items
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.menu_items.restaurant_id);

  UPDATE public.restaurant_tables
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.restaurant_tables.restaurant_id);

  UPDATE public.shifts
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.shifts.restaurant_id);

  UPDATE public.orders
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.orders.restaurant_id);

  UPDATE public.kots
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.kots.restaurant_id);

  UPDATE public.bills
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.bills.restaurant_id);

  UPDATE public.inventory_items
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.inventory_items.restaurant_id);

  UPDATE public.inventory_adjustments
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.inventory_adjustments.restaurant_id);

  UPDATE public.staff_users
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.staff_users.restaurant_id);

  UPDATE public.gst_config
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.gst_config.restaurant_id);

  UPDATE public.outlet_settings
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.outlet_settings.restaurant_id);

  UPDATE public.printer_config
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.printer_config.restaurant_id);

  UPDATE public.notification_config
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.notification_config.restaurant_id);

  UPDATE public.ingredients
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.ingredients.restaurant_id);

  UPDATE public.stock_deductions
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.stock_deductions.restaurant_id);

  UPDATE public.customers
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.customers.restaurant_id);

  UPDATE public.customer_orders
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.customer_orders.restaurant_id);

  UPDATE public.discounts
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.discounts.restaurant_id);

  UPDATE public.takeaway_orders
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.takeaway_orders.restaurant_id);

  UPDATE public.menu_sync_log
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.menu_sync_log.restaurant_id);

  UPDATE public.low_stock_alerts
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.low_stock_alerts.restaurant_id);

  UPDATE public.loyalty_redemptions
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.loyalty_redemptions.restaurant_id);

  -- Tables that intentionally use tenant_restaurant_id (not restaurant_id)
  UPDATE public.aggregator_config
  SET tenant_restaurant_id = v_restaurant_id
  WHERE tenant_restaurant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.aggregator_config.tenant_restaurant_id);

  -- audit_logs may be nullable by design, but we can safely repair broken references
  UPDATE public.audit_logs
  SET restaurant_id = v_restaurant_id
  WHERE restaurant_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = public.audit_logs.restaurant_id);

  RAISE NOTICE 'Legacy tenant backfill complete for restaurant_id=%', v_restaurant_id;
END $$;
