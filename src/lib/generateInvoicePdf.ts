import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface InvoicePdfData {
  invoiceNumber: string;
  restaurantName: string;
  restaurantCity?: string;
  billingMonth: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  planName: string;
  planFee: number;
  outletCount: number;
  totalBills: number;
  totalRevenue: number;
  overageOutlets: number;
  overageFee: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  status: string;
  generatedAt: string | null;
  issuedAt: string | null;
  paidAt: string | null;
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

export function generateInvoicePdf(data: InvoicePdfData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;

  // ── Header background ──────────────────────────────────────────────────────
  doc.setFillColor(17, 24, 39); // #111827
  doc.rect(0, 0, pageW, 42, 'F');

  // Brand name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('RestroOS', margin, 18);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175); // #9ca3af
  doc.text('Subscription Invoice', margin, 26);

  // Invoice number (right-aligned in header)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(data.invoiceNumber, pageW - margin, 18, { align: 'right' });

  // Status badge
  const statusLabel =
    data.status === 'paid' ? 'PAID' : data.status === 'overdue' ? 'OVERDUE' : 'PAYMENT DUE';
  const statusR = data.status === 'paid' ? 5 : data.status === 'overdue' ? 220 : 217;
  const statusG = data.status === 'paid' ? 150 : data.status === 'overdue' ? 38 : 119;
  const statusB = data.status === 'paid' ? 105 : data.status === 'overdue' ? 38 : 6;
  doc.setFillColor(statusR, statusG, statusB);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(statusLabel) + 8;
  doc.roundedRect(pageW - margin - badgeW, 21, badgeW, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, pageW - margin - badgeW / 2, 26, { align: 'center' });

  // ── Meta section ───────────────────────────────────────────────────────────
  let y = 52;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128); // #6b7280

  const metaItems = [
    ['Restaurant', data.restaurantName + (data.restaurantCity ? `, ${data.restaurantCity}` : '')],
    ['Billing Month', data.billingMonth],
    ['Billing Period', `${fmtDate(data.billingPeriodStart)} – ${fmtDate(data.billingPeriodEnd)}`],
    ['Plan', data.planName.charAt(0).toUpperCase() + data.planName.slice(1)],
    ['Generated', fmtDate(data.generatedAt)],
    ...(data.issuedAt ? [['Issued', fmtDate(data.issuedAt)]] : []),
    ...(data.paidAt ? [['Paid', fmtDate(data.paidAt)]] : []),
  ];

  const colW = (pageW - margin * 2) / 2;
  metaItems.forEach((item, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = margin + col * colW;
    const rowY = y + row * 14;
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(item[0], x, rowY);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(item[1], x, rowY + 5);
  });

  y += Math.ceil(metaItems.length / 2) * 14 + 8;

  // Divider
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Charges table ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text('CHARGES', margin, y);
  y += 4;

  const tableRows: (string | number)[][] = [
    [
      `${data.planName.charAt(0).toUpperCase() + data.planName.slice(1)} Plan Fee`,
      fmtINR(data.planFee),
    ],
  ];

  if (data.overageFee > 0) {
    tableRows.push([
      `Outlet Overage (${data.overageOutlets} extra × ₹499)`,
      fmtINR(data.overageFee),
    ]);
  }

  tableRows.push(
    ['Subtotal', fmtINR(data.subtotal)],
    [`GST (${data.gstRate}%)`, fmtINR(data.gstAmount)],
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Description', 'Amount']],
    body: tableRows,
    foot: [['Total Due', fmtINR(data.totalAmount)]],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: [107, 114, 128],
      fontStyle: 'bold',
      lineColor: [229, 231, 235],
      lineWidth: 0.3,
    },
    bodyStyles: {
      textColor: [55, 65, 81],
      lineColor: [229, 231, 235],
      lineWidth: 0.3,
    },
    footStyles: {
      fillColor: [17, 24, 39],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 11,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 40 },
    },
  });

  const afterTable = (doc as any).lastAutoTable?.finalY ?? y + 60;
  y = afterTable + 10;

  // ── Usage summary ──────────────────────────────────────────────────────────
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, pageW - margin * 2, 22, 3, 3, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(margin, y, pageW - margin * 2, 22, 3, 3, 'S');

  const usageItems = [
    { label: 'Outlets', value: data.outletCount.toString() },
    { label: 'Total Bills', value: data.totalBills.toLocaleString('en-IN') },
    { label: 'Restaurant Revenue', value: fmtINR(data.totalRevenue) },
  ];

  const usageW = (pageW - margin * 2) / usageItems.length;
  usageItems.forEach((item, idx) => {
    const x = margin + idx * usageW + usageW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(item.label, x, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(item.value, x, y + 15, { align: 'center' });
  });

  y += 30;

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 14;
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Generated by RestroOS Platform · ${new Date().toLocaleDateString('en-IN')}`,
    pageW / 2,
    footerY,
    { align: 'center' },
  );

  return doc;
}

export function downloadInvoicePdf(data: InvoicePdfData): void {
  const doc = generateInvoicePdf(data);
  doc.save(`${data.invoiceNumber}.pdf`);
}

export async function invoicePdfToBase64(data: InvoicePdfData): Promise<string> {
  const doc = generateInvoicePdf(data);
  return doc.output('datauristring').split(',')[1];
}
