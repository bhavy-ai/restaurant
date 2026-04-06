'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// Module-level singleton to prevent multiple client instances
const supabase = createClient();

// Role-based permissions matrix
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['pos-billing', 'kitchen-display-system', 'table-management', 'takeaway', 'inventory-management', 'recipe-management', 'discounts', 'customer-management', 'settlement-dashboard', 'reports', 'multi-outlet', 'admin-panel'],
  manager: ['pos-billing', 'kitchen-display-system', 'table-management', 'takeaway', 'inventory-management', 'recipe-management', 'discounts', 'customer-management', 'settlement-dashboard', 'reports', 'multi-outlet'],
  cashier: ['pos-billing', 'table-management', 'takeaway', 'settlement-dashboard', 'reports'],
  captain: ['pos-billing', 'kitchen-display-system', 'table-management', 'takeaway'],
  kitchen: ['kitchen-display-system'],
  accountant: ['inventory-management', 'settlement-dashboard', 'reports', 'multi-outlet'],
};

export interface Restaurant {
  id: string;
  name: string;
  gstin?: string;
  fssai?: string;
  plan: string;
  isActive: boolean;
}

export interface Outlet {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  address?: string;
  isActive: boolean;
}

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'cashier' | 'captain' | 'kitchen' | 'accountant';
  outlet: string;
  permissions: string[];
}

interface AuthContextValue {
  user: any;
  session: any;
  loading: boolean;
  staffUser: StaffUser | null;
  // Multi-restaurant context
  activeRestaurant: Restaurant | null;
  activeOutlet: Outlet | null;
  accessibleRestaurants: Restaurant[];
  accessibleOutlets: Outlet[];
  switchRestaurant: (restaurantId: string) => Promise<void>;
  switchOutlet: (outletId: string) => void;
  canAccess: (routeId: string) => boolean;
  signUp: (email: string, password: string, metadata?: any) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  getCurrentUser: () => Promise<any>;
  isEmailVerified: () => boolean;
  getUserProfile: () => Promise<any>;
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export const useAuth = () => {
  const context = useContext(AuthContext);
  return context || {};
};

// ── Helpers ────────────────────────────────────────────────────
const RESTAURANT_KEY = 'restro_active_restaurant_id';
const OUTLET_KEY = 'restro_active_outlet_id';

function persistRestaurant(id: string) {
  try { localStorage.setItem(RESTAURANT_KEY, id); } catch {}
}
function persistOutlet(id: string) {
  try { localStorage.setItem(OUTLET_KEY, id); } catch {}
}
function getPersistedRestaurant(): string | null {
  try { return localStorage.getItem(RESTAURANT_KEY); } catch { return null; }
}
function getPersistedOutlet(): string | null {
  try { return localStorage.getItem(OUTLET_KEY); } catch { return null; }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);

  // Multi-restaurant state
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [activeOutlet, setActiveOutlet] = useState<Outlet | null>(null);
  const [accessibleRestaurants, setAccessibleRestaurants] = useState<Restaurant[]>([]);
  const [accessibleOutlets, setAccessibleOutlets] = useState<Outlet[]>([]);

  // ── Load all restaurants accessible to this user ──────────────
  const loadRestaurants = useCallback(async (userId?: string) => {
    try {
      // Try user_restaurant_access first (multi-tenant)
      let restaurants: Restaurant[] = [];

      if (userId) {
        const { data: access } = await supabase
          .from('user_restaurant_access')
          .select('restaurant_id, restaurants(*)')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (access && access.length > 0) {
          restaurants = access
            .map((a: any) => a.restaurants)
            .filter(Boolean)
            .map((r: any) => ({
              id: r.id,
              name: r.name,
              gstin: r.gstin,
              fssai: r.fssai,
              plan: r.plan,
              isActive: r.is_active,
            }));
        }
      }

      // Fallback: load all restaurants (for demo / owner without access rows)
      if (restaurants.length === 0) {
        const { data: allRestaurants } = await supabase
          .from('restaurants')
          .select('*')
          .eq('is_active', true)
          .order('name');
        if (allRestaurants) {
          restaurants = allRestaurants.map((r: any) => ({
            id: r.id,
            name: r.name,
            gstin: r.gstin,
            fssai: r.fssai,
            plan: r.plan,
            isActive: r.is_active,
          }));
        }
      }

      setAccessibleRestaurants(restaurants);
      return restaurants;
    } catch {
      return [];
    }
  }, []);

  // ── Load outlets for a restaurant ─────────────────────────────
  const loadOutlets = useCallback(async (restaurantId: string): Promise<Outlet[]> => {
    try {
      const { data } = await supabase
        .from('outlets')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name');
      if (data) {
        const outlets = data.map((o: any) => ({
          id: o.id,
          restaurantId: o.restaurant_id,
          name: o.name,
          slug: o.slug,
          address: o.address,
          isActive: o.is_active,
        }));
        setAccessibleOutlets(outlets);
        return outlets;
      }
    } catch {}
    return [];
  }, []);

  // ── Load staff user profile ────────────────────────────────────
  async function loadStaffUser(email: string) {
    try {
      const { data } = await supabase
        .from('staff_users')
        .select('*')
        .eq('email', email)
        .eq('status', 'active')
        .single();
      if (data) {
        setStaffUser({
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          outlet: data.outlet,
          permissions: data.permissions || ROLE_PERMISSIONS[data.role] || [],
        });
      }
    } catch {
      setStaffUser({
        id: 'demo',
        name: email?.split('@')[0] || 'User',
        email: email || '',
        role: 'owner',
        outlet: 'koramangala',
        permissions: ROLE_PERMISSIONS['owner'],
      });
    }
  }

  // ── Bootstrap restaurant + outlet context ─────────────────────
  const bootstrapContext = useCallback(async (userId?: string) => {
    let restaurants = await loadRestaurants(userId);
    if (restaurants.length === 0) return;

    // Restore persisted restaurant or use first
    const persistedRestId = getPersistedRestaurant();
    const targetRestaurant =
      restaurants.find((r) => r.id === persistedRestId) || restaurants[0];
    setActiveRestaurant(targetRestaurant);
    persistRestaurant(targetRestaurant.id);

    // Load outlets for this restaurant
    const outlets = await loadOutlets(targetRestaurant.id);
    if (outlets.length === 0) return;

    // Restore persisted outlet or use first
    const persistedOutletId = getPersistedOutlet();
    const targetOutlet =
      outlets.find((o) => o.id === persistedOutletId) || outlets[0];
    setActiveOutlet(targetOutlet);
    persistOutlet(targetOutlet.id);
  }, [loadRestaurants, loadOutlets]);

  // ── Switch restaurant ──────────────────────────────────────────
  const switchRestaurant = useCallback(async (restaurantId: string) => {
    const restaurant = accessibleRestaurants.find((r) => r.id === restaurantId);
    if (!restaurant) return;
    setActiveRestaurant(restaurant);
    persistRestaurant(restaurant.id);

    // Load outlets for new restaurant
    const outlets = await loadOutlets(restaurantId);
    if (outlets.length > 0) {
      setActiveOutlet(outlets[0]);
      persistOutlet(outlets[0].id);
    } else {
      setActiveOutlet(null);
    }
  }, [accessibleRestaurants, loadOutlets]);

  // ── Switch outlet ──────────────────────────────────────────────
  const switchOutlet = useCallback((outletId: string) => {
    const outlet = accessibleOutlets.find((o) => o.id === outletId);
    if (!outlet) return;
    setActiveOutlet(outlet);
    persistOutlet(outlet.id);
  }, [accessibleOutlets]);

  useEffect(() => {
    let initialized = false;

    const resetState = () => {
      setSession(null);
      setUser(null);
      setStaffUser(null);
      setActiveRestaurant(null);
      setActiveOutlet(null);
      setAccessibleRestaurants([]);
      setAccessibleOutlets([]);
      setLoading(false);
      initialized = true;
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED: only update session/user silently — do NOT re-run
      // heavy DB queries (loadStaffUser, bootstrapContext). This is the root
      // cause of the infinite API loop: Supabase fires TOKEN_REFRESHED every
      // ~55 minutes (or on every tab focus), and running DB queries inside it
      // triggers more auth checks, which trigger more refreshes.
      if (event === 'TOKEN_REFRESHED') {
        if (session) {
          setSession(session);
          setUser(session.user ?? null);
        }
        return;
      }

      if (!session || event === 'SIGNED_OUT') {
        resetState();
        return;
      }

      // Only run full bootstrap on initial load and explicit sign-in
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setSession(session);
        setUser(session.user ?? null);
        if (session.user?.email) {
          Promise.all([
            loadStaffUser(session.user.email),
            bootstrapContext(session.user.id),
          ]).finally(() => {
            setLoading(false);
            initialized = true;
          });
        } else {
          setStaffUser(null);
          setActiveRestaurant(null);
          setActiveOutlet(null);
          setAccessibleRestaurants([]);
          setAccessibleOutlets([]);
          setLoading(false);
          initialized = true;
        }
      }
    });

    // Safety fallback: if onAuthStateChange never fires (e.g. no network),
    // stop the loading spinner after 5 seconds to avoid infinite loading.
    const fallbackTimer = setTimeout(() => {
      if (!initialized) {
        setLoading(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Email/Password Sign Up
  const signUp = async (email: string, password: string, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: (metadata as any)?.fullName || '',
          avatar_url: (metadata as any)?.avatarUrl || ''
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) throw error;
    return data;
  };

  // Email/Password Sign In
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  };

  // Sign Out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setStaffUser(null);
    setActiveRestaurant(null);
    setActiveOutlet(null);
    setAccessibleRestaurants([]);
    setAccessibleOutlets([]);
    try { localStorage.removeItem(RESTAURANT_KEY); localStorage.removeItem(OUTLET_KEY); } catch {}
  };

  // Get Current User
  const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  };

  // Check if Email is Verified
  const isEmailVerified = () => {
    return user?.email_confirmed_at !== null;
  };

  // Get User Profile from Database
  const getUserProfile = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  };

  // Check if current user can access a route
  const canAccess = (routeId: string): boolean => {
    if (!staffUser) return false;
    const role = staffUser.role;
    const allowed = ROLE_PERMISSIONS[role] || [];
    return allowed.includes(routeId);
  };

  const value: AuthContextValue = {
    user,
    session,
    loading,
    staffUser,
    activeRestaurant,
    activeOutlet,
    accessibleRestaurants,
    accessibleOutlets,
    switchRestaurant,
    switchOutlet,
    canAccess,
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
