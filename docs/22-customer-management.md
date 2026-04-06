# Customer Management

## Overview

The `/customer-management` page maintains a database of restaurant customers with visit history, contact details, and loyalty tracking.

---

## Customer Fields

| Field | Description |
|---|---|
| Name | Customer full name |
| Phone | Primary contact number |
| Email | Email address (optional) |
| Address | Delivery address (optional) |
| Visit Count | Total number of visits |
| Total Spend | Cumulative spend amount |
| Last Visit | Date of most recent visit |
| Notes | Staff notes about the customer |
| Tags | Custom labels (VIP, Regular, etc.) |

---

## Features

### Customer Search
- Search by name or phone number
- Quick lookup during order creation

### Visit History
- Per-customer order history
- Date, amount, and items per visit

### Loyalty Tracking
- Total spend tracking
- Visit frequency
- Identifies VIP / regular customers

### Customer Profiles
- Add / Edit customer details
- Add notes (e.g. "allergic to nuts", "prefers window seat")

---

## Integration with POS

- During POS billing, cashier can search and attach a customer to the bill
- Customer's visit count and total spend update automatically on bill settlement

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ |
| Manager | ✅ |
| Cashier | ❌ |
| Captain | ❌ |
| Kitchen | ❌ |
| Accountant | ❌ |
