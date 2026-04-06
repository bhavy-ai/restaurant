# RestroOS — Project Overview

## What is RestroOS?

RestroOS is a **multi-tenant SaaS Restaurant Management Platform** built on Next.js 15 + Supabase. It provides a complete end-to-end operating system for restaurants — from table management and POS billing to kitchen display, inventory, reports, and a superadmin control panel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v3 |
| Backend / DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Payments | Stripe (subscription billing + settlement) |
| Notifications | Twilio (SMS / WhatsApp), Resend (email) |
| PDF Generation | Custom `generateInvoicePdf` utility |
| Offline Support | Custom `offlineQueue` with IndexedDB-style queuing |
| Error Tracking | Custom `errorTracking` + Supabase `audit_logs` table |

---

## Application URL

- **Live App**: https://restroos1030.builtwithrocket.new
- **Published**: https://restroos-7ix5l79.public.builtwithrocket.new

---

## Version

**RestroOS v2.4.1**

---

## Core Architecture Principles

1. **Multi-Tenant** — Each restaurant is isolated via `restaurant_id` on every table. Row-Level Security (RLS) enforces data isolation at the database layer.
2. **Multi-Outlet** — A single restaurant can have multiple outlets (branches). Staff are scoped to specific outlets.
3. **Role-Based Access Control (RBAC)** — Six staff roles with distinct module permissions. Superadmin is a separate platform-level role.
4. **Offline-First** — Critical operations (KOT fire, bill creation) are queued offline and synced when connectivity is restored.
5. **Real-Time** — Supabase Realtime subscriptions power live KOT updates on KDS and table status changes.
6. **Audit Trail** — Every significant action (bill void, discount apply, staff change) is logged to `audit_logs`.

---

## Module Map

| Module | Route | Description |
|---|---|---|
| POS Billing | `/pos-billing` | Full-featured point-of-sale terminal |
| Kitchen Display | `/kitchen-display-system` | Real-time KOT display for kitchen staff |
| Table Management | `/table-management` | Floor plan, seating, KOT firing, billing |
| Takeaway / Delivery | `/takeaway` | Takeaway and delivery order management |
| Aggregator Orders | `/aggregator-orders` | Zomato / Swiggy order integration |
| Inventory | `/inventory-management` | Stock tracking, adjustments, low-stock alerts |
| Recipe Management | `/recipe-management` | Recipe-to-ingredient mapping for auto stock deduction |
| Discounts & Coupons | `/discounts` | Discount rules, happy-hour, coupon codes |
| Customer Management | `/customer-management` | Customer profiles, loyalty, visit history |
| Settlement Dashboard | `/settlement-dashboard` | Shift close, cash reconciliation, Stripe payments |
| Reports / Analytics | `/reports` | Sales, GST, cashier, void, category reports |
| Multi-Outlet | `/multi-outlet` | Cross-outlet sales, stock, and staff comparison |
| Menu Sync | `/menu-sync` | Sync menu to aggregator platforms |
| Admin Panel | `/admin-panel` | Outlet settings, staff, menu, taxes, printers, integrations |
| Restaurant Billing | `/restaurant/billing` | Subscription invoice management for restaurant owners |
| Superadmin | `/superadmin` | Platform-level restaurant management (SaaS admin) |
| Onboarding | `/onboard` | Self-serve restaurant registration wizard |
| Login | `/login` | Authentication page |
