'use client';
import React, { useRef } from 'react';
import { X, Printer } from 'lucide-react';

interface GSTLineItem {
  name: string;
  hsnCode: string;
  qty: number;
  price: number;
  gstRate: number;
  isVeg: boolean;
}

interface GSTInvoiceProps {
  billNumber: string;
  billDate: string;
  tableLabel: string;
  covers: number;
  cashier: string;
  paymentMode: string;
  items: GSTLineItem[];
  discountPct: number;
  outletName?: string;
  outletAddress?: string;
  outletPhone?: string;
  outletGstin?: string;
  outletFssai?: string;
  onClose: () => void;
}

function calcInvoice(items: GSTLineItem[], discountPct: number) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const gstGroups: Record<number, { base: number; hsn: string }> = {};
  items.forEach((i) => {
    const base = i.price * i.qty * (1 - discountPct / 100);
    if (!gstGroups[i.gstRate]) gstGroups[i.gstRate] = { base: 0, hsn: i.hsnCode };
    gstGroups[i.gstRate].base += base;
  });
  let totalGst = 0;
  const gstBreakdown = Object.entries(gstGroups).map(([rate, { base, hsn }]) => {
    const rateNum = Number(rate);
    const gst = Math.round(base * rateNum / 100);
    totalGst += gst;
    return { rate: rateNum, base: Math.round(base), cgst: Math.round(gst / 2), sgst: Math.round(gst / 2), hsn };
  });
  const grandTotal = subtotal - discountAmt + totalGst;
  return { subtotal, discountAmt, gstBreakdown, totalGst, grandTotal };
}

export default function GSTInvoice({
  billNumber, billDate, tableLabel, covers, cashier, paymentMode,
  items, discountPct,
  outletName = 'Spice Garden — Koramangala',
  outletAddress = '42, 5th Cross, Koramangala 4th Block, Bengaluru — 560034',
  outletPhone = '+91 98765 43210',
  outletGstin = '29AABCS1429B1Z1',
  outletFssai = '11222333444455',
  onClose,
}: GSTInvoiceProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { subtotal, discountAmt, gstBreakdown, totalGst, grandTotal } = calcInvoice(items, discountPct);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Tax Invoice — ${billNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; background: #fff; }
            .invoice { max-width: 80mm; margin: 0 auto; padding: 8px; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .border-top { border-top: 1px dashed #000; margin: 4px 0; padding-top: 4px; }
            .border-bottom { border-bottom: 1px dashed #000; margin: 4px 0; padding-bottom: 4px; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; }
            .row-3 { display: grid; grid-template-columns: 1fr auto auto; gap: 4px; margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 2px 3px; text-align: left; font-size: 10px; }
            th { border-bottom: 1px solid #000; font-weight: bold; }
            .right { text-align: right; }
            .total-row { font-weight: bold; border-top: 1px solid #000; }
            h1 { font-size: 14px; }
            h2 { font-size: 11px; }
            .small { font-size: 9px; }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-base font-bold text-foreground">GST Tax Invoice</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-semibold transition-all"
            >
              <Printer size={13} />
              Print
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          <div ref={printRef} className="invoice bg-white text-black font-mono text-xs p-4 rounded-lg border border-gray-200 max-w-sm mx-auto">
            {/* Header */}
            <div className="center border-bottom">
              <h1 className="bold text-sm">{outletName}</h1>
              <p className="small">{outletAddress}</p>
              <p className="small">Ph: {outletPhone}</p>
              <p className="small">GSTIN: <span className="bold">{outletGstin}</span></p>
              <p className="small">FSSAI: {outletFssai}</p>
            </div>

            <div className="center border-bottom">
              <h2 className="bold">TAX INVOICE</h2>
            </div>

            {/* Bill Info */}
            <div className="border-bottom">
              <div className="row">
                <span>Bill No:</span>
                <span className="bold">{billNumber}</span>
              </div>
              <div className="row">
                <span>Date:</span>
                <span>{billDate}</span>
              </div>
              <div className="row">
                <span>Table:</span>
                <span>{tableLabel}</span>
              </div>
              <div className="row">
                <span>Covers:</span>
                <span>{covers}</span>
              </div>
              <div className="row">
                <span>Cashier:</span>
                <span>{cashier}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="border-bottom">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>HSN</th>
                    <th className="right">Qty</th>
                    <th className="right">Rate</th>
                    <th className="right">Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={`inv-item-${idx}`}>
                      <td>{item.name}</td>
                      <td>{item.hsnCode}</td>
                      <td className="right">{item.qty}</td>
                      <td className="right">₹{item.price}</td>
                      <td className="right">₹{item.price * item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-bottom">
              <div className="row">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              {discountAmt > 0 && (
                <div className="row">
                  <span>Discount ({discountPct}%)</span>
                  <span>-₹{discountAmt.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            {/* GST Breakdown */}
            <div className="border-bottom">
              <p className="bold" style={{ marginBottom: '3px' }}>GST Breakup:</p>
              <table>
                <thead>
                  <tr>
                    <th>HSN</th>
                    <th>Rate</th>
                    <th className="right">Taxable</th>
                    <th className="right">CGST</th>
                    <th className="right">SGST</th>
                  </tr>
                </thead>
                <tbody>
                  {gstBreakdown.map((g, idx) => (
                    <tr key={`gst-row-${idx}`}>
                      <td>{g.hsn}</td>
                      <td>{g.rate}%</td>
                      <td className="right">₹{g.base}</td>
                      <td className="right">₹{g.cgst}</td>
                      <td className="right">₹{g.sgst}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={2}>Total GST</td>
                    <td></td>
                    <td className="right">₹{gstBreakdown.reduce((s, g) => s + g.cgst, 0)}</td>
                    <td className="right">₹{gstBreakdown.reduce((s, g) => s + g.sgst, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Grand Total */}
            <div className="border-bottom">
              <div className="row bold" style={{ fontSize: '13px' }}>
                <span>GRAND TOTAL</span>
                <span>₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="row">
                <span>Payment Mode</span>
                <span className="bold">{paymentMode.toUpperCase()}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="center small">
              <p>This is a computer generated invoice</p>
              <p>Subject to Bengaluru jurisdiction</p>
              <p className="bold">Thank you for dining with us!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
