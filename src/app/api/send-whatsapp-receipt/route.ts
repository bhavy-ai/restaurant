import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, billNumber, items, subtotal, gstAmount, total, paymentMode, outletName, channel } = body;

    if (!to || !billNumber) {
      return NextResponse.json({ error: 'Missing required fields: to, billNumber' }, { status: 400 });
    }

    // Get Twilio config from Supabase
    const supabase = await createClient();
    const { data: config } = await supabase
      .from('notification_config')
      .select('account_sid, auth_token, from_number, whatsapp_number, enabled, send_receipt_whatsapp')
      .eq('outlet', 'koramangala')
      .eq('provider', 'twilio')
      .single();

    if (!config?.enabled) {
      return NextResponse.json({ error: 'WhatsApp receipts are disabled. Enable in Admin Panel → WhatsApp / SMS' }, { status: 400 });
    }

    const accountSid = config.account_sid;
    const authToken = config.auth_token;
    const fromNumber = config.send_receipt_whatsapp
      ? (config.whatsapp_number || 'whatsapp:+14155238886')
      : (config.from_number || '+15005550006');

    if (!accountSid || accountSid.startsWith('ACxxx') || !authToken || authToken === 'your_auth_token_here') {
      return NextResponse.json({ error: 'Twilio credentials are placeholder values. Update real credentials in Admin Panel → WhatsApp / SMS' }, { status: 400 });
    }

    // Format receipt message
    const itemLines = (items || []).slice(0, 8).map((item: any) =>
      `  ${item.qty}x ${item.name} — ₹${(item.price * item.qty).toLocaleString('en-IN')}`
    ).join('\n');

    const moreItems = (items || []).length > 8 ? `\n  ...and ${(items || []).length - 8} more items` : '';
    const itemSection = itemLines ? `\n*Items:*\n${itemLines}${moreItems}\n\n` : '\n';

    const message = `🧾 *Receipt from ${outletName || 'RestroOS'}*\n\nBill No: *${billNumber}*${itemSection}─────────────────\nSubtotal: ₹${Number(subtotal || 0).toLocaleString('en-IN')}\nGST: ₹${Number(gstAmount || 0).toLocaleString('en-IN')}\n*Total: ₹${Number(total || 0).toLocaleString('en-IN')}*\nPayment: ${(paymentMode || 'cash').toUpperCase()}\n─────────────────\n\nThank you for dining with us! 🙏`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const useWhatsApp = channel === 'whatsapp' || config.send_receipt_whatsapp;
    const toNumber = useWhatsApp ? `whatsapp:${to}` : to;

    const formData = new URLSearchParams({
      To: toNumber,
      From: fromNumber,
      Body: message,
    });

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio API error:', data);
      return NextResponse.json({ error: data.message || 'Failed to send receipt via Twilio' }, { status: response.status });
    }

    return NextResponse.json({ success: true, messageSid: data.sid, status: data.status });
  } catch (error: any) {
    console.error('Error sending WhatsApp receipt:', error);
    return NextResponse.json({ error: 'Internal server error: ' + error.message }, { status: 500 });
  }
}
