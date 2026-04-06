# Roles & Permissions

## Staff Roles

RestroOS has **6 staff roles** defined in `src/contexts/AuthContext.tsx`. Each role maps to a set of allowed modules.

---

## Role Permissions Matrix

| Module | owner | manager | cashier | captain | kitchen | accountant |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| POS Billing | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Kitchen Display System | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Table Management | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Takeaway / Delivery | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Inventory Management | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Recipe Management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Discounts & Coupons | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Customer Management | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settlement Dashboard | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Reports / Analytics | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Multi-Outlet | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Admin Panel | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Superadmin | ❌* | ❌* | ❌* | ❌* | ❌* | ❌* |

> *Superadmin is a **platform-level** role stored in `platform_superadmins` table — completely separate from staff roles.

---

## Role Descriptions

### Owner
- Full access to all modules except Superadmin
- Can access Admin Panel (outlet settings, staff management, menu, taxes, printers, integrations)
- Can view and manage all reports, settlement, and billing

### Manager
- Same as Owner **minus** Admin Panel
- Can manage day-to-day operations across all operational modules

### Cashier
- Operational access: POS Billing, Table Management, Takeaway, Settlement Dashboard, Reports
- Cannot access kitchen, inventory, recipes, discounts, or admin settings

### Captain
- Floor-level access: POS Billing, Kitchen Display, Table Management, Takeaway
- **Cannot** add/edit/delete tables (view and seat only)
- Cannot access back-office modules

### Kitchen
- **Only** Kitchen Display System
- No access to any other module

### Accountant
- Back-office financial access: Inventory, Settlement Dashboard, Reports, Multi-Outlet
- No operational (POS/KDS/Table) access

---

## Table Management — Sub-Permissions

Within Table Management, add/edit/delete table actions are further restricted:

| Action | owner | manager | cashier | captain |
|---|:---:|:---:|:---:|:---:|
| View floor plan | ✅ | ✅ | ✅ | ✅ |
| Seat a table | ✅ | ✅ | ✅ | ✅ |
| Add / Edit / Delete tables | ✅ | ✅ | ❌ | ❌ |

---

## Superadmin Role

- Stored in `platform_superadmins` table (not `staff_users`)
- Checked separately via `supabase.from('platform_superadmins').select('id').eq('user_id', ...)`
- Has access to `/superadmin` panel only
- Can manage all restaurants, plans, invoices, audit logs, and SaaS metrics
- Cannot access restaurant-level operational modules

---

## Demo Credentials

All demo accounts use password: **`Demo@1234`**

| Email | Role | Notes |
|---|---|---|
| `admin@restroos.com` | Platform Superadmin | Password: `SuperAdmin@2024` |
| `vikram@spicegarden.in` | Owner | Full access |
| `meera.p@spicegarden.in` | Manager | All ops, no admin panel |
| `rahul.sharma@spicegarden.in` | Cashier | POS, tables, settlement |
| `priya.m@spicegarden.in` | Captain | POS, KDS, tables |
| `suresh.k@spicegarden.in` | Kitchen | KDS only |
| `anand.k@spicegarden.in` | Accountant | Inventory, settlement, reports |

---

## How RBAC is Enforced

1. **`AuthContext.tsx`** — `ROLE_PERMISSIONS` object maps each role to an array of allowed route IDs
2. **`RouteGuard.tsx`** — Wraps every protected page; calls `canAccess(routeId)` and redirects if denied
3. **`canAccess(routeId)`** — Checks `staffUser.permissions` array against the requested route ID
4. **Sidebar** — Only renders nav items the current user has permission to access
