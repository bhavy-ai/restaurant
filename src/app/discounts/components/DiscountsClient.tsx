'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { captureException } from '@/lib/errorTracking';
import { Tag, Plus, Edit3, Trash2, X, Save, Clock, Percent, IndianRupee, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';

interface Discount {
  id: string;
  name: string;
  type: string;
  value: number;
  code: string;
  minOrderValue: number;
  maxDiscountValue: number | null;
  appliesTo: string;
  happyHourStart: string | null;
  happyHourEnd: string | null;
  happyHourDays: string[];
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

const defaultForm = {
  name: '', type: 'percent', value: '', code: '', minOrderValue: '0',
  maxDiscountValue: '', appliesTo: 'bill', happyHourStart: '', happyHourEnd: '',
  happyHourDays: [] as string[], usageLimit: '', validFrom: '', validUntil: '', active: true,
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DiscountsClient() {
  const supabase = createClient();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.from('discounts').select('*').eq('outlet', 'koramangala').order('created_at', { ascending: false });
      if (error) throw error;
      setDiscounts((data || []).map((r: any) => ({
        id: r.id, name: r.name, type: r.type, value: Number(r.value), code: r.code || '',
        minOrderValue: Number(r.min_order_value), maxDiscountValue: r.max_discount_value ? Number(r.max_discount_value) : null,
        appliesTo: r.applies_to, happyHourStart: r.happy_hour_start, happyHourEnd: r.happy_hour_end,
        happyHourDays: r.happy_hour_days || [], usageLimit: r.usage_limit, usageCount: r.usage_count,
        active: r.active, validFrom: r.valid_from, validUntil: r.valid_until,
      })));
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load discounts');
      captureException(e, { component: 'DiscountsClient', action: 'load' });
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingDiscount(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const openEdit = (d: Discount) => {
    setEditingDiscount(d);
    setForm({
      name: d.name, type: d.type, value: String(d.value), code: d.code,
      minOrderValue: String(d.minOrderValue), maxDiscountValue: d.maxDiscountValue ? String(d.maxDiscountValue) : '',
      appliesTo: d.appliesTo, happyHourStart: d.happyHourStart || '', happyHourEnd: d.happyHourEnd || '',
      happyHourDays: d.happyHourDays, usageLimit: d.usageLimit ? String(d.usageLimit) : '',
      validFrom: d.validFrom || '', validUntil: d.validUntil || '', active: d.active,
    });
    setShowForm(true);
  };

  const saveDiscount = async () => {
    if (!form.name.trim()) { toast.error('Discount name is required'); return; }
    if (!form.value || Number(form.value) <= 0) { toast.error('Enter a valid discount value'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: form.type, value: Number(form.value),
        code: form.code.trim().toUpperCase() || null,
        min_order_value: Number(form.minOrderValue) || 0,
        max_discount_value: form.maxDiscountValue ? Number(form.maxDiscountValue) : null,
        applies_to: form.appliesTo,
        happy_hour_start: form.happyHourStart || null, happy_hour_end: form.happyHourEnd || null,
        happy_hour_days: form.happyHourDays,
        usage_limit: form.usageLimit ? Number(form.usageLimit) : null,
        valid_from: form.validFrom || null, valid_until: form.validUntil || null,
        active: form.active, outlet: 'koramangala',
      };
      if (editingDiscount) {
        const { error } = await supabase.from('discounts').update(payload).eq('id', editingDiscount.id);
        if (error) throw error;
        toast.success('Discount updated');
      } else {
        const { error } = await supabase.from('discounts').insert(payload);
        if (error) throw error;
        toast.success('Discount created');
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      captureException(e, { component: 'DiscountsClient', action: 'saveDiscount' });
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteDiscount = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from('discounts').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted');
      load();
    } catch (e: any) {
      captureException(e, { component: 'DiscountsClient', action: 'deleteDiscount' });
      toast.error(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (d: Discount) => {
    try {
      await supabase.from('discounts').update({ active: !d.active }).eq('id', d.id);
      setDiscounts(prev => prev.map(x => x.id === d.id ? { ...x, active: !x.active } : x));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const typeIcon = (type: string) => {
    if (type === 'percent' || type === 'happy_hour') return <Percent size={13} className="text-primary" />;
    return <IndianRupee size={13} className="text-accent" />;
  };

  const typeLabel = (type: string) => ({ percent: '% Off', flat: 'Flat ₹', happy_hour: 'Happy Hour %', item_level: 'Item Level' }[type] || type);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Tag size={22} className="text-primary" /> Discount & Coupon Engine</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Promo codes, item discounts & happy hour rules</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={15} /> New Discount
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Discounts', value: discounts.length },
          { label: 'Active', value: discounts.filter(d => d.active).length },
          { label: 'Happy Hour Rules', value: discounts.filter(d => d.type === 'happy_hour').length },
          { label: 'Total Redemptions', value: discounts.reduce((s, d) => s + d.usageCount, 0) },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {loading ? <span className="inline-block w-12 h-6 bg-secondary animate-pulse rounded" /> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{loadError}</span>
          <button onClick={load} className="ml-auto text-xs underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Discount List */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-secondary animate-pulse" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 bg-secondary animate-pulse rounded w-32" />
                  <div className="h-3 bg-secondary animate-pulse rounded w-20" />
                </div>
              </div>
              <div className="h-6 bg-secondary animate-pulse rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {discounts.map(d => (
            <div key={d.id} className={`bg-card border rounded-xl p-4 ${d.active ? 'border-border' : 'border-border/40 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {typeIcon(d.type)}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(d.type)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(d)} className="text-muted-foreground hover:text-foreground">
                    {d.active ? <ToggleRight size={20} className="text-accent" /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => openEdit(d)} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"><Edit3 size={13} /></button>
                  <button onClick={() => deleteDiscount(d.id)} disabled={deleting === d.id} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-destructive">
                    {deleting === d.id ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-bold text-primary">{d.type === 'flat' ? `₹${d.value}` : `${d.value}%`}</span>
                {d.code && <span className="text-xs bg-secondary border border-border px-2 py-0.5 rounded font-mono">{d.code}</span>}
                {d.minOrderValue > 0 && <span className="text-xs text-muted-foreground">Min ₹{d.minOrderValue}</span>}
                {d.type === 'happy_hour' && d.happyHourStart && (
                  <span className="text-xs text-amber-400 flex items-center gap-1"><Clock size={10} />{d.happyHourStart}–{d.happyHourEnd}</span>
                )}
              </div>
              {d.usageLimit && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Usage</span><span>{d.usageCount}/{d.usageLimit}</span>
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (d.usageCount / d.usageLimit) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {discounts.length === 0 && !loadError && (
            <div className="col-span-2 flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-3">
                <Tag size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No discounts yet</p>
              <p className="text-xs text-muted-foreground mb-4">Create your first promo code or happy hour rule</p>
              <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
                <Plus size={12} /> New Discount
              </button>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto py-6">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{editingDiscount ? 'Edit Discount' : 'New Discount'}</h3>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Discount name *" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                  <option value="percent">Percentage Off</option>
                  <option value="flat">Flat Amount Off</option>
                  <option value="happy_hour">Happy Hour</option>
                  <option value="item_level">Item Level</option>
                </select>
                <input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder={form.type === 'flat' ? 'Amount (₹)' : 'Percentage (%)'} type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="Promo code (optional)" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono" />
                <input value={form.minOrderValue} onChange={e => setForm(p => ({ ...p, minOrderValue: e.target.value }))} placeholder="Min order value (₹)" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
              {form.type === 'happy_hour' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">Start Time</label><input type="time" value={form.happyHourStart} onChange={e => setForm(p => ({ ...p, happyHourStart: e.target.value }))} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">End Time</label><input type="time" value={form.happyHourEnd} onChange={e => setForm(p => ({ ...p, happyHourEnd: e.target.value }))} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Active Days</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS.map(day => (
                        <button key={day} onClick={() => setForm(p => ({ ...p, happyHourDays: p.happyHourDays.includes(day) ? p.happyHourDays.filter(d => d !== day) : [...p.happyHourDays, day] }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${form.happyHourDays.includes(day) ? 'bg-primary/20 text-primary border-primary/40' : 'bg-secondary border-border text-muted-foreground'}`}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <input value={form.usageLimit} onChange={e => setForm(p => ({ ...p, usageLimit: e.target.value }))} placeholder="Usage limit (optional)" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
                <input value={form.maxDiscountValue} onChange={e => setForm(p => ({ ...p, maxDiscountValue: e.target.value }))} placeholder="Max discount (₹)" type="number" className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground mb-1 block">Valid From</label><input type="date" value={form.validFrom} onChange={e => setForm(p => ({ ...p, validFrom: e.target.value }))} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">Valid Until</label><input type="date" value={form.validUntil} onChange={e => setForm(p => ({ ...p, validUntil: e.target.value }))} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="rounded" />
                <span className="text-sm text-foreground">Active</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground">Cancel</button>
              <button onClick={saveDiscount} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
                {editingDiscount ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
