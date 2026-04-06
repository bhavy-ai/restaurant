import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, outlet = 'koramangala' } = body as {
      items: Array<{ name: string; currentStock: number; reorderLevel: number; unit: string; status: string }>;
      outlet?: string;
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get Twilio config
    const { data: config } = await supabase
      .from('notification_config')
      .select('*')
      .eq('outlet', outlet)
      .eq('provider', 'twilio')
      .single();

    if (!config?.enabled) {
      return NextResponse.json({ success: false, message: 'SMS notifications disabled' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID || config.account_sid;
    const authToken = process.env.TWILIO_AUTH_TOKEN || config.auth_token;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || config.from_number;

    if (!accountSid || !authToken || !fromNumber || accountSid.startsWith('AC') === false) {
      return NextResponse.json({ success: false, message: 'Twilio credentials not configured' });
    }

    // Build SMS message
    const criticalItems = items.filter((i) => i.status === 'critical');
    const lowItems = items.filter((i) => i.status === 'low');

    let message = `🚨 RestroOS Low Stock Alert — ${outlet}\n\n`;
    if (criticalItems.length > 0) {
      message += `CRITICAL (${criticalItems.length}):\n`;
      criticalItems.forEach((i) => {
        message += `• ${i.name}: ${i.currentStock}${i.unit} (reorder: ${i.reorderLevel}${i.unit})\n`;
      });
    }
    if (lowItems.length > 0) {
      message += `\nLOW STOCK (${lowItems.length}):\n`;
      lowItems.forEach((i) => {
        message += `• ${i.name}: ${i.currentStock}${i.unit} (reorder: ${i.reorderLevel}${i.unit})\n`;
      });
    }
    message += `\nPlease reorder immediately.`;

    // Get manager phone from staff_users
    const { data: managers } = await supabase
      .from('staff_users')
      .select('name, phone')
      .eq('outlet', outlet)
      .in('role', ['owner', 'manager'])
      .eq('status', 'active')
      .not('phone', 'is', null);

    const recipients = managers?.filter((m: any) => m.phone) || [];

    if (recipients.length === 0) {
      // Log alert even if no recipients
      await supabase.from('low_stock_alerts').insert(
        items.map((i) => ({
          outlet,
          item_name: i.name,
          current_stock: i.currentStock,
          reorder_level: i.reorderLevel,
          unit: i.unit,
          alert_type: i.status,
          sms_sent: false,
        }))
      );
      return NextResponse.json({ success: false, message: 'No manager phone numbers configured' });
    }

    // Send SMS via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const sendResults = await Promise.allSettled(
      recipients.map(async (recipient: any) => {
        const formData = new URLSearchParams();
        formData.append('From', fromNumber);
        formData.append('To', recipient.phone);
        formData.append('Body', message);

        const res = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Twilio API error');
        }
        return res.json();
      })
    );

    const sent = sendResults.filter((r) => r.status === 'fulfilled').length;

    // Log alerts to DB
    await supabase.from('low_stock_alerts').insert(
      items.map((i) => ({
        outlet,
        item_name: i.name,
        current_stock: i.currentStock,
        reorder_level: i.reorderLevel,
        unit: i.unit,
        alert_type: i.status,
        sms_sent: sent > 0,
        sms_sent_at: sent > 0 ? new Date().toISOString() : null,
      }))
    );

    return NextResponse.json({
      success: true,
      message: `Low stock SMS sent to ${sent}/${recipients.length} managers`,
      sent,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
