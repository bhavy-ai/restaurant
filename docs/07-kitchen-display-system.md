# Kitchen Display System (KDS)

## Overview

The `/kitchen-display-system` page is a real-time order display for kitchen staff. It shows all active KOTs (Kitchen Order Tickets) and allows kitchen staff to acknowledge, prepare, and mark orders as ready.

---

## KOT Card Information

Each KOT card displays:
- KOT number (e.g. KOT-0042)
- Table label or order type (Takeaway / Delivery)
- Order type badge
- Kitchen station assignment
- Number of covers
- Steward / captain name
- Elapsed time since KOT was fired
- Priority indicator (Normal / Rush)
- All items with quantities and special notes
- Veg / Non-Veg indicator per item
- Current status

---

## KOT Statuses

| Status | Color | Description |
|---|---|---|
| Pending | Grey | KOT received, not yet acknowledged |
| Acknowledged | Blue | Kitchen has seen the order |
| Preparing | Amber | Order is being cooked |
| Ready | Green | Order is ready to be served |

---

## Urgency Color Coding

KOT cards change color based on elapsed time:

| Time Elapsed | Card Color | Meaning |
|---|---|---|
| < 8 minutes | Default (dark) | Normal |
| 8–14 minutes | Amber border | Getting late |
| ≥ 15 minutes | Red border | Overdue — needs attention |
| Ready | Green border | Completed |

---

## Station Filter

Kitchen staff can filter KOTs by station:
- All
- Main Kitchen
- Grill
- Beverages
- Desserts

---

## Item-Level Fulfillment

Kitchen staff can mark individual items within a KOT as fulfilled:
- Checkbox per item
- Partial fulfillment tracked in `fulfillmentMap` state
- Useful for large orders where items are ready at different times

---

## Void KOT

- Kitchen staff can void a KOT with a reason
- Voided KOTs are removed from the active display
- Void is logged to audit trail

---

## Real-Time Updates

- Supabase Realtime subscription on `kots` and `kot_items` tables
- New KOTs appear instantly without page refresh
- Debounce logic prevents duplicate rapid fetches when KOT + items arrive in quick succession
- Table status changes from Table Management are also reflected via broadcast

---

## Auto-Refresh

- 30-second polling as fallback if Realtime subscription drops
- Timer ticks every minute to update elapsed time displays

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ |
| Manager | ✅ |
| Cashier | ❌ |
| Captain | ✅ |
| Kitchen | ✅ |
| Accountant | ❌ |
