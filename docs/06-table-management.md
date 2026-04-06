# Table Management

## Overview

The `/table-management` page provides a visual floor plan of the restaurant with real-time table status tracking, KOT firing, and integrated billing.

---

## Table Sections

Tables are organized into 4 sections:
- **Indoor**
- **Outdoor**
- **Bar**
- **Private Dining**

---

## Table Statuses

| Status | Color | Description |
|---|---|---|
| Available | Green | Table is free |
| Occupied | Amber | Guests are seated, order in progress |
| Bill Requested | Red | Guest has requested the bill |
| Reserved | Blue | Table is reserved for a future booking |
| Cleaning | Grey | Table is being cleaned after checkout |

---

## Table Card Information

Each table card displays:
- Table label (e.g. T-01, T-02)
- Section badge
- Capacity (covers)
- Current status with color coding
- Seated duration (e.g. "45m", "1h 20m") for occupied tables
- Running amount (total of all KOTs fired)
- Captain assigned
- KOT round count

---

## Core Workflows

### Seating a Table
1. Click an **Available** table
2. Enter number of covers (guests)
3. Assign a captain (optional)
4. Table moves to **Occupied** status

### Firing a KOT
1. Select an occupied table
2. Browse menu by category or search
3. Add items to cart with quantities and notes
4. Click **Fire KOT** → KOT is sent to Kitchen Display System
5. KOT round counter increments on the table card

### Multiple KOT Rounds
- Same table can have multiple KOT rounds (e.g. starters → mains → desserts)
- Each round creates a new KOT record
- Order history panel shows all rounds for the selected table
- History auto-refreshes when a new KOT is fired

### Requesting Bill
- Captain or cashier clicks **Request Bill** on an occupied table
- Table status changes to **Bill Requested** (red)
- Cashier can then process payment from POS Billing

### Checkout / Clearing Table
- After payment is processed, table returns to **Available** or **Cleaning** status

---

## Add / Edit / Delete Tables

Available to **Owner** and **Manager** only:

- **Add Table**: Label, section, capacity
- **Edit Table**: Modify label, section, capacity
- **Delete Table**: Removes table from floor plan (only if not occupied)

---

## Real-Time Updates

- Table status changes broadcast via Supabase Realtime
- KDS receives KOT updates in real-time
- Table cards update live without page refresh

---

## Offline Support

- KOT firing is queued offline if network is unavailable
- Queue syncs automatically when connectivity is restored
- `OfflineQueuePanel` shows pending operations

---

## Audit Logging

- Table seat / unseat events logged
- KOT fire events logged with items and amounts
- Bill void events logged

---

## Access

| Role | View Floor | Seat Table | Add/Edit/Delete Tables |
|---|:---:|:---:|:---:|
| Owner | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ |
| Cashier | ✅ | ✅ | ❌ |
| Captain | ✅ | ✅ | ❌ |
| Kitchen | ❌ | ❌ | ❌ |
| Accountant | ❌ | ❌ | ❌ |
