'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';
import KDSClient from './components/KDSClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function KitchenDisplayPage() {
  return (
    <AppLayout currentPath="/kitchen-display-system">
      <RouteGuard routeId="kitchen-display-system">
        <ErrorBoundary componentName="KDSClient">
          <KDSClient />
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}