'use client';
import React, { Suspense, lazy } from 'react';
import AppLayout from '@/components/AppLayout';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

const ReportsClient = lazy(() => import('./components/ReportsClient'));

function ReportsLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <Loader2 size={28} className="text-primary animate-spin" />
      <p className="text-sm text-muted-foreground">Loading Reporting & Analytics…</p>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AppLayout currentPath="/reports">
      <RouteGuard routeId="reports">
        <ErrorBoundary componentName="ReportsClient">
          <Suspense fallback={<ReportsLoadingFallback />}>
            <ReportsClient />
          </Suspense>
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}
