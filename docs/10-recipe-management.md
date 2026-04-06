# Recipe Management

## Overview

The `/recipe-management` page maps menu items to their ingredient requirements. This mapping drives automatic stock deduction whenever a menu item is sold.

---

## How Recipes Work

Each recipe entry links:
- A **menu item** (from `menu_items` table)
- An **ingredient** (from `ingredients` table)
- A **quantity used** per serving

A single menu item can have multiple recipe entries (one per ingredient).

**Example:**
```
Butter Chicken (menu item)
  → Chicken Breast: 200g
  → Butter: 30g
  → Cream: 50ml
  → Tomato Puree: 100g
```

---

## Auto Stock Deduction Flow

1. Customer orders "Butter Chicken × 2"
2. POS Billing / Takeaway calls `deductRecipeStockForCart()`
3. System fetches recipes for `Butter Chicken`
4. Multiplies quantities by order qty (2)
5. Deducts from `ingredients.current_stock`:
   - Chicken Breast: −400g
   - Butter: −60g
   - Cream: −100ml
   - Tomato Puree: −200g

---

## Recipe CRUD

- **Add Recipe**: Select menu item, add ingredient rows with quantities
- **Edit Recipe**: Modify ingredient quantities or add/remove ingredients
- **Delete Recipe**: Remove the recipe mapping

---

## Database Tables

| Table | Purpose |
|---|---|
| `recipes` | Maps `menu_item_id` → `ingredient_id` + `quantity_used` |
| `menu_items` | Source of menu items |
| `ingredients` | Source of ingredients with current stock |

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
