# Onboarding

## Overview

The `/onboard` page is a **self-serve restaurant registration wizard** that allows new restaurant owners to set up their account and first outlet without any superadmin involvement.

---

## Flow

### Step 0 — Authentication Gate
If the user is not logged in, they see an auth form first:
- **Sign Up**: Name, email, password → creates Supabase auth account
- **Sign In**: Email, password → logs into existing account
- After auth, proceeds to Step 1

### Step 1 — Restaurant Info
Required fields:
- Restaurant Name *(required)*
- Cuisine Type *(required)* — dropdown with 11 options
- GSTIN *(optional)*
- FSSAI License Number *(optional)*
- Phone *(optional)*
- Website *(optional)*

### Step 2 — Location
Required fields:
- Address *(required)*
- City *(required)*
- State *(optional)*
- Pincode *(optional)*
- Seating Capacity *(optional)*

### Step 3 — First Outlet
Required fields:
- Outlet Name *(required)*
- Outlet Address *(optional, defaults to restaurant address)*
- Outlet Phone *(optional)*

---

## What Gets Created on Submit

1. **`restaurants` record**
   - `plan: 'starter'` (all self-serve onboarding starts on Starter)
   - `is_active: true`
   - `owner_user_id`: current auth user
   - `onboarding_status: 'completed'`
   - `onboarding_completed_at`: timestamp

2. **`outlets` record**
   - Linked to the new restaurant via `restaurant_id`
   - `is_active: true`

3. **`user_restaurant_access` record**
   - Maps the owner user to the new restaurant + outlet
   - `role: 'owner'`
   - `is_active: true`

4. **Redirect** → `/pos-billing`

---

## Cuisine Types Available

- North Indian
- South Indian
- Chinese
- Italian
- Continental
- Fast Food
- Cafe / Bakery
- Seafood
- Mughlai
- Multi-Cuisine
- Other

---

## Validation Rules

| Step | Required | Validation |
|---|---|---|
| Auth | Email, Password | Min 6 chars password |
| Step 1 | Restaurant Name, Cuisine Type | Non-empty |
| Step 2 | Address, City | Non-empty |
| Step 3 | Outlet Name | Non-empty |

---

## Error Handling

- Auth errors shown inline below the form
- Submission errors shown as an alert banner above the submit button
- All Supabase errors are caught and displayed with human-readable messages
