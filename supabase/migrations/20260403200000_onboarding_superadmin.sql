-- ============================================================
-- Onboarding & Superadmin Support
-- Migration: 20260403200000_onboarding_superadmin.sql
-- ============================================================

-- ── STEP 1: Extend restaurants table for onboarding ──────────
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cuisine_type TEXT,
  ADD COLUMN IF NOT EXISTS seating_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

-- ── STEP 2: Create platform_superadmins table ─────────────────
-- Tracks which auth users are platform superadmins
CREATE TABLE IF NOT EXISTS public.platform_superadmins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL UNIQUE,
  email      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.platform_superadmins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_platform_superadmins" ON public.platform_superadmins;
CREATE POLICY "open_access_platform_superadmins" ON public.platform_superadmins
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── STEP 3: Index for fast lookup ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_platform_superadmins_user_id
  ON public.platform_superadmins(user_id);

CREATE INDEX IF NOT EXISTS idx_restaurants_onboarding_status
  ON public.restaurants(onboarding_status);

CREATE INDEX IF NOT EXISTS idx_restaurants_created_by
  ON public.restaurants(created_by_user_id);
