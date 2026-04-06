import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import Providers from '@/components/Providers';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'RestroOS — Restaurant Operating System for India',
  description:
    'RestroOS unifies POS billing, kitchen display, table management, inventory, GST compliance, and EOD settlement for Indian restaurants.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'hsl(215 28% 17%)',
              border: '1px solid hsl(215 28% 22%)',
              color: 'hsl(213 31% 91%)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            },
          }}
        />
</body>
    </html>
  );
}