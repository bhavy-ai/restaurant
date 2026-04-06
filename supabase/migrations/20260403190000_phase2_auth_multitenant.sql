-- ============================================================
-- Phase 2: Multi-Tenant Auth & Session Support
-- Migration: 20260403190000_phase2_auth_multitenant.sql
--
-- Goals:
--   1. Add outlets table (restaurant → outlet hierarchy)
--   2. Add user_restaurant_access table (user ↔ restaurant memberships)
--   3. Update staff_users to support multi-restaurant memberships
--   4. Add outlet_menu_overrides table
--   5. Add restaurant_feature_flags table
--   6. Seed demo data for multi-restaurant testing
-- ============================================================

-- ── STEP 1: Ensure restaurants table has owner_user_id ────────
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ── STEP 2: Create outlets table ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  address       TEXT,
  phone         TEXT,
  gstin         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_outlets_restaurant_id ON public.outlets(restaurant_id);
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_outlets" ON public.outlets;
CREATE POLICY "open_access_outlets" ON public.outlets
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 3: Create user_restaurant_access table ───────────────
-- Maps auth users → restaurants they can access, with role
CREATE TABLE IF NOT EXISTS public.user_restaurant_access (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id     UUID        REFERENCES public.outlets(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'cashier',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_ura_user_id ON public.user_restaurant_access(user_id);
CREATE INDEX IF NOT EXISTS idx_ura_restaurant_id ON public.user_restaurant_access(restaurant_id);
ALTER TABLE public.user_restaurant_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_user_restaurant_access" ON public.user_restaurant_access;
CREATE POLICY "open_access_user_restaurant_access" ON public.user_restaurant_access
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 4: Add outlet_id to staff_users ─────────────────────
ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL;

-- ── STEP 5: Create outlet_menu_overrides table ────────────────
CREATE TABLE IF NOT EXISTS public.outlet_menu_overrides (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id      UUID        NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  menu_item_id   UUID        NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  price_override NUMERIC,
  is_available   BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(outlet_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_omo_outlet_id ON public.outlet_menu_overrides(outlet_id);
CREATE INDEX IF NOT EXISTS idx_omo_restaurant_id ON public.outlet_menu_overrides(restaurant_id);
ALTER TABLE public.outlet_menu_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_outlet_menu_overrides" ON public.outlet_menu_overrides;
CREATE POLICY "open_access_outlet_menu_overrides" ON public.outlet_menu_overrides
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 6: Create restaurant_feature_flags table ─────────────
CREATE TABLE IF NOT EXISTS public.restaurant_feature_flags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  flag_key      TEXT        NOT NULL,
  flag_value    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_rff_restaurant_id ON public.restaurant_feature_flags(restaurant_id);
ALTER TABLE public.restaurant_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_restaurant_feature_flags" ON public.restaurant_feature_flags;
CREATE POLICY "open_access_restaurant_feature_flags" ON public.restaurant_feature_flags
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 7: Seed outlets for existing restaurant ──────────────
DO $$
DECLARE
  v_restaurant_id UUID;
BEGIN
  SELECT id INTO v_restaurant_id FROM public.restaurants LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    -- Seed outlets matching existing outlet slugs in the app
    INSERT INTO public.outlets (restaurant_id, name, slug, address, is_active)
    VALUES
      (v_restaurant_id, 'Koramangala', 'koramangala', '5th Block, Koramangala, Bengaluru', true),
      (v_restaurant_id, 'Indiranagar', 'indiranagar', '100 Feet Road, Indiranagar, Bengaluru', true),
      (v_restaurant_id, 'Whitefield', 'whitefield', 'ITPL Main Road, Whitefield, Bengaluru', true)
    ON CONFLICT (restaurant_id, slug) DO NOTHING;

    -- Seed default feature flags
    INSERT INTO public.restaurant_feature_flags (restaurant_id, flag_key, flag_value)
    VALUES
      (v_restaurant_id, 'multi_outlet_enabled', true),
      (v_restaurant_id, 'cross_restaurant_reports', true),
      (v_restaurant_id, 'outlet_menu_overrides', true)
    ON CONFLICT (restaurant_id, flag_key) DO NOTHING;
  END IF;
END $$;

-- ── STEP 8: Backfill outlet_id on staff_users ─────────────────
DO $$
DECLARE
  v_outlet_id UUID;
BEGIN
  SELECT id INTO v_outlet_id FROM public.outlets WHERE slug = 'koramangala' LIMIT 1;
  IF v_outlet_id IS NOT NULL THEN
    UPDATE public.staff_users
    SET outlet_id = v_outlet_id
    WHERE outlet_id IS NULL;
  END IF;
END $$;

-- ── STEP 9: Seed user_restaurant_access from existing staff_users ──
DO $$
DECLARE
  v_restaurant_id UUID;
BEGIN
  SELECT id INTO v_restaurant_id FROM public.restaurants LIMIT 1;

  -- NOTE: staff_users does not have a user_id (auth.users FK) column.
  -- user_restaurant_access rows will be created at login time when
  -- auth users are linked to staff records. No backfill needed here.
  IF v_restaurant_id IS NOT NULL THEN
    NULL; -- intentional no-op: nothing to backfill
  END IF;
END $$;
