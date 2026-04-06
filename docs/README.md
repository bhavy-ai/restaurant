# RestroOS — Documentation Index

Welcome to the RestroOS documentation. This index lists all available documentation files.

---

## Documentation Files

| # | File | Description |
|---|---|---|
| 01 | [Project Overview](./01-overview.md) | Tech stack, architecture principles, module map |
| 02 | [Roles & Permissions](./02-roles-and-permissions.md) | All 6 staff roles, permissions matrix, demo credentials |
| 03 | [Multi-Tenant Architecture](./03-multi-tenant-architecture.md) | Data isolation, RLS, restaurant/outlet switching |
| 04 | [Onboarding](./04-onboarding.md) | Self-serve restaurant registration wizard |
| 05 | [POS Billing](./05-pos-billing.md) | Point-of-sale terminal, GST, payments, KOT |
| 06 | [Table Management](./06-table-management.md) | Floor plan, table statuses, KOT firing, billing |
| 07 | [Kitchen Display System](./07-kitchen-display-system.md) | Real-time KOT display, station filters, urgency |
| 08 | [Takeaway & Delivery](./08-takeaway-delivery.md) | Takeaway/delivery order management |
| 09 | [Inventory Management](./09-inventory-management.md) | Stock tracking, adjustments, SMS alerts |
| 10 | [Recipe Management](./10-recipe-management.md) | Recipe-ingredient mapping, auto stock deduction |
| 11 | [Discounts & Coupons](./11-discounts-coupons.md) | Discount rules, happy-hour, coupon codes |
| 12 | [Settlement Dashboard](./12-settlement-dashboard.md) | Shift close, cash reconciliation, Stripe |
| 13 | [Reports & Analytics](./13-reports-analytics.md) | Sales, GST, cashier, void, category reports |
| 14 | [Multi-Outlet](./14-multi-outlet.md) | Cross-outlet sales, stock, staff comparison |
| 15 | [Admin Panel](./15-admin-panel.md) | Outlet config, staff, menu, taxes, printers |
| 16 | [Superadmin Panel](./16-superadmin-panel.md) | Platform-level restaurant & billing management |
| 17 | [Billing & Subscription](./17-billing-subscription.md) | SaaS plans, invoices, Stripe payments |
| 18 | [Integrations](./18-integrations.md) | Stripe, Twilio, Resend, aggregators, printers |
| 19 | [Database Schema](./19-database-schema.md) | All tables, migrations, RLS patterns |
| 20 | [Offline Support & Error Handling](./20-offline-support-error-handling.md) | Offline queue, error tracking, audit logs |
| 21 | [GST Invoice & Printing](./21-gst-invoice-printing.md) | Invoice format, PDF, thermal printing |
| 22 | [Customer Management](./22-customer-management.md) | Customer profiles, visit history, loyalty |
| 23 | [Menu Sync & Aggregator Orders](./23-menu-sync-aggregator.md) | Zomato/Swiggy sync and order management |
| 24 | [Shift Management](./24-shift-management.md) | Shift lifecycle, handover, cash count |
| 25 | [File Structure](./25-file-structure.md) | Complete project directory and service map |
| 26 | [Environment Variables](./26-environment-variables.md) | All env vars, usage, and configuration status |

---

## Quick Reference

### Demo Login
- **App URL**: https://restroos1030.builtwithrocket.new
- **Superadmin**: `admin@restroos.com` / `SuperAdmin@2024`
- **Owner**: `vikram@spicegarden.in` / `Demo@1234`
- **Cashier**: `rahul.sharma@spicegarden.in` / `Demo@1234`
- **Kitchen**: `suresh.k@spicegarden.in` / `Demo@1234`

### Key Routes
| Route | Module |
|---|---|
| `/login` | Login |
| `/onboard` | New restaurant registration |
| `/pos-billing` | POS terminal |
| `/table-management` | Floor plan |
| `/kitchen-display-system` | KDS |
| `/settlement-dashboard` | Shift close |
| `/reports` | Analytics |
| `/admin-panel` | Outlet settings |
| `/superadmin` | Platform admin |
| `/restaurant/billing` | Subscription invoices |
