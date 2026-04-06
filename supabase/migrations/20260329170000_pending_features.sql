-- ============================================================
-- Pending Features Migration
-- Shift Handover, Menu Sync, Low Stock Alerts
-- ============================================================

-- ── Shift Handover Sign-off ───────────────────────────────────
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS closing_cash_count numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_difference numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handover_notes text,
  ADD COLUMN IF NOT EXISTS incoming_cashier text,
  ADD COLUMN IF NOT EXISTS signed_off_by text,
  ADD COLUMN IF NOT EXISTS signed_off_at timestamptz;

-- ── Menu Sync Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.menu_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_outlet text NOT NULL DEFAULT 'koramangala',
  target_outlets text[] NOT NULL DEFAULT '{}',
  synced_by text NOT NULL DEFAULT 'system',
  items_synced integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.menu_sync_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_sync_log' AND policyname='open_menu_sync_log') THEN
    CREATE POLICY open_menu_sync_log ON public.menu_sync_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Low Stock Alert Log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.low_stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  item_name text NOT NULL,
  current_stock numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  alert_type text NOT NULL DEFAULT 'low', -- low | critical
  sms_sent boolean NOT NULL DEFAULT false,
  sms_sent_at timestamptz,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.low_stock_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='low_stock_alerts' AND policyname='open_low_stock_alerts') THEN
    CREATE POLICY open_low_stock_alerts ON public.low_stock_alerts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Loyalty Redemptions Log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  points_redeemed integer NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  bill_id uuid,
  bill_number text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='loyalty_redemptions' AND policyname='open_loyalty_redemptions') THEN
    CREATE POLICY open_loyalty_redemptions ON public.loyalty_redemptions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
