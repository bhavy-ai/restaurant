'use client';
import AppLayout from '@/components/AppLayout';
import MultiOutletClient from './components/MultiOutletClient';
import RouteGuard from '@/components/RouteGuard';

export default function MultiOutletPage() {
  return (
    <AppLayout currentPath="/multi-outlet">
      <RouteGuard routeId="multi-outlet">
        <MultiOutletClient />
      </RouteGuard>
    </AppLayout>
  );
}
