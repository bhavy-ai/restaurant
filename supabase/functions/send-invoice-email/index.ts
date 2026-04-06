import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    const { toEmail, restaurantName, invoiceNumber, billingMonth, billingPeriodStart, billingPeriodEnd, planName, planFee, overageOutlets, overageFee, subtotal, gstRate, gstAmount, totalAmount, status, generatedAt, issuedAt } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const fmt = (n: number) =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

    const fmtDate = (iso: string | null) =>
      iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

    const overageRow = overageFee > 0
      ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Outlet Overage (${overageOutlets} extra × ₹499)</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(overageFee)}</td></tr>`
      : "";

    const statusColor = status === "paid" ? "#059669" : status === "overdue" ? "#dc2626" : "#d97706";
    const statusLabel = status === "paid" ? "PAID" : status === "overdue" ? "OVERDUE" : "PAYMENT DUE";

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoiceNumber}</title></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:#111827;padding:32px 40px;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">RestroOS</h1>
      <p style="color:#9ca3af;margin:4px 0 0;font-size:13px;">Subscription Invoice</p>
    </div>
    <!-- Invoice Meta -->
    <div style="padding:32px 40px;border-bottom:1px solid #e5e7eb;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div>
          <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Invoice Number</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111827;font-family:monospace;">${invoiceNumber}</p>
        </div>
        <div style="text-align:right;">
          <span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${statusLabel}</span>
        </div>
      </div>
      <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <p style="margin:0;font-size:12px;color:#6b7280;">Restaurant</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${restaurantName}</p>
        </div>
        <div>
          <p style="margin:0;font-size:12px;color:#6b7280;">Billing Month</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${billingMonth}</p>
        </div>
        <div>
          <p style="margin:0;font-size:12px;color:#6b7280;">Billing Period</p>
          <p style="margin:4px 0 0;font-size:14px;color:#374151;">${fmtDate(billingPeriodStart)} – ${fmtDate(billingPeriodEnd)}</p>
        </div>
        <div>
          <p style="margin:0;font-size:12px;color:#6b7280;">Plan</p>
          <p style="margin:4px 0 0;font-size:14px;color:#374151;text-transform:capitalize;">${planName}</p>
        </div>
      </div>
    </div>
    <!-- Line Items -->
    <div style="padding:32px 40px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 16px;font-size:14px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Charges</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb;">Description</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-transform:capitalize;">${planName} Plan Fee</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;">${fmt(planFee)}</td>
          </tr>
          ${overageRow}
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Subtotal</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;">${fmt(subtotal)}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:8px 12px;border-bottom:2px solid #e5e7eb;color:#6b7280;">GST (${gstRate}%)</td>
            <td style="padding:8px 12px;border-bottom:2px solid #e5e7eb;text-align:right;color:#374151;">${fmt(gstAmount)}</td>
          </tr>
          <tr>
            <td style="padding:12px;font-weight:700;font-size:15px;color:#111827;">Total Due</td>
            <td style="padding:12px;text-align:right;font-weight:700;font-size:18px;color:#111827;">${fmt(totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Footer -->
    <div style="padding:24px 40px;background:#f9fafb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        This invoice was generated by RestroOS Platform on ${fmtDate(generatedAt ?? new Date().toISOString())}.<br>
        For billing queries, please contact your RestroOS account manager.
      </p>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [toEmail],
        subject: `Invoice ${invoiceNumber} — ${restaurantName} (${billingMonth})`,
        html: htmlBody,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result?.message ?? "Resend API error");

    return new Response(JSON.stringify({ success: true, emailId: result.id }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
