'use client';
import React, { useState, useEffect } from 'react';
import { Bell, Search, Zap, Clock, WifiOff, RefreshCw, Loader2, Building2, MapPin } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAuth } from '@/contexts/AuthContext';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/pos-billing': { title: 'POS Billing', subtitle: 'Create and settle orders' },
  '/kitchen-display-system': { title: 'Kitchen Display', subtitle: 'Live KOT management' },
  '/table-management': { title: 'Table Management', subtitle: 'Floor plan & covers' },
  '/inventory-management': { title: 'Inventory', subtitle: 'Stock & consumption tracking' },
  '/settlement-dashboard': { title: 'Settlement', subtitle: 'End-of-day reconciliation' },
  '/admin-panel': { title: 'Admin Panel', subtitle: 'Back-office configuration' },
};

interface TopbarProps {
  currentPath: string;
}

export default function Topbar({ currentPath }: TopbarProps) {
  const page = pageTitles[currentPath] || { title: 'RestroOS', subtitle: '' };
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkStatus();
  const { activeRestaurant, activeOutlet, accessibleRestaurants } = useAuth();

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isMultiRestaurant = accessibleRestaurants.length > 1;

  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-[hsl(224_71%_5%)] flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <h1 className="text-base font-bold text-foreground leading-tight">{page.title}</h1>
          <p className="text-[11px] text-muted-foreground">{page.subtitle}</p>
        </div>

        {/* Active restaurant/outlet context pill — shown when multi-restaurant */}
        {isMultiRestaurant && activeRestaurant && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-primary/10 border border-primary/20 rounded-lg">
            <Building2 size={10} className="text-primary flex-shrink-0" />
            <span className="text-[10px] font-semibold text-primary truncate max-w-[100px]">{activeRestaurant.name}</span>
            {activeOutlet && (
              <>
                <span className="text-[10px] text-primary/50">/</span>
                <MapPin size={10} className="text-accent flex-shrink-0" />
                <span className="text-[10px] font-medium text-accent truncate max-w-[80px]">{activeOutlet.name}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Offline / Sync indicator */}
        {!isOnline ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/30 rounded-lg">
            <WifiOff size={11} className="text-red-400" />
            <span className="text-xs font-semibold text-red-400">Offline</span>
            {pendingCount > 0 && (
              <span className="text-[10px] text-red-300 font-mono">{pendingCount}q</span>
            )}
          </div>
        ) : pendingCount > 0 || isSyncing ? (
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-60"
            title={isSyncing ? 'Syncing…' : `${pendingCount} pending — click to sync`}
          >
            {isSyncing ? (
              <Loader2 size={11} className="text-amber-400 animate-spin" />
            ) : (
              <RefreshCw size={11} className="text-amber-400" />
            )}
            <span className="text-xs font-semibold text-amber-400">
              {isSyncing ? 'Syncing…' : `${pendingCount} pending`}
            </span>
          </button>
        ) : null}

        {/* Shift indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-accent/10 border border-accent/30 rounded-lg">
          <Zap size={11} className="text-accent" />
          <span className="text-xs font-semibold text-accent">Lunch Shift</span>
        </div>

        {/* Time */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-secondary rounded-lg">
          <Clock size={11} className="text-muted-foreground" />
          <span className="text-xs font-mono text-foreground">{currentTime}</span>
          <span className="text-[10px] text-muted-foreground">{currentDate}</span>
        </div>

        {/* Search */}
        <button className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all text-xs">
          <Search size={13} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-[10px] bg-background px-1 rounded">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all">
          <Bell size={15} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}