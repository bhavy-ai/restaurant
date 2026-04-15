'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  isSuperadmin: boolean;
  superadminId: string | null;
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
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [superadminId, setSuperadminId] = useState<string | null>(null);

  // Multi-restaurant state
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [activeOutlet, setActiveOutlet] = useState<Outlet | null>(null);
  const [accessibleRestaurants, setAccessibleRestaurants] = useState<Restaurant[]>([]);
  const [accessibleOutlets, setAccessibleOutlets] = useState<Outlet[]>([]);
  const bootstrappedSessionIdRef = useRef<string | null>(null);

  // ── Load all restaurants accessible to this user ──────────────
  const loadRestaurants = useCallback(async (userId?: string, isSuperadmin?: boolean, staffOutlet?: string, staffRole?: string) => {
    try {
      let restaurants: Restaurant[] = [];

      // Superadmins load ALL restaurants directly
      if (isSuperadmin) {
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
      } else if (userId) {
        // Regular users: try user_restaurant_access first (multi-tenant)
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

        // Owners can be attached directly to a restaurant without a user_restaurant_access row.
        if (restaurants.length === 0) {
          const { data: ownedRestaurants } = await supabase
            .from('restaurants')
            .select('*')
            .eq('owner_user_id', userId)
            .eq('is_active', true)
            .order('name');

          const { data: createdRestaurants } = await supabase
            .from('restaurants')
            .select('*')
            .eq('created_by_user_id', userId)
            .eq('is_active', true)
            .order('name');

          const restaurantMap = new Map<string, any>();
          [...(ownedRestaurants || []), ...(createdRestaurants || [])].forEach((r: any) => {
            restaurantMap.set(r.id, r);
          });

          restaurants = Array.from(restaurantMap.values()).map((r: any) => ({
            id: r.id,
            name: r.name,
            gstin: r.gstin,
            fssai: r.fssai,
            plan: r.plan,
            isActive: r.is_active,
          }));
        }

        // Fallback: resolve the restaurant from the staff outlet instead of exposing all restaurants.
        if (restaurants.length === 0 && staffOutlet) {
          const { data: outletBySlug } = await supabase
            .from('outlets')
            .select('id, restaurant_id')
            .eq('slug', staffOutlet)
            .eq('is_active', true)
            .maybeSingle();

          const { data: outletByName } = outletBySlug ? { data: null } : await supabase
            .from('outlets')
            .select('id, restaurant_id')
            .eq('name', staffOutlet)
            .eq('is_active', true)
            .maybeSingle();

          const resolvedOutlet = (outletBySlug as any) || (outletByName as any);
          const resolvedRestaurantId = resolvedOutlet?.restaurant_id;
          if (resolvedRestaurantId) {
            const { data: restaurantRow } = await supabase
              .from('restaurants')
              .select('*')
              .eq('id', resolvedRestaurantId)
              .eq('is_active', true)
              .maybeSingle();

            if (restaurantRow) {
              const row = restaurantRow as any;
              restaurants = [{
                id: row.id,
                name: row.name,
                gstin: row.gstin,
                fssai: row.fssai,
                plan: row.plan,
                isActive: row.is_active,
              }];
            }

            // Backfill access row so future lookups use user_restaurant_access directly.
            if (userId && resolvedOutlet?.id) {
              try {
                const { data: existingAccess } = await (supabase as any)
                  .from('user_restaurant_access')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('restaurant_id', resolvedRestaurantId)
                  .maybeSingle();

                if ((existingAccess as any)?.id) {
                  await (supabase as any)
                    .from('user_restaurant_access')
                    .update({ outlet_id: resolvedOutlet.id, is_active: true })
                    .eq('id', (existingAccess as any).id);
                } else {
                  await (supabase as any)
                    .from('user_restaurant_access')
                    .insert({
                      user_id: userId,
                      restaurant_id: resolvedRestaurantId,
                      outlet_id: resolvedOutlet.id,
                      role: staffRole || 'owner',
                      is_active: true,
                    });
                }
              } catch {
                // Non-blocking: user can still proceed via resolved outlet fallback.
              }
            }
          }
        }
      }

      setAccessibleRestaurants(restaurants);
      return restaurants;
    } catch {
      return [];
    }
  }, []);

  // ── Load outlets for a restaurant ─────────────────────────────
  const loadOutlets = useCallback(async (restaurantId: string, userId?: string, isSuperadmin?: boolean, staffOutlet?: string, staffRole?: string): Promise<Outlet[]> => {
    try {
      const { data } = await supabase
        .from('outlets')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name');

      const allOutlets = (data || []).map((o: any) => ({
        id: o.id,
        restaurantId: o.restaurant_id,
        name: o.name,
        slug: o.slug,
        address: o.address,
        isActive: o.is_active,
      }));

      if (allOutlets.length === 0) {
        setAccessibleOutlets([]);
        return [];
      }

      if (isSuperadmin) {
        setAccessibleOutlets(allOutlets);
        return allOutlets;
      }

      if (userId) {
        const { data: restaurantRow } = await supabase
          .from('restaurants')
          .select('owner_user_id, created_by_user_id')
          .eq('id', restaurantId)
          .maybeSingle();

        if ((restaurantRow as any)?.owner_user_id === userId || (restaurantRow as any)?.created_by_user_id === userId) {
          setAccessibleOutlets(allOutlets);
          return allOutlets;
        }

        const { data: accessRow } = await supabase
          .from('user_restaurant_access')
          .select('role, outlet_id')
          .eq('user_id', userId)
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true)
          .maybeSingle();

        if ((accessRow as any)?.role === 'owner' || !(accessRow as any)?.outlet_id) {
          setAccessibleOutlets(allOutlets);
          return allOutlets;
        }

        const restrictedOutlets = allOutlets.filter((outlet) => outlet.id === (accessRow as any).outlet_id);
        if (restrictedOutlets.length > 0) {
          setAccessibleOutlets(restrictedOutlets);
          return restrictedOutlets;
        }
      }

      if (staffOutlet) {
        const resolvedOutlet = allOutlets.find((outlet) => outlet.slug === staffOutlet || outlet.name === staffOutlet);
        if (resolvedOutlet) {
          setAccessibleOutlets([resolvedOutlet]);
          return [resolvedOutlet];
        }
      }

      setAccessibleOutlets(allOutlets);
      return allOutlets;
    } catch {}
    return [];
  }, []);

  // ── Load staff user profile ────────────────────────────────────
  async function loadStaffUser(email: string, userId?: string) {
    const resolveFromAccess = async () => {
      if (!userId) return null;
      const { data: accessRows } = await supabase
        .from('user_restaurant_access')
        .select('role, outlet_id, restaurants(name)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1);

      if (accessRows && accessRows.length > 0) {
        const access = accessRows[0] as any;
        const role = (access.role as string) || 'owner';
        const staffUserValue = {
          id: userId,
          name: email.split('@')[0],
          email,
          role: role as 'owner' | 'manager' | 'cashier' | 'captain' | 'kitchen' | 'accountant',
          outlet: '',
          permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.owner,
        };
        setStaffUser(staffUserValue);
        return staffUserValue;
      }

      return null;
    };

    try {
      const { data } = await supabase
        .from('staff_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (data) {
        const staff = data as any;

        const statusValue = typeof staff.status === 'string' ? staff.status.toLowerCase() : null;
        const isActive =
          (statusValue ? statusValue === 'active' : true) &&
          (typeof staff.is_active === 'boolean' ? staff.is_active : true);

        if (!isActive) {
          setStaffUser(null);
          return null;
        }

        const role = (staff.role || staff.staff_role || 'owner') as string;
        const staffUserValue = {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: role as 'owner' | 'manager' | 'cashier' | 'captain' | 'kitchen' | 'accountant',
          outlet: staff.outlet,
          permissions: (Array.isArray(staff.permissions) && staff.permissions.length > 0)
            ? staff.permissions
            : (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.owner),
        };
        setStaffUser(staffUserValue);
        return staffUserValue;
      }

      const fallbackAccess = await resolveFromAccess();
      if (fallbackAccess) return fallbackAccess;

      setStaffUser(null);
      return null;
    } catch {
      const fallbackAccess = await resolveFromAccess();
      if (fallbackAccess) return fallbackAccess;

      setStaffUser(null);
      return null;
    }
  }

  async function checkAndLoadSuperadmin(userId?: string): Promise<{ isSuperadmin: boolean; superadminId: string | null }> {
    if (!userId) return { isSuperadmin: false, superadminId: null };
    try {
      const { data, error } = await supabase
        .from('platform_superadmins')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      if (!error && data) {
        return { isSuperadmin: true, superadminId: (data as any).id };
      }
      return { isSuperadmin: false, superadminId: null };
    } catch {
      return { isSuperadmin: false, superadminId: null };
    }
  }

  // ── Bootstrap restaurant + outlet context ─────────────────────
  const bootstrapContext = useCallback(async (userId?: string, isSuperadmin?: boolean, staffOutlet?: string, staffRole?: string) => {
    let restaurants = await loadRestaurants(userId, isSuperadmin, staffOutlet, staffRole);
    if (restaurants.length === 0) return;

    // Restore persisted restaurant or use first
    const persistedRestId = getPersistedRestaurant();
    const targetRestaurant =
      restaurants.find((r) => r.id === persistedRestId) || restaurants[0];
    setActiveRestaurant(targetRestaurant);
    persistRestaurant(targetRestaurant.id);

    // Load outlets for this restaurant
    const outlets = await loadOutlets(targetRestaurant.id, userId, isSuperadmin, staffOutlet, staffRole);
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
    const outlets = await loadOutlets(restaurantId, user?.id || undefined, isSuperadmin, staffUser?.outlet, staffUser?.role);
    if (outlets.length > 0) {
      setActiveOutlet(outlets[0]);
      persistOutlet(outlets[0].id);
    } else {
      setActiveOutlet(null);
    }
  }, [accessibleRestaurants, loadOutlets, user?.id, isSuperadmin, staffUser?.outlet, staffUser?.role]);

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
      setIsSuperadmin(false);
      setSuperadminId(null);
      setActiveRestaurant(null);
      setActiveOutlet(null);
      setAccessibleRestaurants([]);
      setAccessibleOutlets([]);
      bootstrappedSessionIdRef.current = null;
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

        const currentSessionId = (session as any)?.session_id
          || `${session.user?.id || 'anon'}:${(session as any)?.expires_at || ''}`;
        if (bootstrappedSessionIdRef.current === currentSessionId) {
          setLoading(false);
          initialized = true;
          return;
        }

        if (session.user?.id) {
          (async () => {
            const { isSuperadmin: isSuper, superadminId: sadminId } = await checkAndLoadSuperadmin(session.user.id);
            setIsSuperadmin(isSuper);
            if (isSuper) {
              setSuperadminId(sadminId);
              setStaffUser(null);
            } else if (session.user?.email) {
              const staff = await loadStaffUser(session.user.email, session.user.id);
              await bootstrapContext(session.user.id, isSuper, staff?.outlet, staff?.role);
            } else {
              setStaffUser(null);
              await bootstrapContext(session.user.id, isSuper);
            }
          })().finally(() => {
            bootstrappedSessionIdRef.current = currentSessionId;
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
    isSuperadmin,
    superadminId,
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
