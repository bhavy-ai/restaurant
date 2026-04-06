# Offline Support & Error Handling

## Overview

RestroOS is designed to handle network interruptions gracefully. Critical operations are queued offline and synced when connectivity is restored.

---

## Offline Queue

**File**: `src/lib/offlineQueue.ts`

### How It Works

1. Before any critical operation (KOT fire, bill creation), an idempotency key is generated
2. If the network is offline, the operation is added to the offline queue
3. When connectivity is restored, queued operations are replayed in order
4. Idempotency keys prevent duplicate records if the same operation is retried

### Idempotency Keys

```typescript
generateIdempotencyKey() // Returns a unique key for each operation
```

Keys are stored with each queued operation to ensure exactly-once delivery.

### Queue Operations

- `offlineQueue.add(operation)` — Add operation to queue
- `offlineQueue.flush()` — Replay all queued operations
- `offlineQueue.clear()` — Clear the queue

### OfflineQueuePanel Component

`src/components/OfflineQueuePanel.tsx`

- Displays pending offline operations
- Shows count of queued items
- Manual flush trigger
- Visible in POS Billing, Table Management, and Inventory

---

## Network Status Detection

**File**: `src/hooks/useNetworkStatus.ts`

- Monitors `navigator.onLine`
- Listens to `online` / `offline` browser events
- Returns `{ isOnline, wasOffline }` state
- Used across POS, Table Management, and Inventory to show offline indicators

---

## Error Tracking

**File**: `src/lib/errorTracking.ts`

### `captureException(error, context)`

- Logs errors to `audit_logs` table with severity `critical`
- Context object includes component name and action
- Used throughout the app for non-fatal error capture

### Error Boundary

**File**: `src/components/ErrorBoundary.tsx`

- React Error Boundary wrapping the entire app
- Catches unhandled render errors
- Shows a user-friendly error screen
- Logs the error via `captureException`

---

## Audit Logging

**Service**: `auditService` in `src/lib/services/restaurantService.ts`

Every significant action is logged:

| Action | Severity |
|---|---|
| Bill created | Info |
| Bill voided | Warning |
| Discount applied | Info |
| Staff added | Info |
| Staff deactivated | Warning |
| Menu item deleted | Warning |
| Plan changed | Warning |
| KOT voided | Warning |
| Stock adjustment | Info |
| Login | Info |
| Failed login | Warning |

---

## Error States in UI

All data-fetching components handle three states:
1. **Loading** — Spinner with `Loader2` icon
2. **Error** — Alert banner with error message and retry button
3. **Empty** — Empty state illustration with action prompt

---

## Toast Notifications

Using **Sonner** toast library:
- `toast.success()` — Green toast for successful operations
- `toast.error()` — Red toast for failures
- `toast.warning()` — Amber toast for warnings
- Toasts auto-dismiss after 4 seconds
