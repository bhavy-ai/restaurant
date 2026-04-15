'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, Search, Plus, Check, X, ChevronDown, RefreshCw, AlertCircle, Loader2, ToggleLeft, ToggleRight, MapPin, TrendingUp, Shield, Utensils, ShieldOff, ClipboardList, Receipt, CalendarClock, Pencil, LogOut, Trash2 } from 'lucide-react';
import AuditLogDashboard from './AuditLogDashboard';
import InvoicesDashboard from './InvoicesDashboard';
import SubscriptionScheduler from './SubscriptionScheduler';
import SaasMetricsDashboard from './SaasMetricsDashboard';
import PlanChangeAudit from './PlanChangeAudit';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  gstin?: string;
  fssai?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  cuisine_type?: string;
  seating_capacity?: number;
  website?: string;
  onboarding_status?: string;
  owner_user_id?: string;
  created_at: string;
  outlet_count?: number;
}

interface Outlet {
  id: string;
  name: string;
  address?: string;
  is_active: boolean;
}

const PLANS = ['starter', 'growth', 'enterprise'];

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
  free: 'Free',
};

const supabase = createClient() as any;

export default function SuperadminClient() {
  const { isSuperadmin: isSuperAdminFromContext, superadminId: superadminIdFromContext } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'restaurants' | 'audit' | 'invoices' | 'scheduler' | 'saas' | 'planaudit'>('restaurants');

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Superadmin access guard
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [accessChecking, setAccessChecking] = useState(false);
  const [superadminId, setSuperadminId] = useState<string | null>(null);

  // Selected restaurant detail
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletsLoading, setOutletsLoading] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [showOutletEdit, setShowOutletEdit] = useState(false);
  const [outletForm, setOutletForm] = useState({ name: '', address: '', is_active: true });
  const [savingOutlet, setSavingOutlet] = useState(false);
  const [deletingOutletId, setDeletingOutletId] = useState<string | null>(null);

  // Add restaurant modal
  const [showAdd, setShowAdd] = useState(false);
  const [addData, setAddData] = useState({
    name: '',
    ownerName: '',
    ownerEmail: '',
    phone: '',
    cuisineType: '',
    gstin: '',
    fssai: '',
    website: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    seatingCapacity: '',
    plan: 'starter',
    onboardingStatus: 'active',
    outletName: '',
    outletAddress: '',
    outletPhone: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit restaurant modal
  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState<{
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
    fssai: string;
    cuisine_type: string;
    seating_capacity: string;
    website: string;
    onboarding_status: string;
  }>({
    name: '', phone: '', address: '', city: '', state: '', pincode: '',
    gstin: '', fssai: '', cuisine_type: '', seating_capacity: '', website: '', onboarding_status: 'pending',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, enterprise: 0 });

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;

      // Load all outlet rows once and compute counts client-side.
      const { data: outletRows, error: outletErr } = await supabase
        .from('outlets')
        .select('restaurant_id');
      if (outletErr) throw outletErr;

      const outletCountByRestaurant = (outletRows || []).reduce((acc: Record<string, number>, row: any) => {
        const restaurantId = row?.restaurant_id;
        if (!restaurantId) return acc;
        acc[restaurantId] = (acc[restaurantId] || 0) + 1;
        return acc;
      }, {});

      const enriched = (data || []).map((r: any) => ({
        ...r,
        outlet_count: outletCountByRestaurant[r.id] || 0,
      }));

      setRestaurants(enriched);
      setStats({
        total: enriched.length,
        active: enriched.filter((r: any) => r.is_active).length,
        pending: enriched.filter((r: any) => r.onboarding_status === 'pending').length,
        enterprise: enriched.filter((r: any) => r.plan === 'enterprise').length,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsSuperAdmin(isSuperAdminFromContext);
    setSuperadminId(superadminIdFromContext);
  }, [isSuperAdminFromContext, superadminIdFromContext]);

  useEffect(() => { loadRestaurants(); }, [loadRestaurants]);

  const loadOutlets = async (restaurantId: string) => {
    setOutletsLoading(true);
    try {
      const { data } = await supabase
        .from('outlets')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name');
      setOutlets(data || []);
    } finally {
      setOutletsLoading(false);
    }
  };

  const handleSelect = (r: Restaurant) => {
    setSelected(r);
    loadOutlets(r.id);
  };

  const openEditOutlet = (outlet: Outlet) => {
    setEditingOutlet(outlet);
    setOutletForm({
      name: outlet.name,
      address: outlet.address || '',
      is_active: outlet.is_active,
    });
    setShowOutletEdit(true);
  };

  const saveOutlet = async () => {
    if (!selected || !editingOutlet) return;
    if (!outletForm.name.trim()) {
      toast.error('Outlet name is required');
      return;
    }

    setSavingOutlet(true);
    try {
      const response = await fetch('/api/admin/outlets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: selected.id,
          outletId: editingOutlet.id,
          name: outletForm.name,
          address: outletForm.address,
          is_active: outletForm.is_active,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to update outlet');
      }

      toast.success(`Outlet "${outletForm.name}" updated`);
      setShowOutletEdit(false);
      setEditingOutlet(null);
      await loadOutlets(selected.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update outlet');
    } finally {
      setSavingOutlet(false);
    }
  };

  const softDeleteOutlet = async (outlet: Outlet) => {
    if (!selected) return;
    const ok = window.confirm(`Soft delete "${outlet.name}"? This will mark the outlet inactive.`);
    if (!ok) return;

    setDeletingOutletId(outlet.id);
    try {
      const response = await fetch('/api/admin/outlets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: selected.id, outletId: outlet.id }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to delete outlet');
      }

      toast.success(`Outlet "${outlet.name}" deactivated`);
      await loadOutlets(selected.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete outlet');
    } finally {
      setDeletingOutletId(null);
    }
  };

  const logAudit = async (action: string, entity: string, details: string) => {
    try {
      await supabase.from('audit_logs').insert({
        staff_name: 'Superadmin',
        staff_role: 'superadmin',
        action,
        entity,
        details,
        superadmin_id: superadminId,
        severity: 'info',
        outlet: 'platform',
      });
    } catch {
      // Audit log failure should not block the main action
    }
  };

  const handleToggleActive = async (r: Restaurant) => {
    const { error: err } = await supabase
      .from('restaurants')
      .update({ is_active: !r.is_active })
      .eq('id', r.id);
    if (!err) {
      setRestaurants((prev) =>
        prev.map((x) => x.id === r.id ? { ...x, is_active: !r.is_active } : x)
      );
      if (selected?.id === r.id) setSelected({ ...r, is_active: !r.is_active });
      await logAudit(
        r.is_active ? 'restaurant_deactivated' : 'restaurant_activated',
        'restaurant',
        `Restaurant "${r.name}" (id: ${r.id}) ${r.is_active ? 'deactivated' : 'activated'}`
      );
    }
  };

  const handleChangePlan = async (r: Restaurant, plan: string) => {
    if (r.plan === plan) return; // no-op if same plan
    const oldPlan = r.plan;
    const { error: err } = await supabase
      .from('restaurants')
      .update({ plan })
      .eq('id', r.id);
    if (!err) {
      // Record the plan change for pro-rated billing
      await supabase.from('plan_change_history').insert({
        restaurant_id: r.id,
        old_plan: oldPlan,
        new_plan: plan,
        changed_at: new Date().toISOString(),
        changed_by: superadminId,
      });

      setRestaurants((prev) =>
        prev.map((x) => x.id === r.id ? { ...x, plan } : x)
      );
      if (selected?.id === r.id) setSelected({ ...r, plan });
      await logAudit(
        'plan_changed',
        'restaurant',
        `Plan changed for "${r.name}" (id: ${r.id}) from "${oldPlan}" to "${plan}"`
      );
    }
  };

  const handleDeleteRestaurant = async (r: Restaurant) => {
    const ok = window.confirm(
      `Delete restaurant "${r.name}" permanently? This cannot be undone.`
    );
    if (!ok) return;

    setError('');
    try {
      const { count: outletCount, error: outletCountError } = await supabase
        .from('outlets')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', r.id);

      if (outletCountError) throw outletCountError;

      if ((outletCount || 0) > 0) {
        setError(`Cannot delete \"${r.name}\" because it still has ${(outletCount || 0)} outlet(s). Remove outlets first or deactivate the restaurant.`);
        return;
      }

      const { error: deleteError } = await supabase
        .from('restaurants')
        .delete()
        .eq('id', r.id);

      if (deleteError) throw deleteError;

      if (selected?.id === r.id) {
        setSelected(null);
        setOutlets([]);
      }

      await logAudit(
        'restaurant_deleted',
        'restaurant',
        `Restaurant "${r.name}" (id: ${r.id}) permanently deleted by superadmin`
      );

      await loadRestaurants();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete restaurant');
    }
  };

  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      const response = await fetch('/api/superadmin/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to create restaurant');
      }

      setShowAdd(false);
      setAddData({
        name: '', ownerName: '', ownerEmail: '', phone: '', cuisineType: '',
        gstin: '', fssai: '', website: '', address: '', city: '', state: '',
        pincode: '', seatingCapacity: '', plan: 'starter', onboardingStatus: 'active',
        outletName: '', outletAddress: '', outletPhone: '',
      });
      await loadRestaurants();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to create restaurant');
    } finally {
      setAddLoading(false);
    }
  };

  const handleOpenEdit = (r: Restaurant) => {
    setEditData({
      name: r.name || '',
      phone: r.phone || '',
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
      pincode: r.pincode || '',
      gstin: r.gstin || '',
      fssai: r.fssai || '',
      cuisine_type: r.cuisine_type || '',
      seating_capacity: r.seating_capacity ? String(r.seating_capacity) : '',
      website: r.website || '',
      onboarding_status: r.onboarding_status || 'pending',
    });
    setEditError('');
    setShowEdit(true);
  };

  const handleEditRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setEditError('');
    setEditLoading(true);
    try {
      const updates: Record<string, any> = {
        name: editData.name.trim(),
        phone: editData.phone.trim() || null,
        address: editData.address.trim() || null,
        city: editData.city.trim() || null,
        state: editData.state.trim() || null,
        pincode: editData.pincode.trim() || null,
        gstin: editData.gstin.trim() || null,
        fssai: editData.fssai.trim() || null,
        cuisine_type: editData.cuisine_type.trim() || null,
        seating_capacity: editData.seating_capacity ? parseInt(editData.seating_capacity) : null,
        website: editData.website.trim() || null,
        onboarding_status: editData.onboarding_status,
        updated_at: new Date().toISOString(),
      };

      const { error: err } = await supabase
        .from('restaurants')
        .update(updates)
        .eq('id', selected.id);

      if (err) throw err;

      const updated = { ...selected, ...updates };
      setRestaurants((prev) => prev.map((x) => x.id === selected.id ? updated : x));
      setSelected(updated);

      await logAudit(
        'restaurant_updated',
        'restaurant',
        `Restaurant "${selected.name}" (id: ${selected.id}) details updated by superadmin`
      );

      setShowEdit(false);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update restaurant');
    } finally {
      setEditLoading(false);
    }
  };

  const filtered = restaurants.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.city?.toLowerCase().includes(search.toLowerCase());
    const matchPlan = !filterPlan || r.plan === filterPlan;
    const matchStatus = !filterStatus || (filterStatus === 'active' ? r.is_active : !r.is_active);
    return matchSearch && matchPlan && matchStatus;
  });

  const planColor = (plan: string) => {
    if (plan === 'enterprise') return 'bg-purple-500/15 text-purple-400 border-purple-500/20';
    if (plan === 'growth') return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    if (plan === 'starter') return 'bg-green-500/15 text-green-400 border-green-500/20';
    return 'bg-secondary text-muted-foreground border-border';
  };

  // ── Render ─────────────────────────────────────────────────────
  if (accessChecking) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <ShieldOff size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mb-1">
            This panel is only accessible to platform superadmins.
          </p>
          <p className="text-xs text-muted-foreground">Contact the platform owner if you believe this is a mistake.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Shield size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Superadmin Panel</h1>
          {/* Edit Outlet Modal */}
          {showOutletEdit && editingOutlet && selected && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Edit Outlet</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{editingOutlet.name}</p>
                  </div>
                  <button onClick={() => { setShowOutletEdit(false); setEditingOutlet(null); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Name *</label>
                    <input
                      value={outletForm.name}
                      onChange={(e) => setOutletForm((s) => ({ ...s, name: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Address</label>
                    <textarea
                      value={outletForm.address}
                      onChange={(e) => setOutletForm((s) => ({ ...s, address: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-secondary px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Active</p>
                      <p className="text-[11px] text-muted-foreground">Inactive outlets are hidden from staff views</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOutletForm((s) => ({ ...s, is_active: !s.is_active }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${outletForm.is_active ? 'bg-green-500' : 'bg-secondary border border-border'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${outletForm.is_active ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setShowOutletEdit(false); setEditingOutlet(null); }}
                      className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveOutlet}
                      disabled={savingOutlet}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {savingOutlet ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                      {savingOutlet ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

            <p className="text-xs text-muted-foreground">RestroOS Platform Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'restaurants' && (
            <>
              <button
                onClick={loadRestaurants}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Refresh"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus size={13} />
                Add Restaurant
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary border border-border transition-colors"
            title="Logout"
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card px-6">
        <div className="flex gap-0">
          <button
            onClick={() => setActiveTab('restaurants')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'restaurants' ?'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Building2 size={14} />
            Restaurants
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'invoices' ?'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt size={14} />
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('scheduler')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'scheduler' ?'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarClock size={14} />
            Billing Scheduler
          </button>
          <button
            onClick={() => setActiveTab('saas')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'saas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingUp size={14} />
            SaaS Metrics
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'audit' ?'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList size={14} />
            Audit Log
          </button>
          <button
            onClick={() => setActiveTab('planaudit')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'planaudit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt size={14} />
            Plan Changes
          </button>
        </div>
      </div>

      {/* Audit Log Tab */}
      {activeTab === 'audit' && <AuditLogDashboard />}

      {/* Plan Change Audit Tab */}
      {activeTab === 'planaudit' && <PlanChangeAudit />}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && <InvoicesDashboard />}

      {/* Billing Scheduler Tab */}
      {activeTab === 'scheduler' && <SubscriptionScheduler />}

      {/* SaaS Metrics Tab */}
      {activeTab === 'saas' && <SaasMetricsDashboard />}

      {/* Restaurants Tab */}
      {activeTab === 'restaurants' && (
        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Restaurants', value: stats.total, icon: <Building2 size={16} />, color: 'text-primary' },
              { label: 'Active', value: stats.active, icon: <Check size={16} />, color: 'text-green-400' },
              { label: 'Pending Onboarding', value: stats.pending, icon: <AlertCircle size={16} />, color: 'text-amber-400' },
              { label: 'Enterprise', value: stats.enterprise, icon: <TrendingUp size={16} />, color: 'text-purple-400' },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                <div className={`${s.color} mb-2`}>{s.icon}</div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Restaurant list */}
            <div className="flex-1 min-w-0">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search restaurants…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  />
                </div>
                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                >
                  <option value="">All Plans</option>
                  {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No restaurants found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className={`bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary/40 ${
                        selected?.id === r.id ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Utensils size={15} className="text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${planColor(r.plan)}`}>
                                {r.plan}
                              </span>
                              {r.onboarding_status === 'pending' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
                                  Pending
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {r.city && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin size={10} />
                                  {r.city}
                                </span>
                              )}
                              {r.cuisine_type && (
                                <span className="text-xs text-muted-foreground">{r.cuisine_type}</span>
                              )}
                              <span className="text-xs text-muted-foreground">{r.outlet_count} outlet{r.outlet_count !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRestaurant(r); }}
                            className="p-1.5 rounded-lg transition-colors text-red-400 hover:bg-red-500/10"
                            title="Delete restaurant"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(r); }}
                            className={`p-1.5 rounded-lg transition-colors ${r.is_active ? 'text-green-400 hover:bg-green-500/10' : 'text-muted-foreground hover:bg-secondary'}`}
                            title={r.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {r.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="w-full lg:w-80 flex-shrink-0">
                <div className="bg-card border border-border rounded-xl overflow-hidden sticky top-6">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-bold text-foreground">Restaurant Details</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteRestaurant(selected)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete restaurant"
                      >
                        <Trash2 size={13} />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(selected)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit restaurant details"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setSelected(null)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Name & status */}
                    <div>
                      <p className="text-base font-bold text-foreground">{selected.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${selected.is_active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {selected.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${planColor(selected.plan)}`}>
                          {selected.plan}
                        </span>
                      </div>
                    </div>

                    {/* Info rows */}
                    <div className="space-y-2 text-xs">
                      {selected.city && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin size={11} className="flex-shrink-0" />
                          <span>{selected.city}{selected.state ? `, ${selected.state}` : ''}{selected.pincode ? ` - ${selected.pincode}` : ''}</span>
                        </div>
                      )}
                      {selected.address && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                          <span>{selected.address}</span>
                        </div>
                      )}
                      {selected.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">📞</span>
                          <span>{selected.phone}</span>
                        </div>
                      )}
                      {selected.cuisine_type && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Utensils size={11} className="flex-shrink-0" />
                          <span>{selected.cuisine_type}</span>
                        </div>
                      )}
                      {selected.gstin && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Shield size={11} className="flex-shrink-0" />
                          <span className="font-mono">GSTIN: {selected.gstin}</span>
                        </div>
                      )}
                      {selected.fssai && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Shield size={11} className="flex-shrink-0" />
                          <span className="font-mono">FSSAI: {selected.fssai}</span>
                        </div>
                      )}
                      {selected.website && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-[10px]">🌐</span>
                          <a href={selected.website} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors">{selected.website}</a>
                        </div>
                      )}
                      {selected.seating_capacity && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-[10px]">🪑</span>
                          <span>{selected.seating_capacity} seats</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 size={11} className="flex-shrink-0" />
                        <span>{selected.outlet_count} outlet{selected.outlet_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Plan change */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Change Plan</label>
                      <div className="relative">
                        <select
                          value={selected.plan}
                          onChange={(e) => handleChangePlan(selected, e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none"
                        >
                          {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(selected)}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        selected.is_active
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' :'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                      }`}
                    >
                      {selected.is_active ? <ToggleLeft size={15} /> : <ToggleRight size={15} />}
                      {selected.is_active ? 'Deactivate Restaurant' : 'Activate Restaurant'}
                    </button>

                    {/* Outlets */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Outlets</p>
                      {outletsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 size={16} className="animate-spin text-primary" />
                        </div>
                      ) : outlets.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">No outlets</p>
                      ) : (
                        <div className="space-y-1.5">
                          {outlets.map((o) => (
                            <div key={o.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-secondary">
                              <MapPin size={11} className="text-accent flex-shrink-0 mt-1" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{o.name}</p>
                                    {o.address && <p className="text-[10px] text-muted-foreground truncate">{o.address}</p>}
                                  </div>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${o.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                                </div>
                                <div className="flex items-center gap-1.5 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditOutlet(o)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                  >
                                    <Pencil size={10} />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => softDeleteOutlet(o)}
                                    disabled={deletingOutletId === o.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-[10px] font-semibold text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
                                  >
                                    {deletingOutletId === o.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Restaurant Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="text-base font-bold text-foreground">Add New Restaurant</h3>
              <button onClick={() => { setShowAdd(false); setAddError(''); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddRestaurant} className="p-6 space-y-5">

              {/* Restaurant Info */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Restaurant Info</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Restaurant Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={addData.name}
                      onChange={(e) => setAddData((d) => ({ ...d, name: e.target.value }))}
                      placeholder="e.g. Spice Garden"
                      required
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Phone</label>
                      <input
                        type="tel"
                        value={addData.phone}
                        onChange={(e) => setAddData((d) => ({ ...d, phone: e.target.value }))}
                        placeholder="+91 98765 43210"
                        required
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cuisine Type</label>
                      <input
                        type="text"
                        value={addData.cuisineType}
                        onChange={(e) => setAddData((d) => ({ ...d, cuisineType: e.target.value }))}
                        placeholder="North Indian, Chinese…"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">GSTIN</label>
                      <input
                        type="text"
                        value={addData.gstin}
                        onChange={(e) => setAddData((d) => ({ ...d, gstin: e.target.value }))}
                        placeholder="22AAAAA0000A1Z5"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">FSSAI License</label>
                      <input
                        type="text"
                        value={addData.fssai}
                        onChange={(e) => setAddData((d) => ({ ...d, fssai: e.target.value }))}
                        placeholder="10012345678901"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Website</label>
                    <input
                      type="url"
                      value={addData.website}
                      onChange={(e) => setAddData((d) => ({ ...d, website: e.target.value }))}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Owner Details */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Owner Details</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Owner Full Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={addData.ownerName}
                      onChange={(e) => setAddData((d) => ({ ...d, ownerName: e.target.value }))}
                      placeholder="Rahul Sharma"
                      required
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Owner Email <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={addData.ownerEmail}
                      onChange={(e) => setAddData((d) => ({ ...d, ownerEmail: e.target.value }))}
                      placeholder="owner@restaurant.com"
                      required
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Location</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Street Address</label>
                    <input
                      type="text"
                      value={addData.address}
                      onChange={(e) => setAddData((d) => ({ ...d, address: e.target.value }))}
                      placeholder="123 MG Road"
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">City <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={addData.city}
                        onChange={(e) => setAddData((d) => ({ ...d, city: e.target.value }))}
                        placeholder="Bengaluru"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">State</label>
                      <input
                        type="text"
                        value={addData.state}
                        onChange={(e) => setAddData((d) => ({ ...d, state: e.target.value }))}
                        placeholder="Karnataka"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pincode</label>
                      <input
                        type="text"
                        value={addData.pincode}
                        onChange={(e) => setAddData((d) => ({ ...d, pincode: e.target.value }))}
                        placeholder="560001"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Seating Capacity</label>
                      <input
                        type="number"
                        min="0"
                        value={addData.seatingCapacity}
                        onChange={(e) => setAddData((d) => ({ ...d, seatingCapacity: e.target.value }))}
                        placeholder="50"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Plan & Status */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Plan & Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Subscription Plan <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        value={addData.plan}
                        onChange={(e) => setAddData((d) => ({ ...d, plan: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none"
                      >
                        {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Onboarding Status</label>
                    <div className="relative">
                      <select
                        value={addData.onboardingStatus}
                        onChange={(e) => setAddData((d) => ({ ...d, onboardingStatus: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none"
                      >
                        <option value="active">Active</option>
                        <option value="trial">Trial</option>
                        <option value="pending">Pending</option>
                        <option value="suspended">Suspended</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* First Outlet */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">First Outlet</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Name</label>
                    <input
                      type="text"
                      value={addData.outletName}
                      onChange={(e) => setAddData((d) => ({ ...d, outletName: e.target.value }))}
                      placeholder="Main Branch"
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Address</label>
                      <input
                        type="text"
                        value={addData.outletAddress}
                        onChange={(e) => setAddData((d) => ({ ...d, outletAddress: e.target.value }))}
                        placeholder="Same as restaurant"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Outlet Phone</label>
                      <input
                        type="tel"
                        value={addData.outletPhone}
                        onChange={(e) => setAddData((d) => ({ ...d, outletPhone: e.target.value }))}
                        placeholder="+91 98765 43210"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {addError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {addError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setAddError(''); }}
                  className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading || !addData.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {addLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {addLoading ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Restaurant Modal */}
      {showEdit && selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h3 className="text-base font-bold text-foreground">Edit Restaurant</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.name}</p>
              </div>
              <button onClick={() => { setShowEdit(false); setEditError(''); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEditRestaurant} className="p-6 space-y-4">
              {/* Basic Info */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Basic Information</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Restaurant Name *</label>
                    <input
                      type="text"
                      value={editData.name}
                      onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                      required
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Phone</label>
                      <input
                        type="text"
                        value={editData.phone}
                        onChange={(e) => setEditData((d) => ({ ...d, phone: e.target.value }))}
                        placeholder="+91 98765 43210"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cuisine Type</label>
                      <input
                        type="text"
                        value={editData.cuisine_type}
                        onChange={(e) => setEditData((d) => ({ ...d, cuisine_type: e.target.value }))}
                        placeholder="North Indian, Chinese…"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Seating Capacity</label>
                      <input
                        type="number"
                        value={editData.seating_capacity}
                        onChange={(e) => setEditData((d) => ({ ...d, seating_capacity: e.target.value }))}
                        placeholder="50"
                        min="0"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Website</label>
                      <input
                        type="url"
                        value={editData.website}
                        onChange={(e) => setEditData((d) => ({ ...d, website: e.target.value }))}
                        placeholder="https://example.com"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Address</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Street Address</label>
                    <input
                      type="text"
                      value={editData.address}
                      onChange={(e) => setEditData((d) => ({ ...d, address: e.target.value }))}
                      placeholder="123 Main Street, Area"
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">City</label>
                      <input
                        type="text"
                        value={editData.city}
                        onChange={(e) => setEditData((d) => ({ ...d, city: e.target.value }))}
                        placeholder="Bengaluru"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">State</label>
                      <input
                        type="text"
                        value={editData.state}
                        onChange={(e) => setEditData((d) => ({ ...d, state: e.target.value }))}
                        placeholder="Karnataka"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pincode</label>
                      <input
                        type="text"
                        value={editData.pincode}
                        onChange={(e) => setEditData((d) => ({ ...d, pincode: e.target.value }))}
                        placeholder="560001"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Compliance */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Compliance & Status</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">GSTIN</label>
                      <input
                        type="text"
                        value={editData.gstin}
                        onChange={(e) => setEditData((d) => ({ ...d, gstin: e.target.value.toUpperCase() }))}
                        placeholder="22AAAAA0000A1Z5"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">FSSAI License</label>
                      <input
                        type="text"
                        value={editData.fssai}
                        onChange={(e) => setEditData((d) => ({ ...d, fssai: e.target.value }))}
                        placeholder="12345678901234"
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Onboarding Status</label>
                    <div className="relative">
                      <select
                        value={editData.onboarding_status}
                        onChange={(e) => setEditData((d) => ({ ...d, onboarding_status: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="suspended">Suspended</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {editError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {editError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEdit(false); setEditError(''); }}
                  className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading || !editData.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
