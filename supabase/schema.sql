-- Restaurant Management System - Supabase Schema

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Restaurant Tables
CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number INT NOT NULL UNIQUE,
  capacity INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','reserved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','served','paid')),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- RLS Policies
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Authenticated users can do all on categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do all on menu_items" ON menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do all on tables" ON tables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do all on orders" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do all on order_items" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sample Data

-- Categories
INSERT INTO categories (id, name, description) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Appetizers', 'Start your meal right'),
  ('c1000000-0000-0000-0000-000000000002', 'Main Course', 'Hearty main dishes'),
  ('c1000000-0000-0000-0000-000000000003', 'Desserts', 'Sweet endings'),
  ('c1000000-0000-0000-0000-000000000004', 'Drinks', 'Beverages and cocktails'),
  ('c1000000-0000-0000-0000-000000000005', 'Sides', 'Perfect accompaniments')
ON CONFLICT DO NOTHING;

-- Menu Items
INSERT INTO menu_items (name, description, price, category_id, is_available) VALUES
  ('Bruschetta', 'Toasted bread with tomatoes and basil', 8.50, 'c1000000-0000-0000-0000-000000000001', true),
  ('Calamari', 'Crispy fried squid with marinara', 12.00, 'c1000000-0000-0000-0000-000000000001', true),
  ('Caesar Salad', 'Romaine, croutons, parmesan', 10.50, 'c1000000-0000-0000-0000-000000000001', true),
  ('Grilled Salmon', 'Atlantic salmon with lemon butter', 28.00, 'c1000000-0000-0000-0000-000000000002', true),
  ('Ribeye Steak', '12oz prime cut with garlic butter', 45.00, 'c1000000-0000-0000-0000-000000000002', true),
  ('Chicken Parmesan', 'Breaded chicken, marinara, mozzarella', 22.00, 'c1000000-0000-0000-0000-000000000002', true),
  ('Vegetable Pasta', 'Penne with seasonal vegetables', 18.00, 'c1000000-0000-0000-0000-000000000002', true),
  ('Lamb Chops', 'Herb-marinated rack of lamb', 38.00, 'c1000000-0000-0000-0000-000000000002', true),
  ('Tiramisu', 'Classic Italian dessert', 9.00, 'c1000000-0000-0000-0000-000000000003', true),
  ('Crème Brûlée', 'Vanilla custard with caramel top', 8.00, 'c1000000-0000-0000-0000-000000000003', true),
  ('Chocolate Lava Cake', 'Warm cake with molten center', 10.00, 'c1000000-0000-0000-0000-000000000003', true),
  ('Sparkling Water', '750ml bottle', 4.00, 'c1000000-0000-0000-0000-000000000004', true),
  ('House Wine', 'Red or white, glass', 12.00, 'c1000000-0000-0000-0000-000000000004', true),
  ('Garlic Bread', 'Toasted with herb butter', 5.00, 'c1000000-0000-0000-0000-000000000005', true),
  ('Truffle Fries', 'Crispy fries with truffle oil', 8.00, 'c1000000-0000-0000-0000-000000000005', true)
ON CONFLICT DO NOTHING;

-- Tables
INSERT INTO tables (table_number, capacity, status) VALUES
  (1, 2, 'available'),
  (2, 2, 'available'),
  (3, 4, 'available'),
  (4, 4, 'available'),
  (5, 4, 'available'),
  (6, 6, 'available'),
  (7, 6, 'available'),
  (8, 8, 'available'),
  (9, 8, 'available'),
  (10, 10, 'available')
ON CONFLICT DO NOTHING;
