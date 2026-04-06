# Shift Management

## Overview

RestroOS tracks restaurant operations in **shifts**. Each shift has an opening float, tracks all bills processed during the shift, and is closed with a cash reconciliation.

---

## Shift Lifecycle

```
Open Shift → Process Bills → Close Shift (Cash Count) → Handover
```

---

## Shift Data

| Field | Description |
|---|---|
| Shift Name | e.g. "Morning Shift", "Evening Shift" |
| Shift Date | Date of the shift |
| Opened At | Timestamp when shift was opened |
| Cashier | Staff member who opened the shift |
| Opening Float | Starting cash in the drawer |
| Total Bills | Number of bills processed |
| Total Covers | Total guests served |
| Gross Sales | Total revenue before discounts |
| Discounts | Total discounts applied |
| Voids | Total voided bill amounts |
| Net Sales | Gross - Discounts - Voids |
| Cash Sales | Revenue collected in cash |
| UPI Sales | Revenue collected via UPI |
| Card Sales | Revenue collected via card |
| CGST | Central GST collected |
| SGST | State GST collected |
| Total GST | CGST + SGST |
| Avg Bill Value | Net Sales / Total Bills |
| Avg Cover Value | Net Sales / Total Covers |

---

## Shift Handover

**Component**: `src/components/ShiftHandover.tsx`

- Outgoing cashier completes cash count
- Denomination-wise counting (₹2000 down to ₹1)
- System calculates expected vs actual cash
- Surplus / shortage flagged
- Handover notes
- Incoming cashier acknowledgment

---

## Shift in Settlement Dashboard

The Settlement Dashboard (`/settlement-dashboard`) is the primary interface for:
- Viewing current shift stats
- Reviewing all bills in the shift
- Performing cash reconciliation
- Closing the shift

---

## Database

| Table | Purpose |
|---|---|
| `shifts` | Shift records with open/close timestamps and stats |
| `bills.shift_id` | Links each bill to its shift |
