'use client';
import AppLayout from '@/components/AppLayout';
import RecipeClient from './components/RecipeClient';

export default function RecipeManagementPage() {
  return (
    <AppLayout>
      <RecipeClient />
    </AppLayout>
  );
}
