-- ── Printer & Aggregator Config Tables ───────────────────────────────────────

-- Printer Config
CREATE TABLE IF NOT EXISTS public.printer_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet TEXT NOT NULL,
  name TEXT NOT NULL,
  printer_type TEXT NOT NULL DEFAULT 'bill',
  ip_address TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 9100,
  paper_width TEXT NOT NULL DEFAULT '80mm',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_printer_config_outlet ON public.printer_config(outlet);

ALTER TABLE public.printer_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "printer_config_open_access" ON public.printer_config;
CREATE POLICY "printer_config_open_access" ON public.printer_config FOR ALL TO public USING (true) WITH CHECK (true);

-- Aggregator Config
CREATE TABLE IF NOT EXISTS public.aggregator_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet TEXT NOT NULL,
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  restaurant_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_checked_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'unchecked',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aggregator_config_outlet_platform ON public.aggregator_config(outlet, platform);
CREATE INDEX IF NOT EXISTS idx_aggregator_config_outlet ON public.aggregator_config(outlet);

ALTER TABLE public.aggregator_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aggregator_config_open_access" ON public.aggregator_config;
CREATE POLICY "aggregator_config_open_access" ON public.aggregator_config FOR ALL TO public USING (true) WITH CHECK (true);

-- ── Seed default data ─────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Seed printer configs
  INSERT INTO public.printer_config (outlet, name, printer_type, ip_address, port, paper_width, enabled)
  VALUES
    ('koramangala', 'Billing Counter — Epson TM-T82', 'bill', '192.168.1.50', 9100, '80mm', true),
    ('koramangala', 'Main Kitchen — Star TSP143', 'kot', '192.168.1.51', 9100, '80mm', true),
    ('koramangala', 'Bar Counter — Epson TM-T82', 'kot', '192.168.1.52', 9100, '58mm', false),
    ('koramangala', 'Grill Station — Star TSP143', 'kot', '192.168.1.53', 9100, '80mm', true)
  ON CONFLICT DO NOTHING;

  -- Seed aggregator configs
  INSERT INTO public.aggregator_config (outlet, platform, display_name, api_key, restaurant_id, enabled, last_status)
  VALUES
    ('koramangala', 'zomato', 'Zomato for Restaurants', '', '', false, 'unchecked'),
    ('koramangala', 'swiggy', 'Swiggy Partner', '', '', false, 'unchecked')
  ON CONFLICT (outlet, platform) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data insertion skipped: %', SQLERRM;
END $$;
