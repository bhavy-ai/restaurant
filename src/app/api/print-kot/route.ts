import { NextRequest, NextResponse } from 'next/server';

// ESC/POS command builder for thermal printers
// Sends raw TCP commands to printer IP:port (default 9100)
// This is a server-side proxy since browsers cannot open raw TCP sockets

function buildKOTEscPos(kot: {
  kotNumber: string;
  tableLabel: string;
  orderType: string;
  station: string;
  steward: string;
  covers: number;
  priority: string;
  fireTime: string;
  items: Array<{ name: string; qty: number; note?: string; isVeg: boolean }>;
}): Buffer {
  const ESC = 0x1b;
  const GS = 0x1d;
  const LF = 0x0a;
  const INIT = Buffer.from([ESC, 0x40]);
  const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
  const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
  const DOUBLE_HEIGHT = Buffer.from([ESC, 0x21, 0x10]);
  const NORMAL_SIZE = Buffer.from([ESC, 0x21, 0x00]);
  const CENTER = Buffer.from([ESC, 0x61, 0x01]);
  const LEFT = Buffer.from([ESC, 0x61, 0x00]);
  const CUT = Buffer.from([GS, 0x56, 0x42, 0x00]);
  const BEEP = Buffer.from([ESC, 0x42, 0x03, 0x02]); // 3 beeps

  const line = (text: string) => Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([LF])]);
  const dashes = () => line('--------------------------------');

  const fireDate = new Date(kot.fireTime);
  const timeStr = fireDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = fireDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  const parts: Buffer[] = [
    INIT,
    BEEP,
    CENTER,
    DOUBLE_HEIGHT,
    BOLD_ON,
    line('KOT'),
    NORMAL_SIZE,
    BOLD_OFF,
    line(`#${kot.kotNumber}`),
    LEFT,
    dashes(),
    line(`Table: ${kot.tableLabel}   ${kot.orderType.toUpperCase()}`),
    line(`Station: ${kot.station}`),
    line(`Steward: ${kot.steward}   Covers: ${kot.covers}`),
    line(`Time: ${timeStr} ${dateStr}`),
    kot.priority === 'rush' ? Buffer.concat([BOLD_ON, line('*** RUSH ORDER ***'), BOLD_OFF]) : Buffer.alloc(0),
    dashes(),
    BOLD_ON,
    line('  QTY  ITEM'),
    BOLD_OFF,
    dashes(),
  ];

  kot.items.forEach((item) => {
    const vegMark = item.isVeg ? '[V]' : '[N]';
    const qtyPad = String(item.qty).padStart(3, ' ');
    parts.push(line(`${qtyPad}x  ${vegMark} ${item.name}`));
    if (item.note) {
      parts.push(line(`       ** ${item.note} **`));
    }
  });

  parts.push(
    dashes(),
    CENTER,
    line('-- END OF KOT --'),
    Buffer.from([LF, LF, LF]),
    CUT,
  );

  return Buffer.concat(parts);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kot, printerIp, printerPort = 9100 } = body;

    if (!kot || !printerIp) {
      return NextResponse.json({ error: 'Missing kot or printerIp' }, { status: 400 });
    }

    const escposData = buildKOTEscPos(kot);

    // Attempt TCP print via Node.js net module
    try {
      const net = await import('net');
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error(`Printer connection timeout (${printerIp}:${printerPort})`));
        }, 5000);

        socket.connect(printerPort, printerIp, () => {
          socket.write(escposData, (err) => {
            clearTimeout(timeout);
            socket.destroy();
            if (err) reject(err);
            else resolve();
          });
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      return NextResponse.json({ success: true, message: `KOT #${kot.kotNumber} sent to ${printerIp}:${printerPort}` });
    } catch (tcpErr: any) {
      // Return ESC/POS data as base64 for browser-side fallback (e.g. USB/BT printers)
      return NextResponse.json({
        success: false,
        fallback: true,
        escposBase64: escposData.toString('base64'),
        message: `TCP print failed: ${tcpErr.message}. Use USB/BT fallback.`,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
