-- ============================================================
-- Pending Modules Migration
-- Recipe Consumption, Customer Management, Discounts,
-- Takeaway/Delivery, Multi-outlet Reporting, Twilio Config
-- ============================================================

-- ── Recipe / Ingredient Consumption ──────────────────────────
CREATE TABLE IF NOT EXISTS public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  current_stock numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 1,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity_used numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS public.stock_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.ingredients(id),
  quantity_deducted numeric NOT NULL,
  reason text DEFAULT 'sale',
  reference_id text,
  created_at timestamptz DEFAULT now()
);

-- ── Customer Management ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text UNIQUE,
  email text,
  address text,
  loyalty_points integer NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  visit_count integer NOT NULL DEFAULT 0,
  tags text[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  bill_id uuid,
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  items_summary text,
  created_at timestamptz DEFAULT now()
);

-- ── Discounts & Coupons ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'percent', -- percent | flat | happy_hour | item_level
  value numeric NOT NULL DEFAULT 0,
  code text UNIQUE,
  min_order_value numeric DEFAULT 0,
  max_discount_value numeric,
  applies_to text DEFAULT 'bill', -- bill | item | category
  applies_to_ids text[] DEFAULT '{}',
  happy_hour_start time,
  happy_hour_end time,
  happy_hour_days text[] DEFAULT '{}',
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  created_at timestamptz DEFAULT now()
);

-- ── Takeaway / Delivery Orders ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeaway_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  order_type text NOT NULL DEFAULT 'takeaway', -- takeaway | delivery | aggregator
  aggregator text, -- zomato | swiggy | null
  aggregator_order_id text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_mode text DEFAULT 'cash',
  status text NOT NULL DEFAULT 'pending', -- pending | confirmed | preparing | ready | dispatched | delivered | cancelled
  assigned_rider text,
  estimated_time integer DEFAULT 30,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Twilio / Notification Config ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet text NOT NULL DEFAULT 'koramangala',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio', -- twilio | msg91
  account_sid text,
  auth_token text,
  from_number text,
  whatsapp_number text,
  enabled boolean NOT NULL DEFAULT false,
  send_receipt_sms boolean NOT NULL DEFAULT true,
  send_receipt_whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(outlet, provider)
);

-- ── Seed dummy Twilio config ──────────────────────────────────
INSERT INTO public.notification_config (outlet, restaurant_id, provider, account_sid, auth_token, from_number, whatsapp_number, enabled)
VALUES ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'twilio', 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'your_auth_token_here', '+15005550006', 'whatsapp:+14155238886', false)
ON CONFLICT (outlet, provider) DO NOTHING;

-- ── RLS (open access for now, consistent with existing tables) ─
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeaway_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ingredients' AND policyname='open_ingredients') THEN
    CREATE POLICY open_ingredients ON public.ingredients FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='recipes' AND policyname='open_recipes') THEN
    CREATE POLICY open_recipes ON public.recipes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_deductions' AND policyname='open_stock_deductions') THEN
    CREATE POLICY open_stock_deductions ON public.stock_deductions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='open_customers') THEN
    CREATE POLICY open_customers ON public.customers FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customer_orders' AND policyname='open_customer_orders') THEN
    CREATE POLICY open_customer_orders ON public.customer_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discounts' AND policyname='open_discounts') THEN
    CREATE POLICY open_discounts ON public.discounts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='takeaway_orders' AND policyname='open_takeaway_orders') THEN
    CREATE POLICY open_takeaway_orders ON public.takeaway_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_config' AND policyname='open_notification_config') THEN
    CREATE POLICY open_notification_config ON public.notification_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Seed sample data ──────────────────────────────────────────
INSERT INTO public.ingredients (outlet, restaurant_id, name, unit, current_stock, reorder_level, cost_per_unit) VALUES
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Chicken', 'kg', 15.5, 5, 220),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Paneer', 'kg', 8.0, 3, 320),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Basmati Rice', 'kg', 25.0, 10, 85),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Tomato', 'kg', 12.0, 4, 40),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Onion', 'kg', 20.0, 5, 30),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Cream', 'litre', 5.0, 2, 180),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Butter', 'kg', 3.0, 1, 450),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Maida', 'kg', 10.0, 3, 45)
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (outlet, restaurant_id, name, phone, email, loyalty_points, total_spent, visit_count, tags) VALUES
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Priya Sharma', '+919876543210', 'priya@example.com', 450, 8900, 12, ARRAY['regular','vip']),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Arjun Mehta', '+919765432109', 'arjun@example.com', 120, 2400, 4, ARRAY['new']),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Sunita Rao', '+919654321098', NULL, 780, 15600, 22, ARRAY['regular','vip','birthday-month']),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Vikram Singh', '+919543210987', 'vikram@example.com', 60, 1200, 2, ARRAY['new'])
ON CONFLICT (phone) DO NOTHING;

INSERT INTO public.discounts (outlet, restaurant_id, name, type, value, code, min_order_value, active) VALUES
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Happy Hour 20% Off', 'happy_hour', 20, 'HAPPY20', 0, true),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Weekend Flat ₹50', 'flat', 50, 'WKND50', 200, true),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'New Customer 10%', 'percent', 10, 'NEWCUST', 0, true),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'Loyalty Reward', 'percent', 5, 'LOYAL5', 500, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.takeaway_orders (outlet, restaurant_id, order_number, order_type, customer_name, customer_phone, items, subtotal, gst_amount, total, status) VALUES
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'TKW-001', 'takeaway', 'Rahul Kumar', '+919876543211', '[{"name":"Butter Chicken","qty":1,"price":320}]', 320, 16, 336, 'delivered'),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'TKW-002', 'delivery', 'Meena Patel', '+919765432100', '[{"name":"Paneer Tikka","qty":2,"price":280}]', 560, 28, 588, 'preparing'),
  ('koramangala', (SELECT id FROM public.restaurants ORDER BY created_at ASC LIMIT 1), 'TKW-003', 'aggregator', 'Zomato Order', NULL, '[{"name":"Chicken Biryani","qty":1,"price":380}]', 380, 19, 399, 'confirmed')
ON CONFLICT DO NOTHING;
