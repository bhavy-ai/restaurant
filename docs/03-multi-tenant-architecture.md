# Multi-Tenant Architecture

## Overview

RestroOS is a **true multi-tenant SaaS** platform. Every restaurant's data is completely isolated from other restaurants at the database level using PostgreSQL Row-Level Security (RLS).

---

## Data Model Hierarchy

```
Platform (RestroOS SaaS)
└── Restaurant (e.g. "Spice Garden")
    ├── Outlet 1 (e.g. "Koramangala")
    │   ├── Staff Users
    │   ├── Tables
    │   ├── Menu Items
    │   ├── Bills / KOTs
    │   └── Inventory
    └── Outlet 2 (e.g. "Indiranagar")
        └── ...
```

---

## Key Tables

| Table | Purpose | Tenant Isolation Column |
|---|---|---|
| `restaurants` | Restaurant master record | `id` (root) |
| `outlets` | Branches of a restaurant | `restaurant_id` |
| `staff_users` | Staff accounts | `restaurant_id` |
| `restaurant_tables` | Floor plan tables | `restaurant_id` |
| `menu_items` | Menu catalog | `restaurant_id` / `outlet` |
| `bills` | Billing records | `restaurant_id` |
| `kots` | Kitchen order tickets | `restaurant_id` |
| `ingredients` | Inventory items | `restaurant_id` |
| `discounts` | Discount rules | `outlet` |
| `user_restaurant_access` | Maps users to restaurants | `restaurant_id` |
| `platform_superadmins` | SaaS admin accounts | Platform-level |

---

## Row-Level Security (RLS)

All tables have RLS enabled. Policies enforce:

1. **Restaurant isolation** — Users can only read/write rows where `restaurant_id` matches their active restaurant
2. **Outlet scoping** — Some tables further scope to `outlet_id`
3. **Superadmin bypass** — `platform_superadmins` members can read all rows for management purposes

Migration files implementing RLS:
- `20260403182233_phase1_restaurant_id_multitenant.sql` — Adds `restaurant_id` columns
- `20260403190000_phase2_auth_multitenant.sql` — Auth-level multi-tenant setup
- `20260403191000_phase4_rls_isolation.sql` — RLS policies
- `20260403192000_phase6_hardening.sql` — Security hardening

---

## Restaurant Switcher

Users with access to multiple restaurants can switch between them via the **Sidebar Restaurant Switcher**:

1. Dropdown shows all accessible restaurants from `user_restaurant_access`
2. Selecting a restaurant calls `switchRestaurant(restaurantId)` in `AuthContext`
3. Active restaurant + outlet are persisted to `localStorage` (`restro_active_restaurant_id`, `restro_active_outlet_id`)
4. All data queries automatically use `activeRestaurant.id` as the filter

---

## Outlet Switcher

Within a restaurant, users can switch between outlets:

1. Outlet dropdown shows all outlets for the active restaurant
2. `switchOutlet(outletId)` updates `activeOutlet` in context
3. Outlet selection persisted to `localStorage`

---

## User-Restaurant Access

The `user_restaurant_access` table controls which users can access which restaurants:

```sql
user_restaurant_access (
  user_id       -- Supabase auth user ID
  restaurant_id -- Restaurant they can access
  outlet_id     -- Specific outlet (optional)
  role          -- Their role at this restaurant
  is_active     -- Whether access is currently active
)
```

---

## Onboarding Flow (Self-Serve)

New restaurants are created via the `/onboard` wizard:

1. User signs up / logs in
2. Step 1: Restaurant basics (name, cuisine, GSTIN, FSSAI)
3. Step 2: Location (address, city, state, pincode, seating capacity)
4. Step 3: First outlet (name, address, phone)
5. On submit:
   - Creates `restaurants` record with `plan: 'starter'`
   - Creates first `outlets` record
   - Creates `user_restaurant_access` with `role: 'owner'`
   - Redirects to `/pos-billing`

---

## Superadmin-Created Restaurants

Superadmins can also create restaurants directly from the `/superadmin` panel:

- Full form: restaurant details + owner account + outlet details
- Can assign any plan (starter / growth / enterprise)
- Can set onboarding status
- Creates auth user + staff_user + restaurant + outlet + access record in one operation
