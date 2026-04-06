const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, billNumber, items, subtotal, gstAmount, total, paymentMode, outletName, channel } = await req.json();

    if (!to || !billNumber) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, billNumber' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format receipt message
    const itemLines = (items || []).slice(0, 8).map((item: any) =>
      `  ${item.qty}x ${item.name} — ₹${(item.price * item.qty).toLocaleString('en-IN')}`
    ).join('\n');

    const moreItems = (items || []).length > 8 ? `\n  ...and ${(items || []).length - 8} more items` : '';

    const message = `🧾 *Receipt from ${outletName || 'RestroOS'}*\n\nBill No: *${billNumber}*\n\n*Items:*\n${itemLines}${moreItems}\n\n─────────────────\nSubtotal: ₹${Number(subtotal).toLocaleString('en-IN')}\nGST: ₹${Number(gstAmount).toLocaleString('en-IN')}\n*Total: ₹${Number(total).toLocaleString('en-IN')}*\nPayment: ${(paymentMode || 'cash').toUpperCase()}\n─────────────────\n\nThank you for dining with us! 🙏`;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.warn('Twilio credentials not configured');
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    // Use WhatsApp or SMS channel
    const toNumber = channel === 'whatsapp' ? `whatsapp:${to}` : to;
    const fromNumber = channel === 'whatsapp' ? TWILIO_WHATSAPP_FROM : (Deno.env.get('TWILIO_PHONE_NUMBER') || TWILIO_WHATSAPP_FROM);

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
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio API error:', data);
      return new Response(JSON.stringify({ error: 'Failed to send receipt', details: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Receipt sent successfully:', data.sid);
    return new Response(JSON.stringify({ success: true, messageSid: data.sid, status: data.status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending receipt:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
