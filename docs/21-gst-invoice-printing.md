# GST Invoice & Printing

## Overview

RestroOS generates GST-compliant invoices for every bill. Invoices can be printed via thermal printers, downloaded as PDF, or sent via WhatsApp/email.

---

## GST Invoice Component

**File**: `src/components/GSTInvoice.tsx`

### Invoice Sections

1. **Header**
   - Restaurant name and logo
   - GSTIN
   - FSSAI license number
   - Address

2. **Bill Details**
   - Bill number
   - Date and time
   - Table number / order type
   - Cashier name
   - Number of covers

3. **Item Table**
   - Item name
   - HSN Code
   - Quantity
   - Unit price
   - GST rate
   - Amount

4. **Tax Summary**
   - Grouped by GST rate (0%, 5%, 12%, 18%)
   - Taxable amount per rate
   - CGST (50% of GST)
   - SGST (50% of GST)
   - Total GST

5. **Bill Summary**
   - Subtotal
   - Discount (if applied)
   - Total GST
   - **Grand Total**

6. **Payment Details**
   - Payment mode (Cash / UPI / Card / Split)
   - Amount tendered (for cash)
   - Change returned (for cash)

7. **Footer**
   - "Thank you for dining with us"
   - Restaurant website / social

---

## GST Calculation Logic

```typescript
function calcCart(cart, discountPct) {
  subtotal = sum(price × qty)
  discountAmt = subtotal × discountPct / 100
  taxable = subtotal - discountAmt

  // Per GST rate group:
  gst = taxable_base × rate / 100
  cgst = gst / 2
  sgst = gst / 2

  grandTotal = taxable + totalGst
}
```

---

## PDF Generation

**File**: `src/lib/generateInvoicePdf.ts`

- Client-side PDF generation
- `downloadInvoicePdf(invoiceData)` triggers browser download
- Used for subscription invoices in `/restaurant/billing`
- `InvoicePdfData` interface defines the data shape

---

## Thermal Printer Integration

**API**: `/api/print-kot/route.ts`

- Sends KOT data to configured thermal printer
- Printer config fetched from Admin Panel settings
- Supports 58mm and 80mm paper widths
- Network printer via IP:Port

---

## WhatsApp Receipt

**Edge Function**: `supabase/functions/send-whatsapp-receipt/index.ts`

- Sends formatted settlement summary via WhatsApp
- Uses Twilio WhatsApp API
- Triggered from Settlement Dashboard
- Message includes: shift summary, total bills, revenue breakdown

---

## Email Invoice

**Edge Function**: `supabase/functions/send-invoice-email/index.ts`

- Sends subscription invoice via email using Resend
- PDF attached to email
- Triggered from Superadmin → Invoices panel
