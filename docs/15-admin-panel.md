# Admin Panel

## Overview

The `/admin-panel` page is the restaurant owner's configuration hub. It covers outlet settings, menu management, staff management, GST configuration, printer setup, third-party integrations, notifications, and audit logs.

---

## Admin Sections

### 1. Outlet Settings
- Restaurant name, address, phone, website
- GSTIN and FSSAI license
- Cuisine type, seating capacity
- Operating hours
- Logo upload

### 2. Menu Management
- Add / Edit / Delete menu items
- Fields: Name, Category, Price, GST Rate, HSN Code, Veg/Non-Veg, Available toggle
- Category management
- Bulk availability toggle

### 3. Staff Management
- Add / Edit / Deactivate staff users
- Fields: Name, Email, Phone, Role, Outlet assignment
- Role assignment from: owner, manager, cashier, captain, kitchen, accountant
- View last login timestamp
- Permission override per user

### 4. GST Configuration
- GSTIN
- Legal Name
- Trade Name
- Registration Type
- Enable/disable specific GST rates: 0%, 5%, 12%, 18%

### 5. Printer Configuration
- Add / Edit / Delete printer configs
- Fields: Printer Name, Type (thermal/network), IP Address, Port, Paper Width
- Test print functionality
- Supports multiple printers (KOT printer, bill printer, etc.)

### 6. Third-Party Integrations
- Aggregator platform connections (Zomato, Swiggy)
- API key management
- Enable/disable per integration
- Connection status indicator

### 7. Notifications
- Configure SMS alert recipients (Twilio)
- Low-stock alert thresholds
- Shift summary notification settings
- WhatsApp notification toggle

### 8. Audit Logs
- Full audit trail of all actions in the outlet
- Columns: Timestamp, User, Role, Action, Entity, Details, IP, Severity
- Severity levels: Info, Warning, Critical
- Filter by date range, user, severity
- Export audit log (CSV)

---

## Access

| Role | Access |
|---|---|
| Owner | ✅ (full) |
| Manager | ❌ |
| Cashier | ❌ |
| Captain | ❌ |
| Kitchen | ❌ |
| Accountant | ❌ |

> Admin Panel is exclusively for the **Owner** role.
