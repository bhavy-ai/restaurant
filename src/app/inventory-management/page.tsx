'use client';
import AppLayout from '@/components/AppLayout';
import InventoryClient from './components/InventoryClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function InventoryManagementPage() {
  return (
    <AppLayout currentPath="/inventory-management">
      <RouteGuard routeId="inventory-management">
        <ErrorBoundary componentName="InventoryClient">
          <InventoryClient />
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}