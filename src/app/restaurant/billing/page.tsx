import React from 'react';
import AppLayout from '@/components/AppLayout';
import RouteGuard from '@/components/RouteGuard';
import BillingClient from './components/BillingClient';

export const metadata = {
  title: 'Billing & Invoices — RestroOS',
  description: 'View your subscription invoices, payment history, and download receipts',
};

export default function BillingPage() {
  return (
    <AppLayout currentPath="/restaurant/billing">
      <RouteGuard routeId="admin-panel">
        <div className="p-4 lg:p-6 max-w-5xl mx-auto">
          <BillingClient />
        </div>
      </RouteGuard>
    </AppLayout>
  );
}
