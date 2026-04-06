'use client';
import AppLayout from '@/components/AppLayout';
import AggregatorOrdersClient from './components/AggregatorOrdersClient';
import RouteGuard from '@/components/RouteGuard';

export default function AggregatorOrdersPage() {
  return (
    <AppLayout currentPath="/aggregator-orders">
      <RouteGuard routeId="takeaway">
        <AggregatorOrdersClient />
      </RouteGuard>
    </AppLayout>
  );
}
