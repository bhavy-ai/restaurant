# Restaurant Onboarding Flows Comparison

## Overview

There are **TWO ways** to add a restaurant to your RestroOS platform:

1. **Self-Serve Onboarding** (`/onboard`) - User creates their own account + restaurant
2. **Superadmin Restaurant Add** (`/superadmin` → Add Restaurant modal) - Superadmin creates restaurant for a user

---

## ✅ Flow 1: Self-Serve Onboarding (`/onboard/page.tsx`)

### Purpose
- For new restaurant owners who don't yet have an account
- Walks through creating account → restaurant → outlet → access mapping

### Step-by-Step Process

#### **Step 0: Authentication Gate**
- If user already has a restaurant, automatically redirects to `/table-management`
- If user is superadmin, redirects to `/superadmin`
- Prevents setup menu flicker with `routeChecking` state

#### **Step 1: Auth (Sign Up or Sign In)**
```
User Input:
├── Full Name (for new users only)
├── Email
└── Password

Action:
└── Call signUp() or signIn() → Auth user created in auth.users table
```

#### **Step 2: Restaurant Info** 
```
User Input:
├── Restaurant Name  (required)
├── Cuisine Type     (required)
├── GSTIN           (optional)
├── FSSAI           (optional)
├── Phone           (optional)
└── Website         (optional)
```

#### **Step 3: Location Details**
```
User Input:
├── Street Address  (required)
├── City            (required)
├── State           (optional)
├── Pincode         (optional)
└── Seating Capacity (optional)
```

#### **Step 4: First Outlet**
```
User Input:
├── Outlet Name      (defaults to restaurant name)
├── Outlet Address   (optional, defaults to restaurant address)
└── Outlet Phone     (optional, defaults to restaurant phone)
```

#### **Step 5: Data Creation** (all in `handleSubmit()`)

**5a. Create Restaurant row:**
```typescript
INSERT INTO restaurants {
  name: data.restaurantName,
  slug: auto-generated-unique,
  gstin: data.gstin,
  fssai: data.fssai,
  phone: data.phone,
  website: data.website,
  address: data.address,
  city: data.city,
  state: data.state,
  pincode: data.pincode,
  cuisine_type: data.cuisineType,
  seating_capacity: data.seatingCapacity,
  plan: 'starter' ← FORCED for self-serve,
  is_active: true,
  owner_user_id: currentUser.id,           ← Set to logged-in user
  created_by_user_id: currentUser.id,      ← Set to logged-in user
  onboarding_status: 'completed',
  onboarding_completed_at: now(),
}
```

**5b. Create First Outlet:**
```typescript
INSERT INTO outlets {
  restaurant_id: restaurant.id,
  name: data.outletName,
  slug: auto-generated,
  address: data.outletAddress,
  phone: data.outletPhone,
  is_active: true,
}
```

**5c. Grant Owner Access (CRITICAL):**
```typescript
INSERT INTO user_restaurant_access {
  user_id: currentUser.id,                 ← Direct link to auth user
  restaurant_id: restaurant.id,
  outlet_id: outlet.id,                    ← Filled immediately
  role: 'owner',
  is_active: true,
}
← If this fails, entire onboarding fails (error check added)
```

#### **Step 6: Redirect**
- User redirected to `/pos-billing` → Ready to use the app

### Data State After Onboarding

| Table | Field | Value | Why |
|-------|-------|-------|-----|
| `restaurants` | `owner_user_id` | ✅ Set | User ID of creator |
| `restaurants` | `created_by_user_id` | ✅ Set | User ID of creator |
| `restaurants` | `plan` | `starter` | Forced for self-serve |
| `restaurants` | `onboarding_status` | `completed` | Ready to use |
| `outlets` | `name` | Auto | First branch created |
| `user_restaurant_access` | `outlet_id` | ✅ Filled | User can access this outlet |
| `user_restaurant_access` | `role` | `owner` | Full permissions |

---

## 🔧 Flow 2: Superadmin Restaurant Add (`/superadmin → Add Restaurant Modal`)

### Purpose
- For superadmins to manually create restaurants for partners
- Useful when initial onboarding plan needs to be different from 'starter'
- Allows pre-configuring restaurants

### Step-by-Step Process

#### **Step 0: Permission Check**
- Only accessible if user has `platform_superadmins` entry with `is_active: true`

#### **Step 1: Modal Opens with Form Fields**

**Section A: Restaurant Info**
```
Superadmin Input:
├── Restaurant Name      (required)
├── Phone               (optional)
├── Cuisine Type        (optional)
├── GSTIN               (optional)
├── FSSAI License       (optional)
└── Website             (optional)
```

**Section B: Owner Details**
```
Superadmin Input:
├── Owner Full Name     (required) ← Collected but NOT USED
└── Owner Email         (required) ← Collected but NOT USED
```
⚠️ **Important:** These fields are collected in the UI but are currently **NOT processed** in the backend!

**Section C: Location**
```
Superadmin Input:
├── Street Address
├── City                (required)
├── State
├── Pincode
└── Seating Capacity
```

**Section D: Plan & Status**
```
Superadmin Input:
├── Subscription Plan   (required, default: 'starter')
│   Options: starter, growth, enterprise
└── Onboarding Status   (required, default: 'active')
    Options: active, trial, pending, suspended
```

**Section E: First Outlet**
```
Superadmin Input:
├── Outlet Name         (optional, defaults to 'Main Branch')
├── Outlet Address      (optional)
└── Outlet Phone        (optional)
```

#### **Step 2: Data Creation** (all in `handleAddRestaurant()`)

**2a. Create Restaurant row:**
```typescript
INSERT INTO restaurants {
  name: addData.name,
  slug: auto-generated-unique,
  phone: addData.phone,
  cuisine_type: addData.cuisineType,
  gstin: addData.gstin,
  fssai: addData.fssai,
  website: addData.website,
  address: addData.address,
  city: addData.city,
  state: addData.state,
  pincode: addData.pincode,
  seating_capacity: addData.seatingCapacity,
  plan: addData.plan,                   ← Superadmin chooses
  is_active: true,
  onboarding_status: addData.onboardingStatus,
  
  owner_user_id: NULL,                  ← NOT SET ❌
  created_by_user_id: NULL,             ← NOT SET ❌
}
```

**2b. Create First Outlet:**
```typescript
INSERT INTO outlets {
  restaurant_id: rest.id,
  name: addData.outletName || 'Main Branch',
  slug: 'main',
  address: addData.outletAddress || addData.address || addData.city,
  phone: addData.outletPhone || addData.phone,
  is_active: true,
}
```

**2c. Create Owner Access (NOT DONE) ❌**
```
/* Owner email is collected but nothing happens with it:
   - No lookup of auth.users by email
   - No user_restaurant_access insert
   - No owner_user_id / created_by_user_id mapping
*/
```

**2d. Log Audit:**
```typescript
INSERT INTO audit_logs {
  action: 'restaurant_created',
  entity: 'restaurant',
  details: `New restaurant "${addData.name}" (id: ${rest.id}) created with plan "${addData.plan}"`,
  superadmin_id: superadminId,
  ...
}
```

#### **Step 3: Complete**
- Modal closes
- Restaurant list refreshed
- Restaurant now appears in superadmin list

### Data State After Superadmin Restaurant Add

| Table | Field | Value | Why |
|-------|-------|-------|-----|
| `restaurants` | `owner_user_id` | ❌ NULL | Not set by superadmin |
| `restaurants` | `created_by_user_id` | ❌ NULL | Not set by superadmin |
| `restaurants` | `plan` | ✅ Chosen | Superadmin selected |
| `restaurants` | `onboarding_status` | ✅ Chosen | Superadmin selected |
| `outlets` | `name` | ✅ Created | Main|Custom name |
| `user_restaurant_access` | — | ❌ NOT CREATED | No owner mapping |

---

## ⚠️ Key Differences Summary

| Aspect | Self-Serve Onboarding | Superadmin Add | Impact |
|--------|----------------------|-----------------|--------|
| **Who Creates** | End user | Platform superadmin | User must sign up vs admin creates |
| **Auth User** | ✅ Created | — | Owner has login access |
| **owner_user_id** | ✅ Set | ❌ NULL | Owner resolvable vs not |
| **created_by_user_id** | ✅ Set | ❌ NULL | Audit trail vs not |
| **Plan Choice** | 🔒 Forced 'starter' | ✅ Any plan | Flexibility controlled |
| **Onboarding Status** | 🔒 'completed' | ✅ Any status | Ready-to-use vs configurable |
| **user_restaurant_access** | ✅ Created with outlet_id | ❌ NOT created | Owner can login vs can't |
| **First Outlet** | ✅ Created | ✅ Created | Both have initial outlet |
| **Audit Trail** | — | ✅ Logged | Superadmin actions tracked |

---

## 🚨 Current Issues & Workarounds

### Issue 1: Superadmin Can't Map Owner

**Problem:**
- Superadmin collects `ownerEmail` and `ownerName` but doesn't create `user_restaurant_access`
- Restaurant has no `owner_user_id` set
- Even if owner later signs up, they won't see the restaurant because no access row exists

**Current Workaround:**
- AuthContext backfill: If user signs in as staff (outlet-based), auth automatically creates the missing `user_restaurant_access` row (lines 225–249 in AuthContext.tsx)
- Owner accounts can be resolved via direct `owner_user_id` link if set (lines 157–188 in AuthContext.tsx)

**Would Need:**
- Email → `auth.users.id` lookup in Supabase
- After restaurant insert, query auth.users for ownerEmail and set owner_user_id
- Create user_restaurant_access row with outlet_id

### Issue 2: Onboarding Error Handling

**Problem:**
- If `user_restaurant_access` insert fails, old code silently continued
- User ends up with a restaurant but no access mapping → can't log back in

**Fixed:**
- Onboarding now checks insert error and throws if it fails (line 235 in onboard/page.tsx)
- Entire onboarding fails rather than creating orphaned restaurants

---

## 📊 Authentication Bootstrap Flow (After Either Path)

When user logs in, `AuthContext.tsx` runs this flow:

```
Login successful
    ↓
Load restaurants via loadRestaurants(userId, isSuperadmin, staffOutlet, staffRole)
    ↓
Try: user_restaurant_access WHERE user_id=userId
    └─ If found: Load restaurants from access rows
              ↓
              Check outlet_id (may be NULL or filled)
Try: restaurants WHERE owner_user_id=userId
    └─ If found: User owns these restaurants
              ↓
              Backfill: Create user_restaurant_access with outlet_id
Try: restaurants WHERE created_by_user_id=userId
    └─ If found: User created these restaurants
              ↓
              Backfill: Create user_restaurant_access with outlet_id
Try: staff_users WHERE email=userEmail (using outlet slug)
    └─ If found: User is staff at this outlet
              ↓
              Backfill: Create user_restaurant_access with outlet_id
```

**Result:** User sees their restaurant + gets automatic access row repair ✅

---

## 🎯 Best Practices

### When to Use Self-Serve Onboarding
- ✅ Restaurant owners signing up for first time
- ✅ Want them to control all setup details
- ✅ Guaranteed complete data entry
- ✅ Automatic owner_user_id and access mapping

### When to Use Superadmin Add
- ✅ Pre-creating restaurants for known partners
- ✅ Manually adjusting plans/status before handoff
- ✅ Setting up trials or demo accounts
- ✅ Bulk partner onboarding with different plans
- ⚠️ **Note:** Must manually ensure owner access mapping afterward

### Recommended Workflow for Superadmin Creates:
```
1. Admin: Create restaurant via "Add Restaurant" modal
2. Admin: Share login credentials with owner separately
3. Owner: Log in with provided credentials
4. System: AuthContext detects staff outlet and backfills access
5. Owner: Can see and use restaurant normally
```

---

## 📝 Database Schema Reference

### restaurants table
```sql
CREATE TABLE restaurants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan VARCHAR DEFAULT 'starter',
  is_active BOOLEAN DEFAULT true,
  owner_user_id UUID REFERENCES auth.users(id),  -- Sets on onboarding
  created_by_user_id UUID REFERENCES auth.users(id), -- Sets on onboarding
  onboarding_status VARCHAR,
  onboarding_completed_at TIMESTAMP,
  ...other fields...
);
```

### outlets table
```sql
CREATE TABLE outlets (
  id UUID PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  name TEXT,
  slug TEXT,
  is_active BOOLEAN DEFAULT true,
  ...other fields...
);
```

### user_restaurant_access table
```sql
CREATE TABLE user_restaurant_access (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  outlet_id UUID REFERENCES outlets(id),  -- Can be NULL for multi-outlet access
  role VARCHAR,  -- 'owner', 'manager', 'cashier', etc.
  is_active BOOLEAN DEFAULT true,
  ...
);
```

---

## 🔍 How to Verify a Restaurant's Origin

```sql
-- Check if restaurant was created via onboarding
SELECT id, name, owner_user_id, created_by_user_id, onboarding_status
FROM restaurants
WHERE id = 'restaurant-uuid';

-- If owner_user_id is SET → Created via onboarding or manually mapped
-- If owner_user_id is NULL → Created via superadmin without mapping
-- onboarding_status='completed' → Self-serve onboarding
-- onboarding_status='active'|'pending'|etc → Superadmin created

-- Check access mapping
SELECT user_id, restaurant_id, outlet_id, role
FROM user_restaurant_access
WHERE restaurant_id = 'restaurant-uuid';
```

