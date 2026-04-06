'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Users, Plus, Search, Phone, Mail, ShoppingBag, Edit3, X, Save, Tag, AlertCircle } from 'lucide-react';
import { captureException } from '@/lib/errorTracking';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  tags: string[];
  notes: string;
  createdAt: string;
}

interface CustomerOrder {
  id: string;
  amount: number;
  itemsSummary: string;
  createdAt: string;
}

interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
}

const defaultForm = { name: '', phone: '', email: '', address: '', notes: '', tags: '' };

function validateForm(form: typeof defaultForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) {
    errors.name = 'Full name is required';
  } else if (form.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }
  if (form.phone.trim() && !/^[6-9]\d{9}$/.test(form.phone.trim())) {
    errors.phone = 'Enter a valid 10-digit Indian mobile number';
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  return errors;
}

export default function CustomerClient() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.from('customers').select('*').eq('outlet', 'koramangala').order('total_spent', { ascending: false });
      if (error) throw error;
      setCustomers((data || []).map((r: any) => ({
        id: r.id, name: r.name, phone: r.phone || '', email: r.email || '',
        address: r.address || '', loyaltyPoints: r.loyalty_points, totalSpent: Number(r.total_spent),
        visitCount: r.visit_count, tags: r.tags || [], notes: r.notes || '', createdAt: r.created_at,
      })));
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load customers');
      captureException(e, { component: 'CustomerClient', action: 'loadCustomers' });
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const loadOrders = async (customerId: string) => {
    setLoadingOrders(true);
    try {
      const { data } = await supabase.from('customer_orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20);
      setOrders((data || []).map((r: any) => ({ id: r.id, amount: Number(r.amount), itemsSummary: r.items_summary || '', createdAt: r.created_at })));
    } catch (e: any) {
      captureException(e, { component: 'CustomerClient', action: 'loadOrders' });
    } finally {
      setLoadingOrders(false);
    }
  };

  const selectCustomer = (c: Customer) => {
    setSelected(c);
    loadOrders(c.id);
  };

  const openAdd = () => {
    setEditingCustomer(null);
    setForm(defaultForm);
    setFormErrors({});
    setTouched({});
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({ name: c.name, phone: c.phone, email: c.email, address: c.address, notes: c.notes, tags: c.tags.join(', ') });
    setFormErrors({});
    setTouched({});
    setShowForm(true);
  };

  const handleFieldChange = (field: keyof typeof defaultForm, value: string) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (touched[field]) {
      setFormErrors(validateForm(updated));
    }
  };

  const handleFieldBlur = (field: keyof typeof defaultForm) => {
    setTouched(p => ({ ...p, [field]: true }));
    setFormErrors(validateForm(form));
  };

  const saveCustomer = async () => {
    // Mark all fields as touched and validate
    setTouched({ name: true, phone: true, email: true });
    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null,
        address: form.address.trim() || null, notes: form.notes.trim() || null,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        outlet: 'koramangala',
      };
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingCustomer.id);
        if (error) throw error;
        toast.success('Customer updated');
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
        toast.success('Customer added');
      }
      setShowForm(false);
      loadCustomers();
    } catch (e: any) {
      captureException(e, { component: 'CustomerClient', action: 'saveCustomer' });
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const tierLabel = (points: number) => {
    if (points >= 500) return { label: 'Gold', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
    if (points >= 200) return { label: 'Silver', color: 'text-slate-300 bg-slate-300/10 border-slate-300/30' };
    return { label: 'Bronze', color: 'text-amber-600 bg-amber-600/10 border-amber-600/30' };
  };

  const inputClass = (field: keyof FormErrors) =>
    `w-full bg-secondary border rounded-lg px-3 py-2 text-sm text-foreground transition-colors ${
      formErrors[field] && touched[field]
        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/30' :'border-border focus:border-primary/60'
    }`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Users size={22} className="text-primary" /> Customer Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Profiles, order history &amp; loyalty tracking</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={15} /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Customers', value: customers.length },
          { label: 'Gold Members', value: customers.filter(c => c.loyaltyPoints >= 500).length },
          { label: 'Avg Spend', value: `₹${customers.length ? Math.round(customers.reduce((s, c) => s + c.totalSpent, 0) / customers.length) : 0}` },
          { label: 'Total Revenue', value: `₹${customers.reduce((s, c) => s + c.totalSpent, 0).toLocaleString('en-IN')}` },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{loading ? <span className="inline-block w-16 h-6 bg-secondary animate-pulse rounded" /> : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{loadError}</span>
          <button onClick={loadCustomers} className="ml-auto text-xs underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Customer List */}
        <div className="col-span-3 bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or email..." className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground" />
            </div>
          </div>
          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-secondary animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-secondary animate-pulse rounded w-32" />
                    <div className="h-3 bg-secondary animate-pulse rounded w-24" />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <div className="h-3.5 bg-secondary animate-pulse rounded w-16" />
                    <div className="h-3 bg-secondary animate-pulse rounded w-12" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-3">
                    <Users size={24} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {search ? 'No customers match your search' : 'No customers yet'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {search ? 'Try a different name, phone, or email' : 'Add your first customer to get started'}
                  </p>
                  {!search && (
                    <button onClick={openAdd} className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
                      <Plus size={12} /> Add Customer
                    </button>
                  )}
                </div>
              ) : (
                filtered.map(c => {
                  const tier = tierLabel(c.loyaltyPoints);
                  return (
                    <button key={c.id} onClick={() => selectCustomer(c)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors text-left ${selected?.id === c.id ? 'bg-primary/10' : ''}`}>
                      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">{c.name[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded-full ${tier.color}`}>{tier.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{c.phone} · {c.visitCount} visits</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-foreground">₹{c.totalSpent.toLocaleString('en-IN')}</p>
                        <p className="text-xs text-accent">{c.loyaltyPoints} pts</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Customer Detail */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{selected.name}</h3>
                    <span className={`text-[10px] border px-1.5 py-0.5 rounded-full ${tierLabel(selected.loyaltyPoints).color}`}>{tierLabel(selected.loyaltyPoints).label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {selected.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={11} />{selected.phone}</span>}
                    {selected.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail size={11} />{selected.email}</span>}
                  </div>
                </div>
                <button onClick={() => openEdit(selected)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground"><Edit3 size={14} /></button>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3 border-b border-border">
                <div className="text-center"><p className="text-xs text-muted-foreground">Total Spent</p><p className="text-base font-bold text-foreground">₹{selected.totalSpent.toLocaleString('en-IN')}</p></div>
                <div className="text-center"><p className="text-xs text-muted-foreground">Visits</p><p className="text-base font-bold text-foreground">{selected.visitCount}</p></div>
                <div className="text-center"><p className="text-xs text-muted-foreground">Points</p><p className="text-base font-bold text-accent">{selected.loyaltyPoints}</p></div>
              </div>
              {selected.tags.length > 0 && (
                <div className="px-4 py-3 border-b border-border flex flex-wrap gap-1">
                  {selected.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-secondary border border-border px-2 py-0.5 rounded-full text-muted-foreground flex items-center gap-1"><Tag size={9} />{tag}</span>
                  ))}
                </div>
              )}
              <div className="p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><ShoppingBag size={12} /> ORDER HISTORY</p>
                {loadingOrders ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5">
                        <div className="space-y-1">
                          <div className="h-3 bg-secondary animate-pulse rounded w-28" />
                          <div className="h-2.5 bg-secondary animate-pulse rounded w-16" />
                        </div>
                        <div className="h-4 bg-secondary animate-pulse rounded w-12" />
                      </div>
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <ShoppingBag size={20} className="text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">No orders yet for this customer</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {orders.map(o => (
                      <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <div>
                          <p className="text-xs text-foreground">{o.itemsSummary || 'Order'}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(o.createdAt).toLocaleDateString('en-IN')}</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">₹{o.amount}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Users size={32} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Select a customer to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              {/* Name */}
              <div>
                <input
                  value={form.name}
                  onChange={e => handleFieldChange('name', e.target.value)}
                  onBlur={() => handleFieldBlur('name')}
                  placeholder="Full name *"
                  className={inputClass('name')}
                />
                {formErrors.name && touched.name && (
                  <p className="flex items-center gap-1 text-xs text-red-400 mt-1"><AlertCircle size={11} />{formErrors.name}</p>
                )}
              </div>
              {/* Phone */}
              <div>
                <input
                  value={form.phone}
                  onChange={e => handleFieldChange('phone', e.target.value)}
                  onBlur={() => handleFieldBlur('phone')}
                  placeholder="Phone number"
                  className={inputClass('phone')}
                />
                {formErrors.phone && touched.phone && (
                  <p className="flex items-center gap-1 text-xs text-red-400 mt-1"><AlertCircle size={11} />{formErrors.phone}</p>
                )}
              </div>
              {/* Email */}
              <div>
                <input
                  value={form.email}
                  onChange={e => handleFieldChange('email', e.target.value)}
                  onBlur={() => handleFieldBlur('email')}
                  placeholder="Email address"
                  className={inputClass('email')}
                />
                {formErrors.email && touched.email && (
                  <p className="flex items-center gap-1 text-xs text-red-400 mt-1"><AlertCircle size={11} />{formErrors.email}</p>
                )}
              </div>
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma separated: vip, regular)" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground">Cancel</button>
              <button onClick={saveCustomer} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                {editingCustomer ? 'Update' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
