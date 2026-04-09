# Auth & Routing Hardening (7 Apr 2026)

## Why this was done

This hardening pass was implemented to remove implicit guest/demo behavior and enforce strict authentication routing.

Primary goals:
- If not logged in, always redirect to `/login`
- Remove guest/demo fallback identity from runtime auth state
- Ensure sidebar visibility matches real route permissions
- Prevent unauthorized users from seeing or entering protected modules
- Reduce runtime failures from stale Next.js chunks

---

## What changed

### 1) Removed forced root redirect

**File:** `next.config.mjs`

- Removed global redirect from `/` to `/table-management`
- Root routing is now decided by auth state in `src/app/page.tsx`

**Solved:**
- Logged-out users were being pushed into protected module routes before auth checks

---

### 2) Enforced login-first behavior in route guard

**File:** `src/components/RouteGuard.tsx`

- Added redirect to `/login` when no authenticated user exists
- Prevented guard content rendering while redirect is in progress
- Removed guest wording from access-restricted copy

**Solved:**
- Any unauthenticated access now consistently exits to login
- No guest-role language in restricted screens

---

### 3) Removed demo/owner fallback user in auth context

**File:** `src/contexts/AuthContext.tsx`

- Replaced staff profile lookup failure fallback from synthetic owner user to `staffUser = null`
- Updated comment language to avoid demo semantics

**Solved:**
- Missing staff profile no longer creates an artificial privileged identity
- Prevents accidental elevation to owner-like permissions

---

### 4) Hardened sidebar permission checks

**File:** `src/components/Sidebar.tsx`

- Replaced simple ID set with explicit nav-to-permission mapping (`navPermissionMap`)
- Added mappings for route-alias items:
  - `aggregator-orders -> takeaway`
  - `menu-sync -> admin-panel`
  - `restaurant-billing -> admin-panel`
- Updated account label fallback to neutral signed-in wording

**Solved:**
- Sidebar no longer leaks menu entries when item IDs differ from permission route IDs
- Navigation visibility now aligns with `RouteGuard` expectations

---

### 5) Protected restaurant billing route

**File:** `src/app/restaurant/billing/page.tsx`

- Wrapped page with `RouteGuard routeId="admin-panel"`
- Set `currentPath="/restaurant/billing"` on `AppLayout`

**Solved:**
- Billing page is now protected consistently with other owner/admin-only pages
- Sidebar active state works correctly for billing

---

### 6) Added one-time chunk reload recovery

**File:** `src/components/Providers.tsx`

- Added listener for `ChunkLoadError` / missing chunk scenarios
- Added one-time session-based reload guard (`restro_chunk_reload_once`)

**Solved:**
- Reduces app-break scenarios caused by stale client chunk references

---

### 7) Documentation wording cleanup

**File:** `src/app/admin-panel/components/AdminPanelClient.tsx`

- Updated comment text to remove demo-specific wording

**Solved:**
- Keeps code comments aligned with no-demo policy

---

## Final behavior after hardening

1. Unauthenticated users are redirected to `/login`
2. No guest/demo fallback identity is created in auth state
3. Protected pages and sidebar visibility now match the same permission model
4. Owner/admin-only paths are guarded consistently

---

## Verification checklist

- Open `/` while logged out -> redirects to `/login`
- Open any protected route while logged out -> redirects to `/login`
- Log in with limited role -> sidebar only shows allowed modules
- Attempt direct URL to restricted module -> access blocked by `RouteGuard`
- Open `/restaurant/billing` with non-admin role -> denied
- Trigger stale chunk scenario -> one-time reload recovery applies
