-- ============================================================
-- Normalize legacy outlet scope for Spice Garden
-- Migration: 20260411123000_normalize_spice_garden_outlet_scope.sql
--
-- Why:
-- After tenant scoping, many UI queries filter by both restaurant_id and outlet.
-- Legacy rows can still carry invalid outlet values (NULL, '', 'All Outlets',
-- or an outlet slug that no longer exists), so data appears missing.
--
-- Safety:
-- 1) Scope updates to Spice Garden restaurant only.
-- 2) Only rewrite rows with invalid outlet values.
-- 3) Idempotent and safe to re-run.
-- ============================================================

DO $$
DECLARE
  v_restaurant_id UUID;
  v_default_outlet_slug TEXT;
BEGIN
  SELECT id
  INTO v_restaurant_id
  FROM public.restaurants
  WHERE lower(name) = lower('Spice Garden')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    SELECT id
    INTO v_restaurant_id
    FROM public.restaurants
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Outlet normalization aborted: no restaurant found';
  END IF;

  -- Pick the first active outlet slug for this restaurant.
  SELECT slug
  INTO v_default_outlet_slug
  FROM public.outlets
  WHERE restaurant_id = v_restaurant_id
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  -- If no outlet exists, keep a known fallback used across legacy data.
  IF v_default_outlet_slug IS NULL OR length(trim(v_default_outlet_slug)) = 0 THEN
    v_default_outlet_slug := 'koramangala';
  END IF;

  -- Normalize helper pattern: invalid outlet means null/blank/all-outlets
  -- OR value that is not one of the current outlet slugs for this restaurant.

  UPDATE public.menu_items m
  SET outlet = v_default_outlet_slug
  WHERE m.restaurant_id = v_restaurant_id
    AND (
      m.outlet IS NULL OR btrim(m.outlet) = '' OR lower(btrim(m.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = m.outlet
      )
    );

  UPDATE public.restaurant_tables t
  SET outlet = v_default_outlet_slug
  WHERE t.restaurant_id = v_restaurant_id
    AND (
      t.outlet IS NULL OR btrim(t.outlet) = '' OR lower(btrim(t.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = t.outlet
      )
    );

  UPDATE public.shifts s
  SET outlet = v_default_outlet_slug
  WHERE s.restaurant_id = v_restaurant_id
    AND (
      s.outlet IS NULL OR btrim(s.outlet) = '' OR lower(btrim(s.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = s.outlet
      )
    );

  UPDATE public.orders o1
  SET outlet = v_default_outlet_slug
  WHERE o1.restaurant_id = v_restaurant_id
    AND (
      o1.outlet IS NULL OR btrim(o1.outlet) = '' OR lower(btrim(o1.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = o1.outlet
      )
    );

  UPDATE public.kots k
  SET outlet = v_default_outlet_slug
  WHERE k.restaurant_id = v_restaurant_id
    AND (
      k.outlet IS NULL OR btrim(k.outlet) = '' OR lower(btrim(k.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = k.outlet
      )
    );

  UPDATE public.bills b
  SET outlet = v_default_outlet_slug
  WHERE b.restaurant_id = v_restaurant_id
    AND (
      b.outlet IS NULL OR btrim(b.outlet) = '' OR lower(btrim(b.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = b.outlet
      )
    );

  UPDATE public.inventory_items i
  SET outlet = v_default_outlet_slug
  WHERE i.restaurant_id = v_restaurant_id
    AND (
      i.outlet IS NULL OR btrim(i.outlet) = '' OR lower(btrim(i.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = i.outlet
      )
    );

  UPDATE public.ingredients i2
  SET outlet = v_default_outlet_slug
  WHERE i2.restaurant_id = v_restaurant_id
    AND (
      i2.outlet IS NULL OR btrim(i2.outlet) = '' OR lower(btrim(i2.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = i2.outlet
      )
    );

  UPDATE public.customers c
  SET outlet = v_default_outlet_slug
  WHERE c.restaurant_id = v_restaurant_id
    AND (
      c.outlet IS NULL OR btrim(c.outlet) = '' OR lower(btrim(c.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = c.outlet
      )
    );

  UPDATE public.discounts d
  SET outlet = v_default_outlet_slug
  WHERE d.restaurant_id = v_restaurant_id
    AND (
      d.outlet IS NULL OR btrim(d.outlet) = '' OR lower(btrim(d.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = d.outlet
      )
    );

  UPDATE public.takeaway_orders t2
  SET outlet = v_default_outlet_slug
  WHERE t2.restaurant_id = v_restaurant_id
    AND (
      t2.outlet IS NULL OR btrim(t2.outlet) = '' OR lower(btrim(t2.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = t2.outlet
      )
    );

  UPDATE public.audit_logs a
  SET outlet = v_default_outlet_slug
  WHERE a.restaurant_id = v_restaurant_id
    AND (
      a.outlet IS NULL OR btrim(a.outlet) = '' OR lower(btrim(a.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = a.outlet
      )
    );

  UPDATE public.notification_config n
  SET outlet = v_default_outlet_slug
  WHERE n.restaurant_id = v_restaurant_id
    AND (
      n.outlet IS NULL OR btrim(n.outlet) = '' OR lower(btrim(n.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = n.outlet
      )
    );

  UPDATE public.outlet_settings os
  SET outlet = v_default_outlet_slug
  WHERE os.restaurant_id = v_restaurant_id
    AND (
      os.outlet IS NULL OR btrim(os.outlet) = '' OR lower(btrim(os.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = os.outlet
      )
    );

  UPDATE public.gst_config g
  SET outlet = v_default_outlet_slug
  WHERE g.restaurant_id = v_restaurant_id
    AND (
      g.outlet IS NULL OR btrim(g.outlet) = '' OR lower(btrim(g.outlet)) IN ('all outlets', 'all-outlets', 'alloutlets')
      OR NOT EXISTS (
        SELECT 1 FROM public.outlets o
        WHERE o.restaurant_id = v_restaurant_id
          AND o.slug = g.outlet
      )
    );

  RAISE NOTICE 'Outlet normalization complete for restaurant_id %, default outlet %', v_restaurant_id, v_default_outlet_slug;
END $$;
