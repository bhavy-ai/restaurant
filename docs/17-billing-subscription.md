# Billing & Subscription

## Overview

RestroOS uses a **SaaS subscription model** with three plans. Restaurant owners can view their subscription invoices at `/restaurant/billing`. Superadmins manage billing from the `/superadmin` panel.

---

## Subscription Plans

| Plan | Description |
|---|---|
| Starter | Entry-level plan for new restaurants |
| Growth | Mid-tier plan for growing restaurants |
| Enterprise | Full-featured plan for large operations |

All self-serve onboarding starts on the **Starter** plan. Plan upgrades are done by the superadmin.

---

## Invoice Fields

| Field | Description |
|---|---|
| Invoice Number | Unique invoice identifier |
| Billing Month | Month the invoice covers |
| Billing Period | Start and end dates |
| Plan Name | Active plan during the period |
| Plan Fee | Base subscription fee |
| Outlet Count | Number of active outlets |
| Total Bills | Number of bills processed |
| Total Revenue | Gross revenue for the period |
| Overage Outlets | Outlets beyond plan limit |
| Overage Fee | Additional charge for extra outlets |
| Subtotal | Plan fee + overage fee |
| GST Rate | Applicable GST percentage |
| GST Amount | GST on subtotal |
| Total Amount | Final amount due |
| Status | Draft / Issued / Paid / Overdue / Void |

---

## Invoice Statuses

| Status | Color | Description |
|---|---|---|
| Draft | Grey | Generated but not yet sent |
| Issued / Due | Amber | Sent to restaurant, awaiting payment |
| Paid | Green | Payment received |
| Overdue | Red | Past due date, unpaid |
| Void | Grey | Cancelled invoice |

---

## Payment via Stripe

- Restaurant owners can pay invoices directly from `/restaurant/billing`
- Stripe Payment Intent created via `/api/stripe/charge-subscription`
- Payment form uses `@stripe/react-stripe-js` Elements
- Payment status polled via `poll-stripe-payment` edge function
- Stripe receipt URL stored on invoice after successful payment

---

## Invoice PDF Download

- Available for all invoices
- Generated client-side via `generateInvoicePdf` utility
- Includes: Restaurant name, billing period, itemized charges, GST breakdown, payment status

---

## Email Invoice

- Invoices can be emailed via Resend
- `send-invoice-email` Supabase edge function handles delivery
- Email includes invoice PDF attachment

---

## Stripe Webhook

- `stripe-webhook` Supabase edge function processes Stripe events
- Handles: `payment_intent.succeeded`, `payment_intent.payment_failed`
- Updates invoice status in `subscription_invoices` table
- Logs events to `stripe_webhook_events` table

---

## Billing Stats (Restaurant View)

Summary cards on `/restaurant/billing`:
- Total Paid (all time)
- Total Due (outstanding)
- Total Invoices
- Current Plan

---

## Database Tables

| Table | Purpose |
|---|---|
| `subscription_invoices` | All subscription invoices |
| `stripe_webhook_events` | Stripe webhook event log |
| `plan_change_history` | Audit trail of plan changes |
