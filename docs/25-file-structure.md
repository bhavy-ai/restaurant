# Project File Structure

## Directory Overview

```
restroos/
├── public/
│   ├── assets/images/
│   │   ├── app_logo.png          # Application logo
│   │   └── no_image.png          # Fallback image
│   └── favicon.ico
│
├── src/
│   ├── app/                      # Next.js App Router pages
│   │   ├── page.tsx              # Root redirect
│   │   ├── layout.tsx            # Root layout with providers
│   │   ├── not-found.tsx         # 404 page
│   │   ├── login/page.tsx        # Login page
│   │   ├── onboard/page.tsx      # Restaurant onboarding wizard
│   │   │
│   │   ├── pos-billing/          # POS terminal
│   │   ├── kitchen-display-system/  # KDS
│   │   ├── table-management/     # Floor plan & table ops
│   │   ├── takeaway/             # Takeaway & delivery orders
│   │   ├── aggregator-orders/    # Zomato/Swiggy orders
│   │   │
│   │   ├── inventory-management/ # Stock tracking
│   │   ├── recipe-management/    # Recipe-ingredient mapping
│   │   ├── discounts/            # Discount & coupon rules
│   │   ├── customer-management/  # Customer profiles
│   │   │
│   │   ├── settlement-dashboard/ # Shift close & reconciliation
│   │   ├── reports/              # Analytics & reports
│   │   ├── multi-outlet/         # Cross-outlet comparison
│   │   │
│   │   ├── menu-sync/            # Aggregator menu sync
│   │   ├── admin-panel/          # Outlet configuration
│   │   ├── restaurant/billing/   # Subscription billing (owner view)
│   │   └── superadmin/           # Platform admin panel
│   │
│   ├── components/               # Shared components
│   │   ├── AppLayout.tsx         # Main app shell (sidebar + topbar)
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── Topbar.tsx            # Top navigation bar
│   │   ├── RouteGuard.tsx        # RBAC route protection
│   │   ├── GSTInvoice.tsx        # GST invoice renderer
│   │   ├── ShiftHandover.tsx     # Shift handover modal
│   │   ├── OfflineQueuePanel.tsx # Offline queue display
│   │   ├── ErrorBoundary.tsx     # React error boundary
│   │   ├── Providers.tsx         # Context providers wrapper
│   │   └── ui/
│   │       ├── AppImage.tsx      # Optimized image component
│   │       ├── AppIcon.tsx       # Icon component
│   │       └── AppLogo.tsx       # Logo component
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx       # Auth + RBAC + multi-tenant context
│   │
│   ├── hooks/
│   │   └── useNetworkStatus.ts   # Online/offline detection
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Supabase browser client
│   │   │   └── server.ts         # Supabase server client
│   │   ├── services/
│   │   │   ├── restaurantService.ts      # All DB service functions
│   │   │   └── paymentVerificationService.ts  # Payment verification
│   │   ├── offlineQueue.ts       # Offline operation queue
│   │   ├── errorTracking.ts      # Error capture utility
│   │   └── generateInvoicePdf.ts # PDF generation utility
│   │
│   ├── styles/
│   │   ├── index.css             # Global CSS (do not modify)
│   │   └── tailwind.css          # Tailwind directives
│   │
│   └── app/api/                  # Next.js API routes
│       ├── send-whatsapp-receipt/route.ts
│       ├── send-low-stock-sms/route.ts
│       ├── stripe/charge-subscription/route.ts
│       └── print-kot/route.ts
│
├── supabase/
│   ├── functions/                # Supabase Edge Functions
│   │   ├── send-whatsapp-receipt/
│   │   ├── send-invoice-email/
│   │   ├── stripe-webhook/
│   │   ├── create-settlement-payment-intent/
│   │   └── poll-stripe-payment/
│   └── migrations/               # Database migration files
│
├── .env                          # Environment variables
├── next.config.mjs               # Next.js configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json                  # Dependencies
```

---

## Key Service Functions (`restaurantService.ts`)

| Service | Functions |
|---|---|
| `menuService` | `getAll()`, `create()`, `update()`, `delete()`, `toggleAvailability()` |
| `tableService` | `getAll()`, `create()`, `update()`, `delete()`, `updateStatus()` |
| `billService` | `create()`, `getByShift()`, `void()`, `getHistory()` |
| `kotService` | `create()`, `getActive()`, `updateStatus()`, `void()` |
| `inventoryService` | `getAll()`, `adjust()`, `create()`, `update()` |
| `staffService` | `getAll()`, `create()`, `update()`, `deactivate()` |
| `shiftService` | `getCurrent()`, `open()`, `close()` |
| `auditService` | `log(action, entity, details, severity)` |
| `gstService` | `getConfig()`, `update()` |
| `printerService` | `getAll()`, `create()`, `update()`, `delete()` |
| `aggregatorService` | `getConfig()`, `update()` |
| `outletSettingsService` | `get()`, `update()` |
