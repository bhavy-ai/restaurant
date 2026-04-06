# Multi-Outlet Management

## Overview

The `/multi-outlet` page provides a cross-outlet comparison dashboard for restaurant owners and managers with multiple branches.

---

## Views

### Sales Comparison
- Revenue, orders, and average bill per outlet
- Growth percentage vs previous period
- Side-by-side bar chart comparison
- Low stock count per outlet

### Stock Comparison
- Ingredient stock levels across all outlets
- Highlights items below reorder level at each outlet
- Useful for central procurement decisions

### Staff Comparison
- Staff headcount per outlet
- Breakdown by role: Cashiers, Captains, Kitchen staff
- Active vs total staff count

---

## Date Range Filters

| Option | Description |
|---|---|
| Last 7 Days | Rolling 7-day window |
| Last 30 Days | Rolling 30-day window |
| Month to Date | Current calendar month |

---

## Outlet Metrics Cards

Each outlet shows:
- Outlet name and city
- Total revenue for period
- Total orders
- Average bill value
- Growth % vs previous period (with up/down arrow indicator)
- Low stock item count

---

## Charts

- Bar chart comparing revenue across outlets per time period
- Powered by Recharts with `Legend` for outlet identification

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
