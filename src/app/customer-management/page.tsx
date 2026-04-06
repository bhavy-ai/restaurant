'use client';
import AppLayout from '@/components/AppLayout';
import CustomerClient from './components/CustomerClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function CustomerManagementPage() {
  return (
    <AppLayout currentPath="/customer-management">
      <RouteGuard routeId="customer-management">
        <ErrorBoundary componentName="CustomerClient">
          <CustomerClient />
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}
