# Menu Sync & Aggregator Orders

## Overview

RestroOS supports syncing the restaurant menu to third-party food delivery aggregators (Zomato, Swiggy) and managing incoming aggregator orders.

---

## Menu Sync (`/menu-sync`)

### Purpose
Keep the restaurant's menu on aggregator platforms in sync with the internal menu in RestroOS.

### Features
- View current menu items
- Select items to sync / exclude from aggregators
- Push menu updates to connected aggregator platforms
- Sync status per item (synced / pending / error)
- Last sync timestamp

### Supported Platforms
- Zomato
- Swiggy
- (Extensible via aggregator config)

### Configuration
- Aggregator API keys configured in Admin Panel → Integrations
- Per-outlet aggregator settings stored in `aggregator_config` table

---

## Aggregator Orders (`/aggregator-orders`)

### Purpose
Receive and manage orders coming in from Zomato, Swiggy, and other delivery platforms in a unified view.

### Features
- Unified order inbox for all aggregator platforms
- Platform badge per order (Zomato / Swiggy)
- Order status management (same lifecycle as Takeaway orders)
- Auto-routing to kitchen (KOT creation)
- Revenue tracking per platform

### Order Lifecycle
```
Received → Confirmed → Preparing → Ready → Dispatched → Delivered
```

### Integration
- Aggregator webhook receives orders
- Orders stored in `takeaway_orders` table with `order_type: 'aggregator'`
- Platform name stored in `aggregator` field

---

## Database

| Table | Purpose |
|---|---|
| `aggregator_config` | Per-outlet aggregator API credentials |
| `takeaway_orders` | Stores all takeaway, delivery, and aggregator orders |
