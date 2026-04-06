'use client';
import AppLayout from '@/components/AppLayout';
import TakeawayClient from './components/TakeawayClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function TakeawayPage() {
  return (
    <AppLayout currentPath="/takeaway">
      <RouteGuard routeId="takeaway">
        <ErrorBoundary componentName="TakeawayClient">
          <TakeawayClient />
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}
