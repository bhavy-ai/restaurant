import AppLayout from '@/components/AppLayout';
import TableManagementClient from './components/TableManagementClient';
import RouteGuard from '@/components/RouteGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function TableManagementPage() {
  return (
    <AppLayout currentPath="/table-management">
      <RouteGuard routeId="table-management">
        <ErrorBoundary componentName="TableManagementClient">
          <TableManagementClient />
        </ErrorBoundary>
      </RouteGuard>
    </AppLayout>
  );
}