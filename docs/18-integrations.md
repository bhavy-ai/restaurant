# Integrations

## Overview

RestroOS integrates with several third-party services for payments, notifications, and aggregator platforms.

---

## Stripe

**Purpose**: Subscription billing and card payment processing

**Configuration**:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Frontend Stripe key
- `STRIPE_SECRET_KEY` — Server-side Stripe key
- `STRIPE_WEBHOOK_SECRET` — Webhook signature verification

**Usage**:
- Restaurant subscription invoices charged via Stripe
- Card payments at settlement processed via Stripe Payment Intents
- Webhook events processed by `supabase/functions/stripe-webhook/index.ts`
- Payment status polling via `supabase/functions/poll-stripe-payment/index.ts`
- Charge creation via `/api/stripe/charge-subscription/route.ts`

**Stripe Tables**:
- `stripe_webhook_events` — Raw webhook event log
- `subscription_invoices.stripe_payment_intent_id` — Links invoice to Stripe PI
- `subscription_invoices.stripe_receipt_url` — Receipt URL after payment

---

## Twilio

**Purpose**: SMS and WhatsApp notifications

**Configuration**:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` — SMS sender number
- `TWILIO_WHATSAPP_FROM` — WhatsApp sender number

**Usage**:
1. **Low Stock SMS Alerts** — `/api/send-low-stock-sms/route.ts`
   - Sends SMS listing all low/critical stock items
   - Triggered manually from Inventory Management

2. **WhatsApp Receipt** — `supabase/functions/send-whatsapp-receipt/index.ts`
   - Sends settlement summary via WhatsApp
   - Triggered from Settlement Dashboard

---

## Resend

**Purpose**: Transactional email

**Usage**:
- Invoice emails via `supabase/functions/send-invoice-email/index.ts`
- Sends subscription invoice PDF to restaurant owner

---

## Aggregator Platforms (Zomato / Swiggy)

**Purpose**: Receive and manage orders from food delivery platforms

**Pages**:
- `/aggregator-orders` — Dedicated aggregator order management view
- `/menu-sync` — Sync restaurant menu to aggregator platforms

**Configuration**:
- API keys managed per outlet in Admin Panel → Integrations section
- `aggregator_config` table stores platform credentials
- `20260324190000_printer_aggregator_config.sql` migration adds aggregator config support

**Supported Platforms**:
- Zomato
- Swiggy
- (Extensible to other platforms)

---

## Thermal Printer

**Purpose**: KOT and bill printing

**Configuration**: Admin Panel → Printers section

**Fields**:
- Printer name
- Type (thermal / network)
- IP address
- Port
- Paper width (58mm / 80mm)

**KOT Print API**: `/api/print-kot/route.ts`
- Sends KOT data to configured printer
- Supports multiple printers (kitchen printer, bill printer)

---

## Supabase Edge Functions

| Function | Purpose |
|---|---|
| `send-whatsapp-receipt` | WhatsApp settlement summary via Twilio |
| `send-invoice-email` | Invoice email via Resend |
| `stripe-webhook` | Process Stripe payment events |
| `create-settlement-payment-intent` | Create Stripe PI for settlement |
| `poll-stripe-payment` | Poll Stripe for payment status |
