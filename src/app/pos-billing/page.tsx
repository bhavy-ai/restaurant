'use client';
import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import POSBillingClient from './components/POSBillingClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

export default function POSBillingPage() {
  return (
    <AppLayout currentPath="/pos-billing">
      <RouteGuard routeId="pos-billing">
        <ErrorBoundary componentName="POSBillingClient">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          }>
            <POSBillingClient />
          </Suspense>
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}