'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';
import AdminPanelClient from './components/AdminPanelClient';
import RouteGuard from '@/components/RouteGuard';

export default function AdminPanelPage() {
  return (
    <AppLayout currentPath="/admin-panel">
      <RouteGuard routeId="admin-panel">
        <AdminPanelClient />
      </RouteGuard>
    </AppLayout>
  );
}