'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RefreshCw, AlertCircle, Loader2, ArrowRight, Building2,
  Search, ChevronLeft, ChevronRight, GitBranch,
} from 'lucide-react';

interface PlanChangeRecord {
  id: string;
  restaurant_id: string;
  old_plan: string;
  new_plan: string;
  changed_at: string;
  changed_by: string | null;
  restaurant?: { name: string; city?: string };
  superadmin?: { email?: string; full_name?: string };
}

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-green-500/15 text-green-400 border-green-500/20',
  growth: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  enterprise: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  free: 'bg-secondary text-muted-foreground border-border',
};

const PAGE_SIZE = 20;

const supabase = createClient();

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function PlanChangeAudit() {
  const [records, setRecords] = useState<PlanChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('plan_change_history')
        .select('*, restaurant:restaurants(name, city)', { count: 'exact' })
        .order('changed_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (filterPlan) {
        query = query.or(`old_plan.eq.${filterPlan},new_plan.eq.${filterPlan}`);
      }

      const { data, count, error: err } = await query;
      if (err) throw err;

      // Enrich with superadmin info where available
      const enriched: PlanChangeRecord[] = await Promise.all(
        (data || []).map(async (r: any) => {
          if (!r.changed_by) return r;
          const { data: sa } = await supabase
            .from('platform_superadmins')
            .select('id, user_id')
            .eq('id', r.changed_by)
            .maybeSingle();
          if (!sa) return r;
          const { data: u } = await supabase
            .from('auth.users')
            .select('email')
            .eq('id', sa.user_id)
            .maybeSingle()
            .catch(() => ({ data: null }));
          return { ...r, superadmin: { email: (u as any)?.email } };
        })
      );

      setRecords(enriched);
      setTotal(count || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load plan change history');
    } finally {
      setLoading(false);
    }
  }, [supabase, page, filterPlan]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const filtered = search
    ? records.filter((r) =>
        (r.restaurant as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
        r.old_plan.toLowerCase().includes(search.toLowerCase()) ||
        r.new_plan.toLowerCase().includes(search.toLowerCase())
      )
    : records;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const PLANS = ['free', 'starter', 'growth', 'enterprise'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <GitBranch size={18} className="text-primary" />
            Plan Change Audit
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full history of every subscription plan change across all restaurants
          </p>
        </div>
        <button
          onClick={loadRecords}
          disabled={loading}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors self-start"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by restaurant or plan…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
          />
        </div>
        <select
          value={filterPlan}
          onChange={(e) => { setFilterPlan(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
        >
          <option value="">All Plans</option>
          {PLANS.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Plan Changes
            {total > 0 && <span className="ml-2 text-xs text-muted-foreground font-normal">({total} total)</span>}
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <GitBranch size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No plan changes found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    {['Restaurant', 'Plan Change', 'Changed At', 'Changed By'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      {/* Restaurant */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 size={12} className="text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {(r.restaurant as any)?.name || r.restaurant_id.slice(0, 8) + '…'}
                            </p>
                            {(r.restaurant as any)?.city && (
                              <p className="text-muted-foreground">{(r.restaurant as any).city}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Plan Change */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[r.old_plan] || PLAN_COLORS.free}`}>
                            {r.old_plan}
                          </span>
                          <ArrowRight size={12} className="text-muted-foreground flex-shrink-0" />
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${PLAN_COLORS[r.new_plan] || PLAN_COLORS.free}`}>
                            {r.new_plan}
                          </span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(r.changed_at)}
                      </td>

                      {/* Changed By */}
                      <td className="px-4 py-3">
                        {r.changed_by ? (
                          <div>
                            <p className="text-foreground font-medium">Superadmin</p>
                            {r.superadmin?.email && (
                              <p className="text-muted-foreground truncate max-w-[160px]">{r.superadmin.email}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground font-mono">{r.changed_by.slice(0, 8)}…</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">System</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-2 py-1 text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
