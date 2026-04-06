# POS Billing

## Overview

The `/pos-billing` page is the primary point-of-sale terminal for restaurant staff. It supports dine-in, takeaway, and delivery order types with full GST calculation, multiple payment modes, and offline queuing.

---

## Key Features

### Order Types
- **Dine-In** — Links to a table; KOT is fired to kitchen
- **Takeaway** — Walk-in customer, no table required
- **Delivery** — Delivery order with customer address

### Menu Browsing
- Category filter tabs (Starters, Main Course, Breads, Rice & Biryani, Beverages, Desserts)
- Search by item name
- Veg / Non-Veg indicator on each item
- Real-time availability toggle

### Cart Management
- Add / remove items with quantity controls
- Per-item notes (e.g. "less spicy")
- Discount application (percentage-based)
- Live GST calculation per item using `gstRate` and `hsnCode`

### GST Calculation
```
subtotal = sum(price × qty)
discountAmt = subtotal × discountPct / 100
taxable = subtotal - discountAmt
gst per item = taxable_base × gstRate / 100
grandTotal = taxable + totalGst
```
GST is broken down into CGST + SGST (equal halves).

### Payment Modes
- **Cash** — Manual entry, change calculation
- **UPI** — QR / UPI reference
- **Card** — Card terminal reference
- **Split** — Split between multiple payment modes

### Bill Generation
- Generates GST-compliant invoice via `GSTInvoice` component
- Bill number auto-generated
- Prints via thermal printer (configured in Admin Panel)
- WhatsApp receipt via Twilio integration

### KOT (Kitchen Order Ticket)
- Fired to kitchen on "Place Order"
- KOT appears on Kitchen Display System in real-time
- Multiple KOT rounds supported per table

---

## Offline Support

- Uses `offlineQueue` to queue bill creation when network is unavailable
- Idempotency keys prevent duplicate bills on retry
- `OfflineQueuePanel` component shows pending queue items
- Network status monitored via `useNetworkStatus` hook

---

## Recipe-Based Stock Deduction

When a bill is settled:
1. Looks up `recipes` table for each menu item in the cart
2. Finds ingredient quantities per recipe
3. Deducts from `ingredients.current_stock` automatically
4. Handles partial deduction if stock is insufficient

---

## Shift Integration

- Bills are associated with the active shift
- Shift data feeds into Settlement Dashboard for end-of-day reconciliation

---

## Audit Logging

Every bill creation, void, and discount application is logged to `audit_logs` via `auditService`.

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ |
| Manager | ✅ |
| Cashier | ✅ |
| Captain | ✅ |
| Kitchen | ❌ |
| Accountant | ❌ |
