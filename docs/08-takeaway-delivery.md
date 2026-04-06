# Takeaway & Delivery

## Overview

The `/takeaway` page manages walk-in takeaway orders and delivery orders, including aggregator-sourced orders (Zomato, Swiggy).

---

## Order Types

| Type | Description |
|---|---|
| Takeaway | Customer picks up in person |
| Delivery | Order delivered to customer address |
| Aggregator | Order received from Zomato / Swiggy / other platforms |

---

## Order Lifecycle

```
Pending → Confirmed → Preparing → Ready → Dispatched → Delivered
                                                    ↘ Cancelled (any stage)
```

| Status | Color | Next Action |
|---|---|---|
| Pending | Amber | Confirm |
| Confirmed | Blue | Start Preparing |
| Preparing | Purple | Mark Ready |
| Ready | Green | Dispatch |
| Dispatched | Primary | Mark Delivered |
| Delivered | Green | (terminal) |
| Cancelled | Red | (terminal) |

---

## Order Form Fields

When creating a new takeaway/delivery order:
- Order Type (Takeaway / Delivery / Aggregator)
- Customer Name
- Customer Phone
- Delivery Address *(for delivery orders)*
- Items (name, quantity, price — multiple line items)
- Payment Mode (Cash / UPI / Card / Online)
- Estimated Time (minutes)
- Notes

---

## Aggregator Orders

- Aggregator field captures the platform name (Zomato, Swiggy, etc.)
- Aggregator orders can also be managed from `/aggregator-orders` for a dedicated view

---

## Recipe-Based Stock Deduction

When a takeaway/delivery order is placed:
1. Menu items are looked up by name in `menu_items`
2. Recipes for those items are fetched from `recipes`
3. Ingredient stock is automatically deducted from `ingredients`

---

## GST & Pricing

- Subtotal, GST amount, discount amount, and total are tracked per order
- GST calculated based on item-level rates

---

## Rider Assignment

- Delivery orders can have a rider assigned
- Rider name stored on the order record

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
