# Superadmin Panel

## Overview

The `/superadmin` page is the **platform-level control panel** for RestroOS SaaS administrators. It is completely separate from restaurant-level roles and is accessible only to users listed in the `platform_superadmins` table.

---

## Access Control

- Checked via `platform_superadmins` table (not `staff_users`)
- Query: `SELECT id FROM platform_superadmins WHERE user_id = ? AND is_active = true`
- If not a superadmin → access denied with error message
- Superadmin ID is stored in state for audit logging

---

## Superadmin Tabs

### 1. Restaurants
The main restaurant management view:

**Restaurant List**
- Search by name, GSTIN, city
- Filter by plan (Starter / Growth / Enterprise)
- Filter by status (Active / Inactive)
- Shows: Name, Plan badge, City, Outlet count, Onboarding status, Created date

**Restaurant Detail Panel**
- Full restaurant info (address, GSTIN, FSSAI, phone, website, cuisine, seating)
- Outlet list with active/inactive status
- Plan change dropdown (Starter → Growth → Enterprise)
- Activate / Deactivate restaurant toggle
- Edit restaurant details

**Add Restaurant**
Full form to create a new restaurant:
- Restaurant details (name, cuisine, GSTIN, FSSAI, phone, website, address, city, state, pincode, seating capacity)
- Owner account (name, email)
- Plan selection
- Onboarding status
- First outlet details (name, address, phone)

Creates: auth user + staff_user + restaurant + outlet + user_restaurant_access in one operation.

### 2. Audit Logs (`AuditLogDashboard`)
- Platform-wide audit trail
- Filter by restaurant, action type, severity, date range
- Severity: Info, Warning, Critical
- Export to CSV

### 3. Invoices (`InvoicesDashboard`)
- All subscription invoices across all restaurants
- Filter by status (Draft / Issued / Paid / Overdue / Void)
- Filter by plan, date range
- Mark invoices as paid / void
- Download invoice PDF
- Stripe receipt links

### 4. Subscription Scheduler (`SubscriptionScheduler`)
- Schedule monthly billing runs
- Preview upcoming charges
- Manual trigger for billing cycle
- View scheduled jobs and their status

### 5. SaaS Metrics (`SaasMetricsDashboard`)
- Platform-level KPIs:
  - Total restaurants
  - Active restaurants
  - Total outlets
  - MRR (Monthly Recurring Revenue)
  - Revenue by plan
  - Churn rate
  - New signups trend
- Charts: Revenue trend, Plan distribution, Churn analysis

### 6. Plan Change Audit (`PlanChangeAudit`)
- History of all plan changes across all restaurants
- Who changed the plan, from what to what, when
- Superadmin ID recorded for each change

---

## Plans

| Plan | Label |
|---|---|
| starter | Starter |
| growth | Growth |
| enterprise | Enterprise |
| free | Free |

---

## Superadmin Credentials

| Email | Password |
|---|---|
| `admin@restroos.com` | `SuperAdmin@2024` |
