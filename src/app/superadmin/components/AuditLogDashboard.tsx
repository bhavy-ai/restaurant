'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search, Download, RefreshCw, Filter, AlertCircle, Loader2,
  ClipboardList, ChevronLeft, ChevronRight, Calendar, X
} from 'lucide-react';

interface AuditLog {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  details: string;
  staff_name: string;
  staff_role: string;
  superadmin_id: string | null;
  outlet: string | null;
  severity: string | null;
}

const ACTION_OPTIONS = [
  'restaurant_activated',
  'restaurant_deactivated',
  'plan_changed',
  'restaurant_created',
  'staff_access_granted',
  'error',
];

const PAGE_SIZE = 20;

const supabase = createClient();

export default function AuditLogDashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterRestaurant, setFilterRestaurant] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Restaurant list for filter dropdown
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);

  const loadRestaurants = useCallback(async () => {
    const { data } = await supabase
      .from('restaurants')
      .select('id, name')
      .order('name');
    setRestaurants(data || []);
  }, [supabase]);

  const loadLogs = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterAction) query = query.eq('action', filterAction);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');
      if (search) {
        query = query.or(
          `staff_name.ilike.%${search}%,entity.ilike.%${search}%,details.ilike.%${search}%`
        );
      }
      if (filterRestaurant) {
        query = query.ilike('details', `%${filterRestaurant}%`);
      }

      const { data, error: err, count } = await query;
      if (err) throw err;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [supabase, filterAction, filterDateFrom, filterDateTo, search, filterRestaurant]);

  useEffect(() => { loadRestaurants(); }, [loadRestaurants]);
  useEffect(() => { setPage(0); }, [filterAction, filterDateFrom, filterDateTo, search, filterRestaurant]);
  useEffect(() => { loadLogs(page); }, [loadLogs, page]);

  const handleExportCSV = async () => {
    // Fetch all matching logs (no pagination) for export
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterAction) query = query.eq('action', filterAction);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');
      if (search) {
        query = query.or(
          `staff_name.ilike.%${search}%,entity.ilike.%${search}%,details.ilike.%${search}%`
        );
      }
      if (filterRestaurant) {
        query = query.ilike('details', `%${filterRestaurant}%`);
      }

      const { data } = await query;
      if (!data || data.length === 0) return;

      const headers = ['ID', 'Timestamp', 'Action', 'Entity', 'Details', 'Staff Name', 'Staff Role', 'Outlet', 'Severity'];
      const rows = data.map((log: AuditLog) => [
        log.id,
        new Date(log.created_at).toISOString(),
        log.action,
        log.entity || '',
        `"${(log.details || '').replace(/"/g, '""')}"`,
        log.staff_name || '',
        log.staff_role || '',
        log.outlet || '',
        log.severity || '',
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent fail
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterAction('');
    setFilterRestaurant('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasFilters = search || filterAction || filterRestaurant || filterDateFrom || filterDateTo;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const actionColor = (action: string) => {
    if (action.includes('deactivated') || action === 'error') return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (action.includes('activated')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (action.includes('plan_changed')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (action.includes('created')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (action.includes('staff')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-secondary text-muted-foreground border-border';
  };

  const formatAction = (action: string) =>
    action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <ClipboardList size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Audit Log</h1>
            <p className="text-xs text-muted-foreground">
              {totalCount.toLocaleString()} total records
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadLogs(page)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Filter size={12} />
            Filters
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center gap-1 text-primary hover:text-primary/80 normal-case tracking-normal font-medium transition-colors"
              >
                <X size={11} />
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by superadmin, entity, details…"
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
            </div>

            {/* Action filter */}
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            >
              <option value="">All Actions</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>{formatAction(a)}</option>
              ))}
            </select>

            {/* Restaurant filter */}
            <select
              value={filterRestaurant}
              onChange={(e) => setFilterRestaurant(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            >
              <option value="">All Restaurants</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>

            {/* Date range */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full pl-7 pr-2 py-2 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  title="From date"
                />
              </div>
              <div className="relative flex-1">
                <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full pl-7 pr-2 py-2 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  title="To date"
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No audit logs found</p>
              {hasFilters && (
                <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Entity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Performed By</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${actionColor(log.action)}`}>
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap capitalize">
                        {log.entity || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                        <span className="line-clamp-2">{log.details || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">
                        {log.staff_name || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                          {log.staff_role || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()} records
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 font-medium text-foreground">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
