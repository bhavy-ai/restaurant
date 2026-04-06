# Settlement Dashboard

## Overview

The `/settlement-dashboard` page handles end-of-shift cash reconciliation, bill review, Stripe payment processing, and shift handover.

---

## Key Features

### Shift Management
- View current active shift details (shift name, date, opened at, cashier)
- Opening float tracking
- Shift handover via `ShiftHandover` component
- Shift close with denomination-wise cash counting

### Bill Summary
Each bill in the settlement list shows:
- Bill number
- Table label
- Time
- Number of items and covers
- Gross amount
- Discount applied
- GST amount
- Net amount
- Payment mode (Cash / UPI / Card)
- Cashier name
- Status (Settled / Voided / Refunded)
- Stripe receipt URL (if card payment)

### Shift Statistics
Aggregated stats for the current shift:
- Total bills
- Total covers
- Gross sales
- Discounts
- Voids
- Net sales
- Cash / UPI / Card breakdown
- CGST + SGST + Total GST
- Average bill value
- Average cover value

---

## Cash Reconciliation

Denomination-wise cash counting:
- Denominations: ₹2000, ₹500, ₹200, ₹100, ₹50, ₹20, ₹10, ₹5, ₹2, ₹1
- Enter count per denomination
- System calculates total counted cash
- Compares against expected cash (opening float + cash sales)
- Shows surplus / shortage

---

## Stripe Payment Integration

For card/online payments:
- Stripe Payment Intent created via `/api/stripe/charge-subscription`
- `@stripe/stripe-js` + `@stripe/react-stripe-js` for frontend payment form
- Payment status polled via `poll-stripe-payment` edge function
- Stripe receipt URL stored on bill record
- Failed charge alerts shown with retry countdown

---

## Sync & Verification

- **SyncStatusPanel**: Shows sync status of bills to backend
- **PostSyncVerification**: Verifies bill counts and amounts after sync
- Manual re-sync trigger available

---

## WhatsApp Receipt

- Send settlement summary via WhatsApp using Twilio
- Triggered from settlement dashboard
- Uses `send-whatsapp-receipt` Supabase edge function

---

## Charts

- Bar chart: Revenue by payment mode
- Pie chart: Payment mode distribution
- Powered by Recharts

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ |
| Manager | ✅ |
| Cashier | ✅ |
| Captain | ❌ |
| Kitchen | ❌ |
| Accountant | ✅ |
