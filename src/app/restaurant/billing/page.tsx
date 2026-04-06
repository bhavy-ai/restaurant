import React from 'react';
import AppLayout from '@/components/AppLayout';
import BillingClient from './components/BillingClient';

export const metadata = {
  title: 'Billing & Invoices — RestroOS',
  description: 'View your subscription invoices, payment history, and download receipts',
};

export default function BillingPage() {
  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <BillingClient />
      </div>
    </AppLayout>
  );
}
