'use client';
import AppLayout from '@/components/AppLayout';
import MenuSyncClient from './components/MenuSyncClient';
import RouteGuard from '@/components/RouteGuard';

export default function MenuSyncPage() {
  return (
    <AppLayout currentPath="/menu-sync">
      <RouteGuard routeId="admin-panel">
        <MenuSyncClient />
      </RouteGuard>
    </AppLayout>
  );
}
