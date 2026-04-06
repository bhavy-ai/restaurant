# Database Schema

## Overview

RestroOS uses **Supabase (PostgreSQL)** with Row-Level Security (RLS) for complete tenant isolation. All migrations are in `supabase/migrations/`.

---

## Migration Files

| File | Purpose |
|---|---|
| `20260324165600_restaurant_core.sql` | Core restaurant, outlet, staff, menu, bills, KOTs, inventory tables |
| `20260324173200_stripe_payment_tracking.sql` | Stripe payment intent tracking |
| `20260324174000_stripe_webhook_events.sql` | Stripe webhook event log |
| `20260324180000_admin_panel_extensions.sql` | Admin panel config tables |
| `20260324190000_printer_aggregator_config.sql` | Printer and aggregator config |
| `20260325050000_pending_modules.sql` | Additional module tables |
| `20260329160000_error_tracking_audit_logs.sql` | Error tracking and audit logs |
| `20260329170000_pending_features.sql` | Pending feature tables |
| `20260330120000_seed_demo_auth_users.sql` | Demo user seed data |
| `20260403182233_phase1_restaurant_id_multitenant.sql` | Add restaurant_id to all tables |
| `20260403190000_phase2_auth_multitenant.sql` | Auth multi-tenant setup |
| `20260403191000_phase4_rls_isolation.sql` | RLS policies for tenant isolation |
| `20260403192000_phase6_hardening.sql` | Security hardening |
| `20260403200000_onboarding_superadmin.sql` | Onboarding + superadmin tables |
| `20260403210000_fix_slug_plans_superadmin.sql` | Slug and plan fixes |
| `20260403220000_audit_logs_superadmin_id.sql` | Superadmin ID on audit logs |
| `20260403230000_subscription_invoices.sql` | Subscription invoice table |
| `20260403240000_billing_restaurant_rls.sql` | Billing RLS policies |
| `20260403250000_plan_change_history.sql` | Plan change audit table |

---

## Core Tables

### `restaurants`
```
id, name, slug, gstin, fssai, phone, website, address, city, state, pincode,
cuisine_type, seating_capacity, plan, is_active, owner_user_id,
created_by_user_id, onboarding_status, onboarding_completed_at, created_at
```

### `outlets`
```
id, restaurant_id, name, slug, address, phone, is_active, created_at
```

### `staff_users`
```
id, restaurant_id, name, email, phone, role, outlet, status,
permissions (jsonb), last_login, created_at
```

### `user_restaurant_access`
```
id, user_id, restaurant_id, outlet_id, role, is_active, created_at
```

### `platform_superadmins`
```
id, user_id, email, name, is_active, created_at
```

### `restaurant_tables`
```
id, restaurant_id, outlet_id, label, section, capacity, status,
covers, captain, seated_at, running_amount, reserved_for, reserved_at,
kot_count, created_at
```

### `menu_items`
```
id, restaurant_id, outlet, name, category, price, gst_rate, hsn_code,
is_veg, available, created_at
```

### `bills`
```
id, restaurant_id, outlet, bill_no, table_label, order_type, covers,
items (jsonb), gross_amount, discount_pct, discount_amount, gst_amount,
net_amount, payment_mode, cashier, shift_id, status, stripe_status,
stripe_receipt_url, stripe_payment_intent_id, created_at
```

### `kots`
```
id, restaurant_id, outlet_id, kot_number, table_id, table_label,
order_type, station, fire_time, status, priority, steward, covers, created_at
```

### `kot_items`
```
id, kot_id, menu_item_id, name, qty, note, is_veg, fulfilled_qty, created_at
```

### `ingredients`
```
id, restaurant_id, outlet, name, category, unit, current_stock,
reorder_level, max_stock, last_purchase_price, consumed_today,
variance, supplier, last_updated
```

### `recipes`
```
id, menu_item_id, ingredient_id, quantity_used, created_at
```

### `discounts`
```
id, restaurant_id, outlet, name, type, value, code, min_order_value,
max_discount_value, applies_to, happy_hour_start, happy_hour_end,
happy_hour_days (jsonb), usage_limit, usage_count, active,
valid_from, valid_until, created_at
```

### `subscription_invoices`
```
id, restaurant_id, invoice_number, billing_month, billing_period_start,
billing_period_end, plan_name, plan_fee, outlet_count, total_bills,
total_revenue, overage_outlets, overage_fee, subtotal, gst_rate,
gst_amount, total_amount, status, notes, generated_at, issued_at,
paid_at, stripe_receipt_url, stripe_payment_intent_id
```

### `audit_logs`
```
id, restaurant_id, superadmin_id, timestamp, user_id, user_name, role,
action, entity, entity_id, details, ip_address, severity, created_at
```

### `plan_change_history`
```
id, restaurant_id, old_plan, new_plan, changed_by_superadmin_id,
changed_at, notes
```

---

## RLS Policy Pattern

All restaurant-scoped tables follow this pattern:

```sql
-- Read: only your restaurant's data
CREATE POLICY "tenant_read" ON table_name
  FOR SELECT USING (restaurant_id = current_restaurant_id());

-- Write: only your restaurant's data
CREATE POLICY "tenant_write" ON table_name
  FOR ALL USING (restaurant_id = current_restaurant_id());
```

Superadmin bypass:
```sql
-- Superadmins can read all
CREATE POLICY "superadmin_read" ON table_name
  FOR SELECT USING (is_platform_superadmin());
```
