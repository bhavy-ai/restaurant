# Inventory Management

## Overview

The `/inventory-management` page tracks all raw material and ingredient stock levels, supports manual adjustments, and sends low-stock SMS alerts via Twilio.

---

## Inventory Item Fields

| Field | Description |
|---|---|
| Name | Ingredient / item name |
| Category | Classification (Meat, Dairy, Vegetables, etc.) |
| Unit | Measurement unit (kg, litre, pcs, etc.) |
| Current Stock | Present quantity in stock |
| Reorder Level | Threshold below which item is flagged as "Low" |
| Max Stock | Maximum storage capacity |
| Last Purchase Price | Most recent purchase cost |
| Consumed Today | Units consumed in current day |
| Variance | Difference between expected and actual stock |
| Supplier | Supplier name |
| Last Updated | Timestamp of last stock change |

---

## Stock Status Levels

| Status | Condition | Color |
|---|---|---|
| OK | Current stock > reorder level | Green |
| Low Stock | Current stock ≤ reorder level | Amber |
| Critical | Current stock ≤ 20% of reorder level | Red |
| Overstock | Current stock > max stock | Blue |

---

## Categories

- Meat & Poultry
- Dairy
- Vegetables
- Grains & Staples
- Spices & Masalas
- Beverages
- Oils & Fats
- Fuel & Consumables

---

## Stock Adjustments

Three types of adjustments:

| Type | Description |
|---|---|
| Add | Received new stock (purchase / delivery) |
| Remove | Manual removal (transfer, correction) |
| Wastage | Record spoilage or waste |

Each adjustment requires:
- Quantity
- Reason / notes

All adjustments are logged to `audit_logs`.

---

## Low-Stock SMS Alerts

- "Send Low Stock Alerts" button triggers `/api/send-low-stock-sms`
- Twilio SMS sent to configured phone number
- Lists all items with `low` or `critical` status
- Cooldown prevents spam (tracks `lastAlertSent`)

---

## Auto Stock Deduction

Stock is automatically deducted when:
1. A bill is settled in POS Billing
2. A takeaway/delivery order is placed

Deduction uses the **Recipe Management** mappings:
- Each menu item → list of ingredients + quantities
- On sale, ingredient stock reduced proportionally

---

## Real-Time Updates

- Supabase Realtime subscription on `ingredients` table
- Stock levels update live across all connected devices

---

## Offline Support

- Stock adjustments are queued offline if network is unavailable
- Syncs automatically when connectivity is restored

---

## Sorting & Filtering

- Filter by category
- Search by item name
- Sort by any column (name, stock, reorder level, etc.) ascending/descending

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ |
| Manager | ✅ |
| Cashier | ❌ |
| Captain | ❌ |
| Kitchen | ❌ |
| Accountant | ✅ |
