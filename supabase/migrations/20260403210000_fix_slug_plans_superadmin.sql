-- ============================================================
-- Fix: Add slug to restaurants, create plans table,
--      seed superadmin + demo credentials
-- Migration: 20260403210000_fix_slug_plans_superadmin.sql
-- ============================================================

-- ── STEP 1: Add slug column to restaurants ────────────────────
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill slug for existing restaurants that don't have one
UPDATE public.restaurants
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || extract(epoch from created_at)::bigint
WHERE slug IS NULL OR slug = '';

-- ── STEP 2: Create plans table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  price_monthly NUMERIC    NOT NULL DEFAULT 0,
  price_yearly  NUMERIC    NOT NULL DEFAULT 0,
  max_outlets   INTEGER    NOT NULL DEFAULT 1,
  max_staff     INTEGER    NOT NULL DEFAULT 5,
  features      JSONB      NOT NULL DEFAULT '[]'::jsonb,
  is_self_serve BOOLEAN    NOT NULL DEFAULT false,
  is_active     BOOLEAN    NOT NULL DEFAULT true,
  sort_order    INTEGER    NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_read_plans" ON public.plans;
CREATE POLICY "open_read_plans" ON public.plans
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "superadmin_manage_plans" ON public.plans;
CREATE POLICY "superadmin_manage_plans" ON public.plans
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 3: Seed Starter, Growth, Enterprise plans ────────────
INSERT INTO public.plans (name, display_name, price_monthly, price_yearly, max_outlets, max_staff, features, is_self_serve, sort_order)
VALUES
  ('starter',
   'Starter',
   999,
   9990,
   1,
   5,
   '["POS Billing","KDS","Table Management","Basic Reports","1 Outlet"]'::jsonb,
   true,
   1),
  ('growth',
   'Growth',
   2499,
   24990,
   3,
   20,
   '["Everything in Starter","Multi-Outlet (up to 3)","Inventory Management","Customer CRM","Advanced Reports","Aggregator Integration"]'::jsonb,
   false,
   2),
  ('enterprise',
   'Enterprise',
   5999,
   59990,
   -1,
   -1,
   '["Everything in Growth","Unlimited Outlets","Unlimited Staff","Custom Integrations","Dedicated Support","White-label Option","API Access"]'::jsonb,
   false,
   3)
ON CONFLICT (name) DO UPDATE SET
  display_name   = EXCLUDED.display_name,
  price_monthly  = EXCLUDED.price_monthly,
  price_yearly   = EXCLUDED.price_yearly,
  max_outlets    = EXCLUDED.max_outlets,
  max_staff      = EXCLUDED.max_staff,
  features       = EXCLUDED.features,
  is_self_serve  = EXCLUDED.is_self_serve,
  sort_order     = EXCLUDED.sort_order;

-- ── STEP 4: Seed platform superadmin auth user ────────────────
DO $$
DECLARE
  superadmin_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Insert superadmin into auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous,
    confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at,
    email_change_token_new, email_change, email_change_sent_at,
    email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at,
    phone, phone_change, phone_change_token, phone_change_sent_at
  ) VALUES (
    superadmin_id,
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@restroos.com',
    crypt('SuperAdmin@2024', gen_salt('bf', 10)),
    now(), now(), now(),
    jsonb_build_object('full_name', 'RestroOS Admin', 'role', 'superadmin'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
    false, false, '', null, '', null, '', '', null, '', 0, '', null,
    null, '', '', null
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert identity
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), superadmin_id, 'admin@restroos.com', 'email',
    jsonb_build_object('sub', superadmin_id::TEXT, 'email', 'admin@restroos.com', 'email_verified', true, 'provider', 'email'),
    now(), now(), now()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Register in platform_superadmins
  INSERT INTO public.platform_superadmins (user_id, email)
  VALUES (superadmin_id, 'admin@restroos.com')
  ON CONFLICT (user_id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Superadmin seeding failed: %', SQLERRM;
END $$;

-- ── STEP 5: Index for slug lookups ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON public.restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_plans_name ON public.plans(name);
CREATE INDEX IF NOT EXISTS idx_plans_sort_order ON public.plans(sort_order);
