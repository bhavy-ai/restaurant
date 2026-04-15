-- ============================================================
-- Admin Panel Extensions
-- Migration: 20260324180000_admin_panel_extensions.sql
-- Adds: gst_config, outlet_settings tables
-- ============================================================

-- ── 1. GST Configuration Table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gst_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  gstin TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT '',
  trade_name TEXT NOT NULL DEFAULT '',
  registration_type TEXT NOT NULL DEFAULT 'Regular',
  rate_5_enabled BOOLEAN NOT NULL DEFAULT true,
  rate_12_enabled BOOLEAN NOT NULL DEFAULT true,
  rate_18_enabled BOOLEAN NOT NULL DEFAULT false,
  rate_0_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gst_config_outlet ON public.gst_config(outlet);

-- ── 2. Outlet Settings Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlet_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  fssai TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  upi_id TEXT NOT NULL DEFAULT '',
  bill_prefix TEXT NOT NULL DEFAULT 'B',
  kot_prefix TEXT NOT NULL DEFAULT 'K',
  print_copies INTEGER NOT NULL DEFAULT 2,
  service_charge_enabled BOOLEAN NOT NULL DEFAULT false,
  service_charge_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outlet_settings_outlet ON public.outlet_settings(outlet);

-- ── 3. Add phone column to staff_users if missing ─────────────
ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ── 4. Updated_at triggers ────────────────────────────────────
DROP TRIGGER IF EXISTS set_gst_config_updated_at ON public.gst_config;
CREATE TRIGGER set_gst_config_updated_at
  BEFORE UPDATE ON public.gst_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_outlet_settings_updated_at ON public.outlet_settings;
CREATE TRIGGER set_outlet_settings_updated_at
  BEFORE UPDATE ON public.outlet_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Enable RLS ─────────────────────────────────────────────
ALTER TABLE public.gst_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_settings ENABLE ROW LEVEL SECURITY;

-- ── 6. RLS Policies ───────────────────────────────────────────
DROP POLICY IF EXISTS "open_access_gst_config" ON public.gst_config;
CREATE POLICY "open_access_gst_config" ON public.gst_config FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_outlet_settings" ON public.outlet_settings;
CREATE POLICY "open_access_outlet_settings" ON public.outlet_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- ── 7. Seed default data ──────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.gst_config (outlet, restaurant_id, gstin, legal_name, trade_name, registration_type, rate_5_enabled, rate_12_enabled, rate_18_enabled, rate_0_enabled)
  VALUES ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), '29AABCS1429B1Z1', 'Spice Garden Foods Pvt Ltd', 'Spice Garden', 'Regular', true, true, false, false)
  ON CONFLICT (outlet) DO NOTHING;

  INSERT INTO public.outlet_settings (outlet, restaurant_id, name, gstin, fssai, address, phone, email, upi_id, bill_prefix, kot_prefix, print_copies, service_charge_enabled, service_charge_pct)
  VALUES ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Spice Garden — Koramangala', '29AABCS1429B1Z1', '11222333444455',
          '42, 5th Cross, Koramangala 4th Block, Bengaluru — 560034',
          '+91 98765 43210', 'koramangala@spicegarden.in', 'spicegarden@kotak',
          'B', 'K', 2, false, 10)
  ON CONFLICT (outlet) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data insertion failed: %', SQLERRM;
END $$;
