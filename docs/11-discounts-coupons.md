# Discounts & Coupons

## Overview

The `/discounts` page allows owners and managers to create and manage discount rules, coupon codes, and happy-hour pricing.

---

## Discount Types

| Type | Description |
|---|---|
| Percent | Percentage off the bill (e.g. 10%) |
| Flat | Fixed amount off (e.g. ₹50 off) |

---

## Discount Fields

| Field | Description |
|---|---|
| Name | Display name for the discount |
| Type | Percent or Flat |
| Value | Discount amount / percentage |
| Code | Coupon code (optional, for code-based discounts) |
| Min Order Value | Minimum bill amount to apply discount |
| Max Discount Value | Cap on discount amount (for percent discounts) |
| Applies To | `bill` (whole bill) or specific categories |
| Happy Hour Start | Start time for time-based discounts |
| Happy Hour End | End time for time-based discounts |
| Happy Hour Days | Days of week the discount is active |
| Usage Limit | Maximum number of times discount can be used |
| Usage Count | Current usage count (auto-tracked) |
| Valid From | Start date |
| Valid Until | Expiry date |
| Active | Enable / disable toggle |

---

## Happy Hour Discounts

- Set specific time windows (e.g. 3 PM – 6 PM)
- Select active days (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Automatically applies during the configured window

---

## Coupon Codes

- Optional `code` field enables coupon-code-based redemption
- Cashier enters the code at POS to apply the discount
- Usage count tracked and enforced against usage limit

---

## Discount Application in POS

- Discounts are applied at the cart level in POS Billing
- Discount percentage reduces the taxable base before GST calculation
- Applied discount amount shown on the GST invoice

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
