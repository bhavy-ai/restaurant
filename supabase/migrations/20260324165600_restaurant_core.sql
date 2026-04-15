-- ============================================================
-- Restaurant POS — Core Schema
-- Migration: 20260324165600_restaurant_core.sql
-- ============================================================

-- ── 0. TENANT ROOT ───────────────────────────────────────────
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.restaurants LIMIT 1) THEN
    INSERT INTO public.restaurants (name, gstin, fssai, plan, is_active)
    VALUES ('Spice Garden', '29AABCS1429B1Z1', '11222333444455', 'free', true);
  END IF;
END $$;

-- ── 1. ENUM TYPES ─────────────────────────────────────────────
DROP TYPE IF EXISTS public.order_type_enum CASCADE;
CREATE TYPE public.order_type_enum AS ENUM ('dine-in', 'takeaway', 'delivery');

DROP TYPE IF EXISTS public.order_status_enum CASCADE;
CREATE TYPE public.order_status_enum AS ENUM ('open', 'kot_sent', 'ready', 'billed', 'settled', 'voided');

DROP TYPE IF EXISTS public.table_status_enum CASCADE;
CREATE TYPE public.table_status_enum AS ENUM ('available', 'occupied', 'bill_requested', 'reserved', 'cleaning');

DROP TYPE IF EXISTS public.kot_status_enum CASCADE;
CREATE TYPE public.kot_status_enum AS ENUM ('pending', 'acknowledged', 'preparing', 'ready', 'bumped', 'voided');

DROP TYPE IF EXISTS public.payment_mode_enum CASCADE;
CREATE TYPE public.payment_mode_enum AS ENUM ('cash', 'upi', 'card', 'split', 'online');

DROP TYPE IF EXISTS public.bill_status_enum CASCADE;
CREATE TYPE public.bill_status_enum AS ENUM ('open', 'settled', 'voided', 'refunded');

DROP TYPE IF EXISTS public.inventory_status_enum CASCADE;
CREATE TYPE public.inventory_status_enum AS ENUM ('ok', 'low', 'critical', 'overstock');

DROP TYPE IF EXISTS public.adjustment_type_enum CASCADE;
CREATE TYPE public.adjustment_type_enum AS ENUM ('add', 'remove', 'wastage');

DROP TYPE IF EXISTS public.staff_role_enum CASCADE;
CREATE TYPE public.staff_role_enum AS ENUM ('owner', 'manager', 'cashier', 'captain', 'kitchen', 'accountant');

DROP TYPE IF EXISTS public.audit_severity_enum CASCADE;
CREATE TYPE public.audit_severity_enum AS ENUM ('info', 'warning', 'critical');

DROP TYPE IF EXISTS public.kot_priority_enum CASCADE;
CREATE TYPE public.kot_priority_enum AS ENUM ('normal', 'rush');

-- ── 2. CORE TABLES ────────────────────────────────────────────

-- Menu Items
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  gst_rate INTEGER NOT NULL DEFAULT 5,
  hsn_code TEXT NOT NULL DEFAULT '2106',
  is_veg BOOLEAN NOT NULL DEFAULT true,
  available BOOLEAN NOT NULL DEFAULT true,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Restaurant Tables
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'Indoor',
  capacity INTEGER NOT NULL DEFAULT 4,
  status public.table_status_enum NOT NULL DEFAULT 'available',
  covers INTEGER,
  captain TEXT,
  seated_at TIMESTAMPTZ,
  running_amount NUMERIC(10,2) DEFAULT 0,
  reserved_for TEXT,
  reserved_at TEXT,
  kot_count INTEGER DEFAULT 0,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Shifts
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_name TEXT NOT NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  cashier TEXT NOT NULL,
  opening_float NUMERIC(10,2) NOT NULL DEFAULT 2000,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  table_label TEXT,
  order_type public.order_type_enum NOT NULL DEFAULT 'dine-in',
  status public.order_status_enum NOT NULL DEFAULT 'open',
  covers INTEGER DEFAULT 1,
  steward TEXT,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  coupon_code TEXT,
  subtotal NUMERIC(10,2) DEFAULT 0,
  discount_amt NUMERIC(10,2) DEFAULT 0,
  total_gst NUMERIC(10,2) DEFAULT 0,
  grand_total NUMERIC(10,2) DEFAULT 0,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  gst_rate INTEGER NOT NULL DEFAULT 5,
  note TEXT,
  is_veg BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- KOTs (Kitchen Order Tickets)
CREATE TABLE IF NOT EXISTS public.kots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kot_number TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  table_label TEXT NOT NULL,
  order_type public.order_type_enum NOT NULL DEFAULT 'dine-in',
  station TEXT NOT NULL DEFAULT 'Main Kitchen',
  status public.kot_status_enum NOT NULL DEFAULT 'pending',
  priority public.kot_priority_enum NOT NULL DEFAULT 'normal',
  steward TEXT,
  covers INTEGER DEFAULT 0,
  fire_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- KOT Items
CREATE TABLE IF NOT EXISTS public.kot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kot_id UUID NOT NULL REFERENCES public.kots(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  is_veg BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Payments / Bills
CREATE TABLE IF NOT EXISTS public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  table_label TEXT,
  covers INTEGER DEFAULT 0,
  items_count INTEGER DEFAULT 0,
  gross_amount NUMERIC(10,2) DEFAULT 0,
  discount_amt NUMERIC(10,2) DEFAULT 0,
  gst_amount NUMERIC(10,2) DEFAULT 0,
  net_amount NUMERIC(10,2) DEFAULT 0,
  payment_mode public.payment_mode_enum NOT NULL DEFAULT 'upi',
  cash_tendered NUMERIC(10,2),
  cash_change NUMERIC(10,2),
  split_cash NUMERIC(10,2),
  split_upi NUMERIC(10,2),
  cashier TEXT,
  status public.bill_status_enum NOT NULL DEFAULT 'open',
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Items
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  current_stock NUMERIC(10,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(10,3) NOT NULL DEFAULT 1,
  max_stock NUMERIC(10,3) NOT NULL DEFAULT 10,
  last_purchase_price NUMERIC(10,2) DEFAULT 0,
  consumed_today NUMERIC(10,3) DEFAULT 0,
  variance NUMERIC(10,3) DEFAULT 0,
  supplier TEXT,
  last_updated TEXT,
  status public.inventory_status_enum NOT NULL DEFAULT 'ok',
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Adjustments
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  adjustment_type public.adjustment_type_enum NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  reason TEXT,
  staff_name TEXT,
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Staff Users
CREATE TABLE IF NOT EXISTS public.staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.staff_role_enum NOT NULL DEFAULT 'captain',
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  status TEXT NOT NULL DEFAULT 'active',
  last_login TEXT,
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name TEXT NOT NULL,
  staff_role TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  details TEXT,
  ip_address TEXT,
  severity public.audit_severity_enum NOT NULL DEFAULT 'info',
  outlet TEXT NOT NULL DEFAULT 'koramangala',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. INDEXES ────────────────────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.kots
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- If this migration is being applied to an existing database, some tables may
-- already exist without all of the columns that this schema expects.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS status public.order_status_enum NOT NULL DEFAULT 'open';

ALTER TABLE public.kots
  ADD COLUMN IF NOT EXISTS status public.kot_status_enum NOT NULL DEFAULT 'pending';

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS status public.table_status_enum NOT NULL DEFAULT 'available';

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS status public.inventory_status_enum NOT NULL DEFAULT 'ok';

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS status public.bill_status_enum NOT NULL DEFAULT 'open';

CREATE INDEX IF NOT EXISTS idx_orders_outlet ON public.orders(outlet);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kots_outlet ON public.kots(outlet);
CREATE INDEX IF NOT EXISTS idx_kots_status ON public.kots(status);
CREATE INDEX IF NOT EXISTS idx_kots_fire_time ON public.kots(fire_time DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_outlet ON public.restaurant_tables(outlet);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON public.restaurant_tables(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_outlet ON public.inventory_items(outlet);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_bills_outlet ON public.bills(outlet);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outlet ON public.audit_logs(outlet);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ── 4. UPDATED_AT TRIGGER FUNCTION ───────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER set_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_restaurant_tables_updated_at ON public.restaurant_tables;
CREATE TRIGGER set_restaurant_tables_updated_at
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_kots_updated_at ON public.kots;
CREATE TRIGGER set_kots_updated_at
  BEFORE UPDATE ON public.kots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER set_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. ENABLE RLS ─────────────────────────────────────────────
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- ── 6. RLS POLICIES (open access for restaurant POS) ─────────
-- All tables use open access for authenticated users (restaurant staff)
DROP POLICY IF EXISTS "open_access_menu_items" ON public.menu_items;
CREATE POLICY "open_access_menu_items" ON public.menu_items FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_restaurant_tables" ON public.restaurant_tables;
CREATE POLICY "open_access_restaurant_tables" ON public.restaurant_tables FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_orders" ON public.orders;
CREATE POLICY "open_access_orders" ON public.orders FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_order_items" ON public.order_items;
CREATE POLICY "open_access_order_items" ON public.order_items FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_kots" ON public.kots;
CREATE POLICY "open_access_kots" ON public.kots FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_kot_items" ON public.kot_items;
CREATE POLICY "open_access_kot_items" ON public.kot_items FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_bills" ON public.bills;
CREATE POLICY "open_access_bills" ON public.bills FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_inventory_items" ON public.inventory_items;
CREATE POLICY "open_access_inventory_items" ON public.inventory_items FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_inventory_adjustments" ON public.inventory_adjustments;
CREATE POLICY "open_access_inventory_adjustments" ON public.inventory_adjustments FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_staff_users" ON public.staff_users;
CREATE POLICY "open_access_staff_users" ON public.staff_users FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_audit_logs" ON public.audit_logs;
CREATE POLICY "open_access_audit_logs" ON public.audit_logs FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_shifts" ON public.shifts;
CREATE POLICY "open_access_shifts" ON public.shifts FOR ALL TO public USING (true) WITH CHECK (true);

-- ── 7. MOCK DATA ──────────────────────────────────────────────
DO $$
DECLARE
  -- Menu item IDs
  mid_001 UUID := gen_random_uuid();
  mid_002 UUID := gen_random_uuid();
  mid_003 UUID := gen_random_uuid();
  mid_004 UUID := gen_random_uuid();
  mid_005 UUID := gen_random_uuid();
  mid_006 UUID := gen_random_uuid();
  mid_007 UUID := gen_random_uuid();
  mid_008 UUID := gen_random_uuid();
  mid_009 UUID := gen_random_uuid();
  mid_010 UUID := gen_random_uuid();
  mid_011 UUID := gen_random_uuid();
  mid_012 UUID := gen_random_uuid();
  mid_013 UUID := gen_random_uuid();
  mid_014 UUID := gen_random_uuid();
  mid_015 UUID := gen_random_uuid();
  mid_016 UUID := gen_random_uuid();
  mid_017 UUID := gen_random_uuid();
  mid_018 UUID := gen_random_uuid();
  mid_019 UUID := gen_random_uuid();
  mid_020 UUID := gen_random_uuid();
  -- Table IDs
  tbl_01 UUID := gen_random_uuid();
  tbl_02 UUID := gen_random_uuid();
  tbl_03 UUID := gen_random_uuid();
  tbl_04 UUID := gen_random_uuid();
  tbl_05 UUID := gen_random_uuid();
  tbl_06 UUID := gen_random_uuid();
  tbl_07 UUID := gen_random_uuid();
  tbl_08 UUID := gen_random_uuid();
  tbl_09 UUID := gen_random_uuid();
  tbl_10 UUID := gen_random_uuid();
  tbl_11 UUID := gen_random_uuid();
  tbl_12 UUID := gen_random_uuid();
  tbl_13 UUID := gen_random_uuid();
  tbl_14 UUID := gen_random_uuid();
  tbl_15 UUID := gen_random_uuid();
  tbl_16 UUID := gen_random_uuid();
  tbl_17 UUID := gen_random_uuid();
  tbl_18 UUID := gen_random_uuid();
  tbl_19 UUID := gen_random_uuid();
  -- Shift ID
  shift_id UUID := gen_random_uuid();
  -- Order IDs
  ord_001 UUID := gen_random_uuid();
  ord_002 UUID := gen_random_uuid();
  -- KOT IDs
  kot_001 UUID := gen_random_uuid();
  kot_002 UUID := gen_random_uuid();
  kot_003 UUID := gen_random_uuid();
  kot_004 UUID := gen_random_uuid();
  kot_005 UUID := gen_random_uuid();
  kot_006 UUID := gen_random_uuid();
  kot_007 UUID := gen_random_uuid();
  kot_008 UUID := gen_random_uuid();
BEGIN

  -- ── Menu Items ──────────────────────────────────────────────
  INSERT INTO public.menu_items (id, name, category, price, gst_rate, hsn_code, is_veg, available, restaurant_id) VALUES
    (mid_001, 'Paneer Tikka', 'Starters', 320, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_002, 'Chicken 65', 'Starters', 360, 5, '2106', false, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_003, 'Veg Spring Roll', 'Starters', 240, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_004, 'Seekh Kebab', 'Starters', 400, 5, '2106', false, false, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_005, 'Dal Makhani', 'Main Course', 280, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_006, 'Butter Chicken', 'Main Course', 420, 5, '2106', false, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_007, 'Palak Paneer', 'Main Course', 300, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_008, 'Mutton Rogan Josh', 'Main Course', 520, 5, '2106', false, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_009, 'Tandoori Roti', 'Breads', 40, 5, '1905', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_010, 'Butter Naan', 'Breads', 60, 5, '1905', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_011, 'Laccha Paratha', 'Breads', 70, 5, '1905', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_012, 'Veg Biryani', 'Rice & Biryani', 320, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_013, 'Chicken Biryani', 'Rice & Biryani', 380, 5, '2106', false, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_014, 'Mutton Biryani', 'Rice & Biryani', 480, 5, '2106', false, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_015, 'Mango Lassi', 'Beverages', 120, 12, '2202', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_016, 'Fresh Lime Soda', 'Beverages', 80, 12, '2202', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_017, 'Cold Coffee', 'Beverages', 160, 12, '2101', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_018, 'Gulab Jamun', 'Desserts', 120, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_019, 'Kulfi Falooda', 'Desserts', 180, 5, '2105', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (mid_020, 'Rasgulla', 'Desserts', 100, 5, '2106', true, true, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── Restaurant Tables ────────────────────────────────────────
  INSERT INTO public.restaurant_tables (id, label, section, capacity, status, covers, captain, seated_at, running_amount, kot_count, restaurant_id) VALUES
    (tbl_01, 'T1', 'Indoor', 4, 'occupied', 3, 'Arjun Nair', NOW() - INTERVAL '45 minutes', 1240, 2, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_02, 'T2', 'Indoor', 2, 'available', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_03, 'T3', 'Indoor', 4, 'bill_requested', 4, 'Priya Menon', NOW() - INTERVAL '72 minutes', 2860, 3, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_04, 'T4', 'Indoor', 6, 'occupied', 5, 'Arjun Nair', NOW() - INTERVAL '28 minutes', 1680, 1, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_05, 'T5', 'Indoor', 2, 'available', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_06, 'T6', 'Indoor', 4, 'occupied', 2, 'Deepak Singh', NOW() - INTERVAL '15 minutes', 640, 1, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_07, 'T7', 'Indoor', 4, 'reserved', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_08, 'T8', 'Indoor', 8, 'cleaning', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_09, 'T9', 'Indoor', 4, 'available', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_10, 'T10', 'Indoor', 6, 'occupied', 6, 'Priya Menon', NOW() - INTERVAL '60 minutes', 3420, 4, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_11, 'O1', 'Outdoor', 4, 'occupied', 2, 'Deepak Singh', NOW() - INTERVAL '20 minutes', 480, 1, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_12, 'O2', 'Outdoor', 4, 'available', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_13, 'O3', 'Outdoor', 6, 'reserved', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_14, 'O4', 'Outdoor', 2, 'available', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_15, 'B1', 'Bar', 2, 'occupied', 2, 'Arjun Nair', NOW() - INTERVAL '35 minutes', 1120, 2, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_16, 'B2', 'Bar', 2, 'available', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_17, 'B3', 'Bar', 4, 'occupied', 3, 'Deepak Singh', NOW() - INTERVAL '50 minutes', 2200, 3, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_18, 'P1', 'Private Dining', 12, 'occupied', 10, 'Priya Menon', NOW() - INTERVAL '90 minutes', 8640, 5, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (tbl_19, 'P2', 'Private Dining', 8, 'reserved', NULL, NULL, NULL, 0, 0, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── Shift ────────────────────────────────────────────────────
  INSERT INTO public.shifts (id, shift_name, shift_date, opened_at, cashier, opening_float, outlet, is_closed, restaurant_id) VALUES
    (shift_id, 'Lunch Shift', CURRENT_DATE, NOW() - INTERVAL '5 hours', 'Rahul Sharma', 2000, 'koramangala', false, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── Orders ───────────────────────────────────────────────────
  INSERT INTO public.orders (id, order_number, table_id, table_label, order_type, status, covers, steward, subtotal, grand_total, shift_id, restaurant_id) VALUES
    (ord_001, 'ORD-001', tbl_01, 'T1', 'dine-in', 'kot_sent', 3, 'Arjun Nair', 1180, 1240, shift_id, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (ord_002, 'ORD-002', tbl_03, 'T3', 'dine-in', 'billed', 4, 'Priya Menon', 2720, 2860, shift_id, (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── Order Items ──────────────────────────────────────────────
  INSERT INTO public.order_items (order_id, menu_item_id, name, price, qty, gst_rate, is_veg) VALUES
    (ord_001, mid_006, 'Butter Chicken', 420, 2, 5, false),
    (ord_001, mid_010, 'Butter Naan', 60, 4, 5, true),
    (ord_001, mid_015, 'Mango Lassi', 120, 2, 12, true),
    (ord_002, mid_008, 'Mutton Rogan Josh', 520, 2, 5, false),
    (ord_002, mid_014, 'Mutton Biryani', 480, 2, 5, false),
    (ord_002, mid_010, 'Butter Naan', 60, 6, 5, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── KOTs ─────────────────────────────────────────────────────
  INSERT INTO public.kots (id, kot_number, order_id, table_label, order_type, station, status, priority, steward, covers, fire_time, restaurant_id) VALUES
    (kot_001, 'K-2841', ord_001, 'T3', 'dine-in', 'Main Kitchen', 'preparing', 'rush', 'Arjun Nair', 3, NOW() - INTERVAL '14 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_002, gen_random_uuid()::TEXT, NULL, 'T7', 'dine-in', 'Grill', 'acknowledged', 'normal', 'Priya Menon', 2, NOW() - INTERVAL '8 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_003, gen_random_uuid()::TEXT, NULL, 'TKW', 'takeaway', 'Main Kitchen', 'pending', 'normal', 'Counter', 0, NOW() - INTERVAL '3 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_004, gen_random_uuid()::TEXT, NULL, 'T1', 'dine-in', 'Beverages', 'preparing', 'normal', 'Arjun Nair', 4, NOW() - INTERVAL '6 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_005, gen_random_uuid()::TEXT, NULL, 'ZMT-12', 'delivery', 'Main Kitchen', 'preparing', 'rush', 'Zomato', 0, NOW() - INTERVAL '11 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_006, gen_random_uuid()::TEXT, NULL, 'T5', 'dine-in', 'Grill', 'pending', 'normal', 'Deepak Singh', 2, NOW() - INTERVAL '2 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_007, gen_random_uuid()::TEXT, NULL, 'T4', 'dine-in', 'Main Kitchen', 'pending', 'normal', 'Priya Menon', 3, NOW() - INTERVAL '1 minute', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    (kot_008, gen_random_uuid()::TEXT, NULL, 'T6', 'dine-in', 'Desserts', 'ready', 'rush', 'Arjun Nair', 4, NOW() - INTERVAL '18 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── KOT Items ────────────────────────────────────────────────
  INSERT INTO public.kot_items (kot_id, menu_item_id, name, qty, note, is_veg) VALUES
    (kot_001, mid_006, 'Butter Chicken', 2, NULL, false),
    (kot_001, mid_005, 'Dal Makhani', 1, 'Less spicy', true),
    (kot_001, mid_010, 'Butter Naan', 4, NULL, true),
    (kot_002, mid_001, 'Paneer Tikka', 1, NULL, true),
    (kot_002, mid_004, 'Seekh Kebab', 2, 'Well done', false),
    (kot_003, mid_013, 'Chicken Biryani', 2, NULL, false),
    (kot_004, mid_015, 'Mango Lassi', 3, NULL, true),
    (kot_004, mid_017, 'Cold Coffee', 1, NULL, true),
    (kot_004, mid_016, 'Fresh Lime Soda', 2, 'Salted', true),
    (kot_005, mid_014, 'Mutton Biryani', 1, NULL, false),
    (kot_005, mid_008, 'Mutton Rogan Josh', 1, NULL, false),
    (kot_005, mid_010, 'Butter Naan', 3, NULL, true),
    (kot_006, mid_002, 'Chicken 65', 2, NULL, false),
    (kot_006, mid_003, 'Veg Spring Roll', 1, NULL, true),
    (kot_007, mid_007, 'Palak Paneer', 2, NULL, true),
    (kot_007, mid_011, 'Laccha Paratha', 4, NULL, true),
    (kot_007, mid_012, 'Veg Biryani', 1, 'No onion', true),
    (kot_008, mid_019, 'Kulfi Falooda', 2, NULL, true),
    (kot_008, mid_018, 'Gulab Jamun', 4, NULL, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Bills ────────────────────────────────────────────────────
  INSERT INTO public.bills (bill_number, order_id, table_label, covers, items_count, gross_amount, discount_amt, gst_amount, net_amount, payment_mode, cashier, status, shift_id, settled_at, restaurant_id) VALUES
    ('B-1145', NULL, 'T3', 3, 6, 1420, 0, 68, 1488, 'upi', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '5 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1146', NULL, 'T7', 2, 4, 980, 98, 43, 925, 'cash', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '4 hours 30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1147', NULL, 'TKW', 1, 3, 760, 0, 36, 796, 'card', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '4 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1148', NULL, 'T1', 4, 8, 2240, 224, 96, 2112, 'upi', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '3 hours 30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1149', NULL, 'T4', 3, 5, 1680, 0, 80, 1760, 'split', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '3 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1150', NULL, 'T2', 2, 2, 480, 0, 24, 504, 'cash', 'Rahul Sharma', 'voided', shift_id, NOW() - INTERVAL '2 hours 30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1151', NULL, 'T5', 4, 7, 3120, 312, 134, 2942, 'card', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '2 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1152', NULL, 'P1', 10, 18, 8640, 864, 389, 8165, 'card', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '1 hour 30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1153', NULL, 'ZMT-12', 0, 4, 1380, 0, 66, 1446, 'online', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '1 hour', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1154', NULL, 'T6', 2, 5, 1920, 0, 92, 2012, 'upi', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1155', NULL, 'T8', 3, 3, 820, 82, 37, 775, 'cash', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '20 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('B-1156', NULL, 'O1', 2, 6, 1640, 0, 78, 1718, 'upi', 'Rahul Sharma', 'settled', shift_id, NOW() - INTERVAL '10 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── Inventory Items ──────────────────────────────────────────
  INSERT INTO public.inventory_items (name, category, unit, current_stock, reorder_level, max_stock, last_purchase_price, consumed_today, variance, supplier, last_updated, status, restaurant_id) VALUES
    ('Chicken (Fresh)', 'Meat & Poultry', 'kg', 4.2, 5, 20, 280, 8.5, -0.3, 'Fresh Farms Pvt Ltd', '08:00', 'low', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Mutton (Boneless)', 'Meat & Poultry', 'kg', 2.0, 3, 10, 680, 3.2, 0, 'Halal Butchers', '08:00', 'critical', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Paneer', 'Dairy', 'kg', 6.5, 3, 15, 340, 2.1, 0.2, 'Mother Dairy', '10:30', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Basmati Rice', 'Grains & Staples', 'kg', 18.0, 5, 25, 95, 4.5, 0, 'Kohinoor Foods', '08:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Tomatoes', 'Vegetables', 'kg', 3.8, 4, 12, 45, 2.0, -0.5, 'Local Mandi', '07:00', 'low', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Onions', 'Vegetables', 'kg', 8.0, 5, 20, 35, 3.2, 0.1, 'Local Mandi', '07:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Cream (Fresh)', 'Dairy', 'litre', 1.5, 2, 8, 180, 1.2, 0, 'Amul', '10:30', 'critical', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Butter', 'Dairy', 'kg', 2.8, 1, 5, 480, 0.8, 0, 'Amul', '10:30', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Maida (Flour)', 'Grains & Staples', 'kg', 12.0, 5, 25, 42, 1.8, 0, 'Pillsbury', '08:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Cooking Oil', 'Oils & Fats', 'litre', 7.5, 5, 20, 140, 2.5, -0.2, 'Fortune', '08:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Biryani Masala', 'Spices & Masalas', 'kg', 0.8, 1, 3, 380, 0.3, 0, 'MDH', '08:00', 'critical', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Mango Pulp', 'Beverages', 'litre', 4.0, 2, 10, 120, 1.5, 0, 'Frooti', '10:30', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Charcoal', 'Fuel & Consumables', 'kg', 22.0, 10, 30, 55, 3.0, 0, 'Fuel Depot', '08:00', 'overstock', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Curd (Dahi)', 'Dairy', 'kg', 3.5, 2, 8, 55, 0.8, 0.1, 'Mother Dairy', '10:30', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Green Cardamom', 'Spices & Masalas', 'gm', 180, 100, 500, 1200, 20, 0, 'MDH', '08:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Saffron', 'Spices & Masalas', 'gm', 12, 10, 50, 8500, 2, 0, 'Kashmir Origin', '08:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Ginger-Garlic Paste', 'Vegetables', 'kg', 2.2, 1, 5, 120, 0.6, 0, 'Local Mandi', '07:00', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Milk (Full Cream)', 'Dairy', 'litre', 5.0, 3, 12, 62, 2.0, 0, 'Amul', '10:30', 'ok', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

  -- ── Staff Users ──────────────────────────────────────────────
  INSERT INTO public.staff_users (name, email, role, outlet, status, last_login, permissions, restaurant_id) VALUES
    ('Vikram Nair', 'vikram@spicegarden.in', 'owner', 'All Outlets', 'active', '24 Mar 2026, 10:00', ARRAY['all'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Rahul Sharma', 'rahul.sharma@spicegarden.in', 'cashier', 'koramangala', 'active', '24 Mar 2026, 11:02', ARRAY['billing', 'payments', 'reports_view'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Priya Menon', 'priya.m@spicegarden.in', 'captain', 'koramangala', 'active', '24 Mar 2026, 11:15', ARRAY['tables', 'orders', 'kot'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Deepak Singh', 'deepak.s@spicegarden.in', 'captain', 'koramangala', 'active', '24 Mar 2026, 11:18', ARRAY['tables', 'orders', 'kot'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Arjun Nair', 'arjun.n@spicegarden.in', 'captain', 'koramangala', 'active', '24 Mar 2026, 11:20', ARRAY['tables', 'orders', 'kot'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Suresh Kumar', 'suresh.k@spicegarden.in', 'kitchen', 'koramangala', 'active', '24 Mar 2026, 10:58', ARRAY['kds', 'kot_view'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Meera Pillai', 'meera.p@spicegarden.in', 'manager', 'koramangala', 'active', '23 Mar 2026, 23:45', ARRAY['billing', 'tables', 'orders', 'kot', 'inventory', 'reports_view', 'settlement'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Anand Krishnan', 'anand.k@spicegarden.in', 'accountant', 'All Outlets', 'inactive', '22 Mar 2026, 14:30', ARRAY['reports_full', 'settlement', 'gst'], (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (email) DO NOTHING;

  -- ── Audit Logs ───────────────────────────────────────────────
  INSERT INTO public.audit_logs (staff_name, staff_role, action, entity, details, ip_address, severity, created_at, restaurant_id) VALUES
    ('Rahul Sharma', 'Cashier', 'BILL_VOID', 'Bill B-1150', 'Bill voided — Reason: Customer cancelled', '192.168.1.12', 'warning', NOW() - INTERVAL '30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Priya Menon', 'Captain', 'KOT_VOID', 'KOT K-2838', 'KOT voided — Reason: Wrong item ordered', '192.168.1.14', 'warning', NOW() - INTERVAL '45 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Rahul Sharma', 'Cashier', 'DISCOUNT_APPLIED', 'Bill B-1148', '10% discount applied via coupon WELCOME10', '192.168.1.12', 'info', NOW() - INTERVAL '1 hour 15 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Meera Pillai', 'Manager', 'MENU_PRICE_CHANGE', 'Butter Chicken', 'Price changed from 380 to 420', '192.168.1.10', 'warning', NOW() - INTERVAL '2 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Vikram Nair', 'Owner', 'USER_CREATED', 'Meera Pillai', 'New manager account created for Koramangala outlet', '192.168.1.1', 'info', NOW() - INTERVAL '2 hours 30 minutes', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Rahul Sharma', 'Cashier', 'SHIFT_OPEN', 'Lunch Shift', 'Shift opened with 2000 opening float', '192.168.1.12', 'info', NOW() - INTERVAL '5 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Anand Krishnan', 'Accountant', 'REPORT_EXPORT', 'GST Report Feb 2026', 'GSTR-1 data exported in JSON format', '192.168.1.22', 'info', NOW() - INTERVAL '6 hours', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1)),
    ('Meera Pillai', 'Manager', 'SHIFT_CLOSE', 'Dinner Shift', 'Shift closed — Cash short by 150, reason noted', '192.168.1.10', 'critical', NOW() - INTERVAL '1 day', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1))
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data insertion failed: %', SQLERRM;
END $$;
