export interface User {
  id: string;
  email: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  created_at: string;
  category?: Category;
}

export interface Table {
  id: string;
  table_number: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  created_at: string;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'paid';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  notes?: string;
  menu_item?: MenuItem;
}

export interface Order {
  id: string;
  table_id?: string;
  status: OrderStatus;
  total_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  table?: Table;
  order_items?: OrderItem[];
}
