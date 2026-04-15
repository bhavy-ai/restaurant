'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { ShoppingCart, Monitor, LayoutGrid, Package, BarChart3, Settings, ChevronLeft, ChevronRight, Utensils, LogOut, User, Wifi, WifiOff, FlaskConical, Users, Tag, TrendingUp, Bike, Globe, X, RefreshCw, Zap, ChevronDown, Building2, MapPin, Check, Shield, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
  badgeColor?: string;
}

const navPermissionMap: Record<string, string> = {
  'pos-billing': 'pos-billing',
  'kitchen-display-system': 'kitchen-display-system',
  'table-management': 'table-management',
  'takeaway': 'takeaway',
  'aggregator-orders': 'takeaway',
  'inventory-management': 'inventory-management',
  'recipe-management': 'recipe-management',
  'discounts': 'discounts',
  'customer-management': 'customer-management',
  'settlement-dashboard': 'settlement-dashboard',
  'reports': 'reports',
  'multi-outlet': 'multi-outlet',
  'menu-sync': 'admin-panel',
  'admin-panel': 'admin-panel',
  'restaurant-billing': 'admin-panel',
};

const navGroups = [
  {
    label: 'OPERATIONS',
    items: [
      { id: 'pos-billing', label: 'POS Billing', icon: <ShoppingCart size={18} />, path: '/pos-billing', badge: 3, badgeColor: 'bg-primary' },
      { id: 'kitchen-display-system', label: 'Kitchen Display', icon: <Monitor size={18} />, path: '/kitchen-display-system', badge: 7, badgeColor: 'bg-red-500' },
      { id: 'table-management', label: 'Table Management', icon: <LayoutGrid size={18} />, path: '/table-management' },
      { id: 'takeaway', label: 'Takeaway / Delivery', icon: <Bike size={18} />, path: '/takeaway' },
      { id: 'aggregator-orders', label: 'Aggregator Orders', icon: <Zap size={18} />, path: '/aggregator-orders' },
    ],
  },
  {
    label: 'BACK OFFICE',
    items: [
      { id: 'inventory-management', label: 'Inventory', icon: <Package size={18} />, path: '/inventory-management', badge: 4, badgeColor: 'bg-warning' },
      { id: 'recipe-management', label: 'Recipes', icon: <FlaskConical size={18} />, path: '/recipe-management' },
      { id: 'discounts', label: 'Discounts & Coupons', icon: <Tag size={18} />, path: '/discounts' },
      { id: 'customer-management', label: 'Customers', icon: <Users size={18} />, path: '/customer-management' },
      { id: 'settlement-dashboard', label: 'Settlement', icon: <BarChart3 size={18} />, path: '/settlement-dashboard' },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { id: 'reports', label: 'Analytics', icon: <TrendingUp size={18} />, path: '/reports' },
      { id: 'multi-outlet', label: 'Multi-Outlet', icon: <Globe size={18} />, path: '/multi-outlet' },
    ],
  },
  {
    label: 'SETTINGS',
    items: [
      { id: 'menu-sync', label: 'Menu Sync', icon: <RefreshCw size={18} />, path: '/menu-sync' },
      { id: 'admin-panel', label: 'Admin Panel', icon: <Settings size={18} />, path: '/admin-panel' },
      { id: 'restaurant-billing', label: 'Billing', icon: <Receipt size={18} />, path: '/restaurant/billing' },
      { id: 'superadmin', label: 'Superadmin', icon: <Shield size={18} />, path: '/superadmin' },
    ],
  },
];

interface SidebarProps {
  currentPath: string;
  onClose?: () => void;
}

export default function Sidebar({ currentPath, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isOnline] = useState(true);
  const [badgeCounts, setBadgeCounts] = useState({ posBilling: 0, kitchenDisplay: 0 });
  const [showRestaurantMenu, setShowRestaurantMenu] = useState(false);
  const [showOutletMenu, setShowOutletMenu] = useState(false);
  const [switchingRestaurant, setSwitchingRestaurant] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const restaurantMenuRef = useRef<HTMLDivElement>(null);
  const outletMenuRef = useRef<HTMLDivElement>(null);

  const {
    user,
    staffUser,
    canAccess,
    signOut,
    activeRestaurant,
    activeOutlet,
    accessibleRestaurants,
    accessibleOutlets,
    switchRestaurant,
    switchOutlet,
    isSuperadmin: isSuperAdminFromContext,
  } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const restaurantId = activeRestaurant?.id;
  const outletSlug = activeOutlet?.slug || staffUser?.outlet || 'koramangala';

  useEffect(() => {
    setIsSuperAdmin(isSuperAdminFromContext);
  }, [isSuperAdminFromContext]);

  // Live badges: low-load pattern (initial count + realtime change events)
  const loadLiveBadges = useCallback(async () => {
    if (!restaurantId) {
      setBadgeCounts({ posBilling: 0, kitchenDisplay: 0 });
      return;
    }
    try {
      let posQuery = supabase
        .from('restaurant_tables')
        .select('*', { head: true, count: 'exact' })
        .eq('status', 'bill_requested')
        .eq('outlet', outletSlug)
        .eq('restaurant_id', restaurantId);

      let kdsQuery = supabase
        .from('kots')
        .select('*', { head: true, count: 'exact' })
        .eq('outlet', outletSlug)
        .eq('restaurant_id', restaurantId)
        .not('status', 'in', '("bumped","voided")');

      const [{ count: posCount, error: posErr }, { count: kdsCount, error: kdsErr }] = await Promise.all([
        posQuery,
        kdsQuery,
      ]);

      if (posErr || kdsErr) {
        setBadgeCounts((prev) => prev);
        return;
      }

      setBadgeCounts({
        posBilling: posCount || 0,
        kitchenDisplay: kdsCount || 0,
      });
    } catch {
      // non-blocking
    }
  }, [supabase, restaurantId, outletSlug]);

  useEffect(() => {
    loadLiveBadges();
  }, [loadLiveBadges]);

  useEffect(() => {
    if (!restaurantId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        loadLiveBadges();
      }, 250);
    };

    const channel = supabase
      .channel('sidebar_live_badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kots' }, (payload) => {
        if (payload.new && payload.new.outlet !== outletSlug) return;
        if (payload.new && payload.new.restaurant_id !== restaurantId) return;
        queueRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, (payload) => {
        if (payload.new && payload.new.outlet !== outletSlug) return;
        if (payload.new && payload.new.restaurant_id !== restaurantId) return;
        queueRefresh();
      })
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId, outletSlug, loadLiveBadges]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (restaurantMenuRef.current && !restaurantMenuRef.current.contains(e.target as Node)) {
        setShowRestaurantMenu(false);
      }
      if (outletMenuRef.current && !outletMenuRef.current.contains(e.target as Node)) {
        setShowOutletMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSwitchRestaurant = async (restaurantId: string) => {
    if (restaurantId === activeRestaurant?.id) {
      setShowRestaurantMenu(false);
      return;
    }
    setSwitchingRestaurant(true);
    setShowRestaurantMenu(false);
    try {
      await switchRestaurant(restaurantId);
    } finally {
      setSwitchingRestaurant(false);
    }
  };

  const handleSwitchOutlet = (outletId: string) => {
    switchOutlet(outletId);
    setShowOutletMenu(false);
  };

  return (
    <aside
      className={`relative flex flex-col bg-[hsl(224_71%_5%)] border-r border-border transition-all duration-300 ease-in-out flex-shrink-0 h-full ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center h-14 border-b border-border px-3 ${collapsed ? 'justify-center' : 'gap-2'}`}>
        <AppLogo size={32} />
        {!collapsed && (
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-bold text-sm text-foreground leading-tight tracking-tight">RestroOS</span>
            <span className="text-[10px] text-muted-foreground font-mono">v2.4.1</span>
          </div>
        )}
        {onClose && !collapsed && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Restaurant Switcher */}
      {!collapsed && (
        <div className="mx-3 mt-3 space-y-1.5">
          {/* Restaurant selector */}
          <div ref={restaurantMenuRef} className="relative">
            <button
              onClick={() => { setShowRestaurantMenu(!showRestaurantMenu); setShowOutletMenu(false); }}
              disabled={switchingRestaurant}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border hover:border-primary/50 transition-colors text-left disabled:opacity-60"
            >
              <Building2 size={13} className="text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Restaurant</p>
                <p className="text-xs font-semibold text-foreground truncate">
                  {switchingRestaurant ? 'Switching…' : (activeRestaurant?.name || 'Select Restaurant')}
                </p>
              </div>
              <ChevronDown size={12} className={`text-muted-foreground flex-shrink-0 transition-transform ${showRestaurantMenu ? 'rotate-180' : ''}`} />
            </button>

            {showRestaurantMenu && accessibleRestaurants.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-1.5">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-2 py-1">
                    Your Restaurants
                  </p>
                  {accessibleRestaurants.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSwitchRestaurant(r.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-5 h-5 rounded bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Building2 size={10} className="text-primary" />
                      </div>
                      <span className="text-xs text-foreground truncate flex-1">{r.name}</span>
                      {r.id === activeRestaurant?.id && (
                        <Check size={11} className="text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Outlet selector */}
          <div ref={outletMenuRef} className="relative">
            <button
              onClick={() => { setShowOutletMenu(!showOutletMenu); setShowRestaurantMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border hover:border-primary/50 transition-colors text-left"
            >
              <MapPin size={13} className="text-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Outlet</p>
                <p className="text-xs font-semibold text-foreground truncate">
                  {activeOutlet?.name || activeRestaurant?.name || 'Select Outlet'}
                </p>
              </div>
              {accessibleOutlets.length > 1 && (
                <ChevronDown size={12} className={`text-muted-foreground flex-shrink-0 transition-transform ${showOutletMenu ? 'rotate-180' : ''}`} />
              )}
            </button>

            {showOutletMenu && accessibleOutlets.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-1.5">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-2 py-1">
                    Outlets
                  </p>
                  {accessibleOutlets.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handleSwitchOutlet(o.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-5 h-5 rounded bg-accent/15 flex items-center justify-center flex-shrink-0">
                        <Utensils size={10} className="text-accent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground truncate">{o.name}</p>
                        {o.address && <p className="text-[10px] text-muted-foreground truncate">{o.address}</p>}
                      </div>
                      {o.id === activeOutlet?.id && (
                        <Check size={11} className="text-accent flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsed: icon-only context indicator */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1.5 mt-3 px-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center" title={activeRestaurant?.name || 'Restaurant'}>
            <Building2 size={14} className="text-primary" />
          </div>
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center" title={activeOutlet?.name || 'Outlet'}>
            <MapPin size={14} className="text-accent" />
          </div>
        </div>
      )}

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2 space-y-4 mt-2">
        {navGroups.map((group) => (
          <div key={`group-${group.label}`}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground tracking-widest px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                // Hide superadmin link for non-superadmins
                if (item.id === 'superadmin' && !isSuperAdmin) return null;
                // Hide modules when the mapped permission is not granted for this role
                const requiredPermission = navPermissionMap[item.id];
                if (requiredPermission && !canAccess(requiredPermission)) return null;
                const isActive = currentPath === item.path;
                const liveBadge = item.id === 'pos-billing'
                  ? badgeCounts.posBilling
                  : item.id === 'kitchen-display-system'
                    ? badgeCounts.kitchenDisplay
                    : item.badge;
                const liveBadgeColor = item.badgeColor || 'bg-primary';
                return (
                  <Link
                    key={`nav-${item.id}`}
                    href={item.path}
                    onClick={onClose}
                    className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-primary/15 text-primary' :'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    } ${collapsed ? 'justify-center' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={`flex-shrink-0 ${isActive ? 'text-primary' : ''}`}>{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && Boolean(liveBadge) && (
                      <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ${liveBadgeColor}`}>
                        {liveBadge}
                      </span>
                    )}
                    {collapsed && Boolean(liveBadge) && (
                      <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${liveBadgeColor}`} />
                    )}
                    {collapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-secondary border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                        {item.label}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border p-2 space-y-1">
        {/* Online indicator */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${collapsed ? 'justify-center' : ''}`}>
          {isOnline ? (
            <Wifi size={13} className="text-accent flex-shrink-0" />
          ) : (
            <WifiOff size={13} className="text-destructive flex-shrink-0" />
          )}
          {!collapsed && (
            <span className={`text-xs ${isOnline ? 'text-accent' : 'text-destructive'}`}>
              {isOnline ? 'Online' : 'Offline Mode'}
            </span>
          )}
        </div>

        {/* User */}
        <div
          onClick={handleLogout}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary cursor-pointer transition-colors ${collapsed ? 'justify-center' : ''}`}
          title="Logout"
        >
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <User size={12} className="text-primary" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{staffUser?.name ?? user?.email ?? 'Signed in user'}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{staffUser?.role ?? ''}</p>
            </div>
          )}
          {!collapsed && <LogOut size={13} className="text-muted-foreground flex-shrink-0" />}
        </div>
      </div>

      {/* Collapse Toggle — desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex absolute -right-3 top-16 w-6 h-6 rounded-full bg-secondary border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-primary/20 hover:border-primary/50 transition-all z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}