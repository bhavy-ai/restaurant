'use client';
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldOff } from 'lucide-react';

interface RouteGuardProps {
  routeId: string;
  children: React.ReactNode;
}

export default function RouteGuard({ routeId, children }: RouteGuardProps) {
  const { canAccess, staffUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccess(routeId)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldOff size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mb-1">
            Your role <span className="font-semibold text-foreground capitalize">{staffUser?.role || 'guest'}</span> does not have permission to access this module.
          </p>
          <p className="text-xs text-muted-foreground">Contact your manager or owner to request access.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
