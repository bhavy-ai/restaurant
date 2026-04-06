'use client';
import AppLayout from '@/components/AppLayout';
import SettlementClient from './components/SettlementClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function SettlementDashboardPage() {
  return (
    <AppLayout currentPath="/settlement-dashboard">
      <RouteGuard routeId="settlement-dashboard">
        <ErrorBoundary componentName="SettlementClient">
          <SettlementClient />
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}