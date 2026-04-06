# Reports & Analytics

## Overview

The `/reports` page provides comprehensive sales analytics, GST reports, cashier performance, void analysis, and cross-restaurant comparisons.

---

## Report Tabs

### 1. Sales Report
- Daily revenue trend (bar chart)
- Orders per day (line chart)
- Summary cards: Total Revenue, Total Orders, Avg Bill Value, GST Collected
- Date range filter: Today / Last 7 Days / Last 30 Days

### 2. GST Report
- GST breakdown by tax rate (0%, 5%, 12%, 18%)
- Columns: Taxable Amount, CGST, SGST, Total GST, Gross Amount
- Exportable for GST filing

### 3. Cashier Report
- Per-cashier performance table
- Columns: Name, Bills Processed, Revenue, Voids, Avg Bill Value
- Identifies top performers and anomalies

### 4. Void Report
- All voided bills in the selected period
- Columns: Bill No, Cashier, Amount, Reason, Time
- Helps identify fraud or errors

### 5. Category Sales
- Revenue and order count by menu category
- Pie chart visualization
- Identifies best-selling categories

### 6. Cross-Restaurant Report
- Available when user has access to multiple restaurants
- Side-by-side comparison: Revenue, Orders, Avg Bill, GST
- Powered by `accessibleRestaurants` from AuthContext

---

## Date Range Options

| Option | Description |
|---|---|
| Today | Current day only |
| Last 7 Days | Rolling 7-day window |
| Last 30 Days | Rolling 30-day window |

---

## Charts

All charts powered by **Recharts**:
- `BarChart` — Sales by day, category revenue
- `LineChart` — Order trend over time
- `PieChart` — Payment mode distribution, category split

Chart colors: `#6366f1`, `#22c55e`, `#f59e0b`, `#ef4444`, `#8b5cf6`, `#06b6d4`

---

## Export

- GST report exportable (CSV / PDF)
- Download button available on GST tab

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ |
| Manager | ✅ |
| Cashier | ✅ |
| Captain | ❌ |
| Kitchen | ❌ |
| Accountant | ✅ |
