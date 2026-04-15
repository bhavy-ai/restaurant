'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Users, Clock, Plus, Minus, UserCheck, ReceiptText, X, CheckCircle, Utensils, Loader2, Search, ShoppingCart, CreditCard, ChefHat, ArrowRight, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { tableService, menuService } from '@/lib/services/restaurantService';
import { auditService } from '@/lib/services/restaurantService';
import { offlineQueue, generateIdempotencyKey } from '@/lib/offlineQueue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import OfflineQueuePanel from '@/components/OfflineQueuePanel';
import { useAuth } from '@/contexts/AuthContext';

type TableStatus = 'available' | 'occupied' | 'bill_requested' | 'reserved' | 'cleaning';
type Section = 'Indoor' | 'Outdoor' | 'Bar' | 'Private Dining';

interface TableData {
  id: string;
  label: string;
  section: Section;
  capacity: number;
  status: TableStatus;
  covers?: number;
  captain?: string;
  seatedAt?: string;
  runningAmount?: number;
  reservedFor?: string;
  reservedAt?: string;
  kotCount?: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isVeg: boolean;
  gstRate: number;
  available: boolean;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  gstRate: number;
  isVeg: boolean;
  note?: string;
}

const sections: Section[] = ['Indoor', 'Outdoor', 'Bar', 'Private Dining'];
const CAPTAINS = ['Arjun Nair', 'Priya Menon', 'Deepak Singh', 'Meera Pillai'];

const statusConfig: Record<TableStatus, { label: string; bg: string; border: string; text: string; dot: string }> = {
  available:      { label: 'Available',   bg: 'bg-accent/10',       border: 'border-accent/30',       text: 'text-accent',            dot: 'bg-accent' },
  occupied:       { label: 'Occupied',    bg: 'bg-amber-500/10',    border: 'border-amber-500/30',    text: 'text-amber-400',         dot: 'bg-amber-400' },
  bill_requested: { label: 'Bill Req.',   bg: 'bg-red-500/10',      border: 'border-red-500/40',      text: 'text-red-400',           dot: 'bg-red-400' },
  reserved:       { label: 'Reserved',    bg: 'bg-blue-500/10',     border: 'border-blue-500/30',     text: 'text-blue-400',          dot: 'bg-blue-400' },
  cleaning:       { label: 'Cleaning',    bg: 'bg-muted',           border: 'border-border',          text: 'text-muted-foreground',  dot: 'bg-muted-foreground' },
};

function getDraftKey(restaurantId?: string, outletSlug?: string, tableId?: string) {
  return restaurantId && tableId ? `restro_table_draft_${restaurantId}_${outletSlug || 'default'}_${tableId}` : null;
}

function getSeatedDuration(seatedAt?: string): string {
  if (!seatedAt) return '';
  const mins = Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function calcCartTotal(cart: CartItem[]) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  let gst = 0;
  cart.forEach((i) => { gst += Math.round((i.price * i.qty * i.gstRate) / 100); });
  return { subtotal, gst, total: subtotal + gst };
}

export default function TableManagementClient() {
  const router = useRouter();
  const supabase = createClient();
  const networkStatus = useNetworkStatus();
  const { isOnline } = networkStatus;
  const { staffUser, activeRestaurant, activeOutlet } = useAuth();

  // ── Core state ────────────────────────────────────────────────────────
  const [tables, setTables] = useState<TableData[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | 'All'>('All');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // ── Seat modal ────────────────────────────────────────────────────────
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [seatCaptain, setSeatCaptain] = useState('');
  const [seatCovers, setSeatCovers] = useState(2);
  const [seatTargetId, setSeatTargetId] = useState<string | null>(null);
  const [seatLoading, setSeatLoading] = useState(false);
  const [captainList, setCaptainList] = useState<{ id: string; name: string; role: string }[]>([]);

  // ── Assign captain modal ──────────────────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignCaptain, setAssignCaptain] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // ── Order / cart panel ────────────────────────────────────────────────
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategory, setMenuCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [kotLoading, setKotLoading] = useState(false);

  // ── KOT double-fire guard ─────────────────────────────────────────────
  const kotFiringRef = useRef(false);

  // ── KOT round history ─────────────────────────────────────────────────
  const [kotHistory, setKotHistory] = useState<Array<{
    id: string;
    kotNumber: string;
    fireTime: string;
    items: Array<{ id: string; name: string; qty: number; isVeg: boolean; menuItemId?: string; price?: number; gstRate?: number }>;
  }>>([]);
  const [kotHistoryLoading, setKotHistoryLoading] = useState(false);
  const [kotHistoryTableId, setKotHistoryTableId] = useState<string | null>(null);

  // ── Edit KOT round state ──────────────────────────────────────────────
  const [editingKotId, setEditingKotId] = useState<string | null>(null);
  const [editKotItems, setEditKotItems] = useState<Array<{ id: string; name: string; qty: number; isVeg: boolean; menuItemId?: string; price?: number; gstRate?: number }>>([]);
  const [editKotSaving, setEditKotSaving] = useState(false);
  const [showAddToKotPanel, setShowAddToKotPanel] = useState(false);

  // ── Delete KOT round state ────────────────────────────────────────────
  const [deletingKotId, setDeletingKotId] = useState<string | null>(null);
  const [deleteKotRoundLabel, setDeleteKotRoundLabel] = useState<string>('');
  const [deleteKotConfirming, setDeleteKotConfirming] = useState(false);

  // ── Add Table modal state ─────────────────────────────────────────────
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [addTableLabel, setAddTableLabel] = useState('');
  const [addTableSection, setAddTableSection] = useState<Section>('Indoor');
  const [addTableCapacity, setAddTableCapacity] = useState(4);
  const [addTableLoading, setAddTableLoading] = useState(false);

  // ── Edit Table modal state ────────────────────────────────────────────
  const [showEditTableModal, setShowEditTableModal] = useState(false);
  const [editTableTarget, setEditTableTarget] = useState<TableData | null>(null);
  const [editTableLabel, setEditTableLabel] = useState('');
  const [editTableSection, setEditTableSection] = useState<Section>('Indoor');
  const [editTableCapacity, setEditTableCapacity] = useState(4);
  const [editTableLoading, setEditTableLoading] = useState(false);

  // ── Delete Table modal state ──────────────────────────────────────────
  const [showDeleteTableModal, setShowDeleteTableModal] = useState(false);
  const [deleteTableTarget, setDeleteTableTarget] = useState<TableData | null>(null);
  const [deleteTableLoading, setDeleteTableLoading] = useState(false);
  const draftHydratedRef = useRef<string | null>(null);

  // ── Role check: can manage tables (edit/delete) ───────────────────────
  const canManageTables = staffUser
    ? ['owner', 'manager', 'outlet_manager'].includes(staffUser.role)
    : false;

  // Derived: always read selectedTable from tables array so it's always fresh
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableHasNoOrderHistory = Boolean(
    selectedTable &&
    selectedTable.status === 'occupied' &&
    !kotHistoryLoading &&
    kotHistoryTableId === selectedTable.id &&
    kotHistory.length === 0 &&
    ((selectedTable.kotCount ?? 0) === 0)
  );

  // ── Restore cart draft for the selected table ────────────────────────
  useEffect(() => {
    const draftKey = getDraftKey(activeRestaurant?.id, activeOutlet?.slug, selectedTableId || undefined);
    draftHydratedRef.current = null;

    if (!draftKey || !selectedTableId) {
      setCart([]);
      setShowOrderPanel(false);
      return;
    }

    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setCart(Array.isArray(parsed?.cart) ? parsed.cart : []);
        setShowOrderPanel(Boolean(parsed?.showOrderPanel));
      } else {
        setCart([]);
        setShowOrderPanel(false);
      }
    } catch {
      setCart([]);
      setShowOrderPanel(false);
    } finally {
      draftHydratedRef.current = draftKey;
    }
  }, [activeRestaurant?.id, activeOutlet?.slug, selectedTableId]);

  useEffect(() => {
    const draftKey = getDraftKey(activeRestaurant?.id, activeOutlet?.slug, selectedTableId || undefined);
    if (!draftKey || draftHydratedRef.current !== draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ cart, showOrderPanel }));
    } catch {
      // Non-blocking
    }
  }, [activeRestaurant?.id, activeOutlet?.slug, selectedTableId, cart, showOrderPanel]);

  // ── Load KOT history when selected table changes ──────────────────────
  useEffect(() => {
    if (!activeRestaurant?.id) {
      setKotHistory([]);
      setKotHistoryTableId(null);
      return;
    }
    if (!selectedTable || selectedTable.status === 'available' || selectedTable.status === 'cleaning') {
      setKotHistory([]);
      setKotHistoryTableId(null);
      return;
    }
    setKotHistoryLoading(true);
    setKotHistory([]);
    supabase
      .from('kots')
      .select('id, kot_number, fire_time, kot_items(id, name, qty, is_veg, menu_item_id)')
      .eq('table_label', selectedTable.label)
      .eq('restaurant_id', activeRestaurant.id)
      .neq('status', 'voided')
      .order('fire_time', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setKotHistory(
            data.map((k: any) => ({
              id: k.id,
              kotNumber: k.kot_number,
              fireTime: k.fire_time,
              items: (k.kot_items || []).map((i: any) => ({
                id: i.id,
                name: i.name,
                qty: i.qty,
                isVeg: i.is_veg,
                menuItemId: i.menu_item_id,
              })),
            }))
          );
          setKotHistoryTableId(selectedTable.id);
        }
        setKotHistoryLoading(false);
      });
  }, [activeRestaurant?.id, selectedTable?.id, selectedTable?.label, selectedTable?.status, selectedTable?.kotCount]);

  // Refresh KOT history after a new KOT is fired
  const refreshKotHistory = useCallback(async (tableLabel: string, tableId: string) => {
    const { data, error } = await supabase
      .from('kots')
      .select('id, kot_number, fire_time, kot_items(id, name, qty, is_veg, menu_item_id)')
      .eq('table_label', tableLabel)
      .eq('restaurant_id', activeRestaurant?.id)
      .neq('status', 'voided')
      .order('fire_time', { ascending: true });
    if (!error && data) {
      setKotHistory(
        data.map((k: any) => ({
          id: k.id,
          kotNumber: k.kot_number,
          fireTime: k.fire_time,
          items: (k.kot_items || []).map((i: any) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            isVeg: i.is_veg,
            menuItemId: i.menu_item_id,
          })),
        }))
      );
      setKotHistoryTableId(tableId);
    }
  }, [supabase]);

  // Broadcast table status to KDS + POS ──────────────────────────────
  const broadcastTableStatus = useCallback((tableId: string, label: string, status: TableStatus, captain?: string, covers?: number) => {
    const message = {
      type: 'broadcast',
      event: 'table_status_changed',
      payload: { tableId, label, status, captain, covers, updatedAt: new Date().toISOString() },
    };
    const channel = supabase.channel('table_status_sync') as any;
    const sendPromise = typeof channel.httpSend === 'function'
      ? channel.httpSend(message)
      : channel.send(message);
    Promise.resolve(sendPromise).catch(() => {/* non-blocking */});
  }, [supabase]);

  // ── Load tables ───────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!activeRestaurant?.id) {
      setTables([]);
      setLoading(false);
      return;
    }
    try {
      const data = await tableService.getAll(activeOutlet?.slug || 'koramangala', { restaurantId: activeRestaurant.id, outletSlug: activeOutlet?.slug });
      setTables(data as TableData[]);
      if (data.length > 0 && !selectedTableId) {
        setSelectedTableId((data[0] as TableData).id);
      }
    } catch (err: any) {
      toast.error('Failed to load tables: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [activeRestaurant?.id, activeOutlet?.slug, selectedTableId]);

  useEffect(() => { loadTables(); }, [loadTables]);

  // ── Real-time subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('table_mgmt_v2')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables' }, (payload) => {
        const u = payload.new;
        const mapped: TableData = {
          id: u.id, label: u.label, section: u.section as Section,
          capacity: u.capacity, status: u.status as TableStatus,
          covers: u.covers, captain: u.captain, seatedAt: u.seated_at,
          runningAmount: u.running_amount ? Number(u.running_amount) : undefined,
          reservedFor: u.reserved_for, reservedAt: u.reserved_at, kotCount: u.kot_count,
        };
        setTables((prev) => prev.map((t) => t.id === u.id ? mapped : t));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'restaurant_tables' }, () => { loadTables(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kots' }, (payload) => {
        const kot = payload.new;
        if (!kot.table_label) return;
        const fireTime: string = kot.fire_time ?? kot.created_at ?? new Date().toISOString();
        const kotCovers: number = kot.covers ?? 0;
        setTables((prev) => {
          const target = prev.find((t) => t.label === kot.table_label);
          if (!target) return prev;
          const newKotCount = (target.kotCount ?? 0) + 1;
          const newCovers = kotCovers > 0 ? kotCovers : (target.covers ?? 0);
          const newSeatedAt = target.seatedAt ?? fireTime;
          const updated: TableData = {
            ...target,
            status: target.status === 'available' ? 'occupied' : target.status,
            covers: newCovers, seatedAt: newSeatedAt, kotCount: newKotCount,
          };
          supabase.from('restaurant_tables').update({
            status: updated.status, covers: newCovers, seated_at: newSeatedAt, kot_count: newKotCount,
          }).eq('label', kot.table_label).then(({ error }) => {
            if (error) console.error('[TableMgmt] kot→table update error:', error.message);
          });
          return prev.map((t) => t.label === kot.table_label ? updated : t);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Load menu items for order panel ──────────────────────────────────
  async function loadMenuItems() {
    if (menuItems.length > 0) return;
    if (!activeRestaurant?.id) return;
    setMenuLoading(true);
    try {
      const data = await menuService.getAll(activeOutlet?.slug || 'koramangala', { restaurantId: activeRestaurant.id, outletSlug: activeOutlet?.slug });
      setMenuItems(data.filter((m: MenuItem) => m.available));
    } catch (err: any) {
      toast.error('Failed to load menu: ' + err.message);
    } finally {
      setMenuLoading(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const filteredTables = tables.filter(
    (t) => selectedSection === 'All' || t.section === selectedSection
  );

  const stats = {
    total: tables.length,
    occupied: tables.filter((t) => t.status === 'occupied' || t.status === 'bill_requested').length,
    available: tables.filter((t) => t.status === 'available').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
  };

  const menuCategories = ['All', ...Array.from(new Set(menuItems.map((m) => m.category)))];
  const filteredMenu = menuItems.filter((m) => {
    const matchCat = menuCategory === 'All' || m.category === menuCategory;
    const matchSearch = !menuSearch || m.name.toLowerCase().includes(menuSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // ── Status actions ────────────────────────────────────────────────────

  // Open seat modal
  function openSeatModal(tableId: string) {
    // Edge case: don't allow seating an already occupied table
    const table = tables.find((t) => t.id === tableId);
    if (table && table.status === 'occupied') {
      toast.error('Table is already occupied');
      return;
    }
    setSeatTargetId(tableId);
    setSeatCaptain('');
    setSeatCovers(2);
    setShowSeatModal(true);
    // Load staff list for captain dropdown
    loadCaptainList();
  }

  async function loadCaptainList() {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*');

      if (error) throw error;

      const allowedRoles = new Set(['owner', 'manager', 'captain', 'outlet_manager']);
      const normalized = (data || [])
        .filter((row: any) => {
          const role = String(row.role ?? row.staff_role ?? '').toLowerCase();
          const status = String(row.status ?? row.staff_status ?? '').toLowerCase();
          const statusActive = status ? status === 'active' : true;
          const flagActive = row.is_active === undefined ? true : Boolean(row.is_active);
          return allowedRoles.has(role) && statusActive && flagActive;
        })
        .map((row: any, idx: number) => ({
          id: String(row.id ?? row.user_id ?? `${row.name || row.full_name || 'staff'}-${idx}`),
          name: String(row.name ?? row.full_name ?? row.staff_name ?? 'Unnamed Staff'),
          role: String(row.role ?? row.staff_role ?? 'captain'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (normalized.length > 0) {
        setCaptainList(normalized);
        return;
      }

      const fallbackNames = Array.from(new Set([
        ...CAPTAINS,
        ...tables.map((t) => t.captain).filter(Boolean) as string[],
        staffUser?.name || '',
      ].map((n) => String(n).trim()).filter(Boolean)));

      setCaptainList(
        fallbackNames.map((name, idx) => ({
          id: `fallback-${idx}`,
          name,
          role: 'captain',
        }))
      );
    } catch {
      const fallbackNames = Array.from(new Set([
        ...CAPTAINS,
        ...tables.map((t) => t.captain).filter(Boolean) as string[],
        staffUser?.name || '',
      ].map((n) => String(n).trim()).filter(Boolean)));

      setCaptainList(
        fallbackNames.map((name, idx) => ({
          id: `fallback-${idx}`,
          name,
          role: 'captain',
        }))
      );
    }
  }

  // Confirm seat
  async function confirmSeat() {
    if (!seatTargetId || !seatCaptain) return;
    setSeatLoading(true);
    const now = new Date().toISOString();
    // Optimistic
    setTables((prev) =>
      prev.map((t) =>
        t.id === seatTargetId
          ? { ...t, status: 'occupied', covers: seatCovers, captain: seatCaptain, seatedAt: now, runningAmount: 0, kotCount: 0 }
          : t
      )
    );
    setShowSeatModal(false);
    const iKey = generateIdempotencyKey(`seat_${seatTargetId}`);
    if (!isOnline) {
      await offlineQueue.enqueue('table_seat', { id: seatTargetId, captain: seatCaptain, covers: seatCovers }, iKey);
      toast.success('Table seated — will sync when online');
      setSeatLoading(false);
      return;
    }
    try {
      await tableService.seat(seatTargetId, seatCaptain, seatCovers);
      // Sync to KDS + POS
      const t = tables.find((t) => t.id === seatTargetId);
      broadcastTableStatus(seatTargetId, t?.label ?? '', 'occupied', seatCaptain, seatCovers);
      toast.success(`Table seated — Captain: ${seatCaptain}`);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
      await offlineQueue.enqueue('table_seat', { id: seatTargetId, captain: seatCaptain, covers: seatCovers }, iKey);
      loadTables();
    } finally {
      setSeatLoading(false);
    }
  }

  // Assign captain to occupied table
  async function confirmAssignCaptain() {
    if (!selectedTable || !assignCaptain) return;
    setAssignLoading(true);
    setTables((prev) => prev.map((t) => t.id === selectedTable.id ? { ...t, captain: assignCaptain } : t));
    setShowAssignModal(false);
    if (!isOnline) {
      const iKey = generateIdempotencyKey(`captain_${selectedTable.id}_${assignCaptain}`);
      await offlineQueue.enqueue('table_assign_captain', { id: selectedTable.id, captain: assignCaptain }, iKey);
      toast.success(`${assignCaptain} assigned — will sync when online`);
      setAssignLoading(false);
      return;
    }
    try {
      await tableService.assignCaptain(selectedTable.id, assignCaptain);
      toast.success(`${assignCaptain} assigned to ${selectedTable.label}`);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
      const iKey = generateIdempotencyKey(`captain_${selectedTable.id}_${assignCaptain}`);
      await offlineQueue.enqueue('table_assign_captain', { id: selectedTable.id, captain: assignCaptain }, iKey);
    } finally {
      setAssignLoading(false);
    }
  }

  // Request bill → update status + navigate to POS with table pre-selected
  async function requestBill(tableId: string) {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const hasLoadedHistory = kotHistoryTableId === tableId && kotHistory.length > 0;
    const hasAnyOrders = hasLoadedHistory || (table.kotCount ?? 0) > 0;

    // Edge case: can't request bill if no KOTs have been fired
    if (!hasAnyOrders) {
      toast.error('No orders placed yet — add items before requesting bill');
      return;
    }

    // Edge case: already in bill_requested state
    if (table.status === 'bill_requested') {
      toast.info('Bill already requested — click Generate Bill to proceed');
      return;
    }

    // Optimistic
    setTables((prev) => prev.map((t) => t.id === tableId ? { ...t, status: 'bill_requested' } : t));
    const iKey = generateIdempotencyKey(`req_bill_${tableId}`);
    if (!isOnline) {
      await offlineQueue.enqueue('table_request_bill', { id: tableId }, iKey);
      toast.success('Bill requested — will sync when online');
      return;
    }
    try {
      await tableService.requestBill(tableId);
      // Sync to KDS + POS
      broadcastTableStatus(tableId, table.label, 'bill_requested', table.captain, table.covers);
      toast.success('Bill requested — redirecting to POS…');
      // Navigate to POS with table label pre-loaded
      setTimeout(() => {
        router.push(`/pos-billing?table=${encodeURIComponent(table.label)}&covers=${table.covers ?? 2}&captain=${encodeURIComponent(table.captain ?? '')}`);
      }, 600);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
      await offlineQueue.enqueue('table_request_bill', { id: tableId }, iKey);
      loadTables();
    }
  }

  // Generate bill for bill_requested table → go to POS
  function generateBill(table: TableData) {
    router.push(`/pos-billing?table=${encodeURIComponent(table.label)}&covers=${table.covers ?? 2}&captain=${encodeURIComponent(table.captain ?? '')}`);
  }

  async function markCleaning(tableId: string) {
    const table = tables.find((t) => t.id === tableId);
    setTables((prev) => prev.map((t) => t.id === tableId ? { ...t, status: 'cleaning', covers: undefined, captain: undefined, seatedAt: undefined, runningAmount: undefined } : t));
    const iKey = generateIdempotencyKey(`cleaning_${tableId}`);
    if (!isOnline) {
      await offlineQueue.enqueue('table_mark_cleaning', { id: tableId }, iKey);
      toast.success('Marked for cleaning — will sync when online');
      return;
    }
    try {
      await tableService.markCleaning(tableId);
      // Sync to KDS + POS
      broadcastTableStatus(tableId, table?.label ?? '', 'cleaning');
      toast.success('Table marked for cleaning');
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
      await offlineQueue.enqueue('table_mark_cleaning', { id: tableId }, iKey);
      loadTables();
    }
  }

  async function markAvailable(tableId: string, allowNoOrdersFromOccupied = false) {
    const table = tables.find((t) => t.id === tableId);

    // Standard rule: only cleaning -> available.
    // Exception: occupied table with no order history can be released directly.
    if (table && table.status !== 'cleaning') {
      const canReleaseNoOrders = allowNoOrdersFromOccupied
        && table.status === 'occupied'
        && selectedTable?.id === tableId
        && selectedTableHasNoOrderHistory;
      if (!canReleaseNoOrders) {
        toast.error('Table must be in cleaning state before marking available');
        return;
      }
    }

    setTables((prev) => prev.map((t) => t.id === tableId ? { ...t, status: 'available', covers: undefined, captain: undefined, seatedAt: undefined, runningAmount: undefined } : t));
    const iKey = generateIdempotencyKey(`available_${tableId}`);
    if (!isOnline) {
      await offlineQueue.enqueue('table_mark_available', { id: tableId }, iKey);
      toast.success('Table marked available — will sync when online');
      return;
    }
    try {
      await tableService.markAvailable(tableId);
      // Sync to KDS + POS
      broadcastTableStatus(tableId, table?.label ?? '', 'available');
      toast.success('Table is now available');
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
      await offlineQueue.enqueue('table_mark_available', { id: tableId }, iKey);
      loadTables();
    }
  }

  // ── Cart helpers ──────────────────────────────────────────────────────
  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) return prev.map((c) => c.menuItemId === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, qty: 1, gstRate: item.gstRate, isVeg: item.isVeg }];
    });
  }

  function removeFromCart(menuItemId: string) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === menuItemId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter((c) => c.menuItemId !== menuItemId);
      return prev.map((c) => c.menuItemId === menuItemId ? { ...c, qty: c.qty - 1 } : c);
    });
  }

  function clearCart() { setCart([]); }

  // Close order panel and clear cart
  function closeOrderPanel() {
    setShowOrderPanel(false);
    setCart([]);
    setMenuSearch('');
    setMenuCategory('All');

    const draftKey = getDraftKey(activeRestaurant?.id, activeOutlet?.slug, selectedTableId || undefined);
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Non-blocking
      }
    }
  }

  // Fire KOT for the table
  async function fireKOT() {
    // Edge case: prevent double-fire
    if (kotFiringRef.current) {
      toast.error('KOT is already being sent — please wait');
      return;
    }

    // Edge case: empty cart
    if (!selectedTable || cart.length === 0) {
      toast.error('Add at least one item before firing KOT');
      return;
    }

    // Edge case: no captain assigned
    if (!selectedTable.captain) {
      toast.error('Assign a captain to this table before firing KOT');
      return;
    }

    // Edge case: table not in a valid state for ordering
    if (selectedTable.status === 'available' || selectedTable.status === 'cleaning') {
      toast.error('Seat the table first before placing an order');
      return;
    }

    kotFiringRef.current = true;
    setKotLoading(true);
    try {
      const kotNumber = `KOT-${Date.now()}`;
      const { kotService } = await import('@/lib/services/restaurantService');
      await kotService.create({
        kotNumber,
        tableLabel: selectedTable.label,
        orderType: 'dine-in',
        station: 'Kitchen',
        priority: 'normal',
        steward: selectedTable.captain ?? 'Captain',
        covers: selectedTable.covers ?? 2,
        items: cart.map((c) => ({ menuItemId: c.menuItemId, name: c.name, qty: c.qty, isVeg: c.isVeg })),
      }, activeRestaurant?.id ? { restaurantId: activeRestaurant.id, outletSlug: activeOutlet?.slug } : undefined);
      // Update running amount
      const { total } = calcCartTotal(cart);
      let newRunning = (selectedTable.runningAmount ?? 0) + total;
      await tableService.update(selectedTable.id, { running_amount: newRunning, status: 'occupied' });
      setTables((prev) => prev.map((t) => t.id === selectedTable.id ? { ...t, runningAmount: newRunning, status: 'occupied', kotCount: (t.kotCount ?? 0) + 1 } : t));
      // Sync running amount to KDS + POS
      broadcastTableStatus(selectedTable.id, selectedTable.label, 'occupied', selectedTable.captain, selectedTable.covers);
      toast.success(`KOT fired — ${cart.length} item(s) sent to kitchen`);
      // Refresh KOT history to show the new round
      await refreshKotHistory(selectedTable.label, selectedTable.id);
      clearCart();
      setShowOrderPanel(false);

      const draftKey = getDraftKey(activeRestaurant?.id, activeOutlet?.slug, selectedTable.id);
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // Non-blocking
        }
      }
    } catch (err: any) {
      toast.error('Failed to fire KOT: ' + err.message);
    } finally {
      setKotLoading(false);
      kotFiringRef.current = false;
    }
  }

  // ── Edit KOT round helpers ────────────────────────────────────────────
  function openEditKot(kot: typeof kotHistory[0]) {
    setEditingKotId(kot.id);
    setEditKotItems(kot.items.map((i) => ({ ...i })));
    setShowAddToKotPanel(false);
  }

  function closeEditKot() {
    setEditingKotId(null);
    setEditKotItems([]);
    setShowAddToKotPanel(false);
  }

  function editKotChangeQty(itemId: string, delta: number) {
    setEditKotItems((prev) =>
      prev.map((i) => i.id === itemId ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
    );
  }

  function editKotRemoveItem(itemId: string) {
    setEditKotItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  function editKotAddMenuItem(item: MenuItem) {
    setEditKotItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.id);
      if (existing) {
        return prev.map((i) => i.menuItemId === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        id: `new-${Date.now()}-${item.id}`,
        name: item.name,
        qty: 1,
        isVeg: item.isVeg,
        menuItemId: item.id,
        price: item.price,
        gstRate: item.gstRate,
      }];
    });
  }

  async function saveEditKot() {
    if (!editingKotId || !selectedTable) return;
    // Role guard: only owner, manager, captain can edit KOT rounds
    const allowedRoles = ['owner', 'manager', 'captain'];
    if (staffUser && !allowedRoles.includes(staffUser.role)) {
      toast.error(`Access denied — your role (${staffUser.role}) cannot edit KOT rounds`);
      return;
    }
    const validItems = editKotItems.filter((i) => i.qty > 0);
    setEditKotSaving(true);
    try {
      // Delete all existing kot_items for this KOT
      await supabase.from('kot_items').delete().eq('kot_id', editingKotId);

      // Re-insert updated items (only if there are valid items)
      if (validItems.length > 0) {
        const insertRows = validItems.map((i) => ({
          kot_id: editingKotId,
          menu_item_id: i.menuItemId || null,
          name: i.name,
          qty: i.qty,
          is_veg: i.isVeg,
          note: null,
        }));
        await supabase.from('kot_items').insert(insertRows);
      }

      // Recalculate running amount from all KOTs for this table
      const { data: allKots } = await supabase
        .from('kots')
        .select('id, kot_items(qty, menu_item_id)')
        .eq('table_label', selectedTable.label)
        .eq('restaurant_id', activeRestaurant?.id)
        .not('status', 'in', '("voided")');

      if (allKots) {
        // Collect all unique menu_item_ids
        const menuItemIds = Array.from(
          new Set(
            allKots.flatMap((k: any) =>
              (k.kot_items || []).map((i: any) => i.menu_item_id).filter(Boolean)
            )
          )
        );

        let priceMap: Record<string, number> = {};
        let gstMap: Record<string, number> = {};
        if (menuItemIds.length > 0) {
          const { data: menuData } = await supabase
            .from('menu_items')
            .select('id, price, gst_rate')
            .in('id', menuItemIds);
          if (menuData) {
            menuData.forEach((m: any) => {
              priceMap[m.id] = Number(m.price) || 0;
              gstMap[m.id] = Number(m.gst_rate) || 0;
            });
          }
        }

        let newRunning = 0;
        allKots.forEach((k: any) => {
          (k.kot_items || []).forEach((i: any) => {
            const price = i.menu_item_id ? (priceMap[i.menu_item_id] ?? 0) : 0;
            const gstRate = i.menu_item_id ? (gstMap[i.menu_item_id] ?? 0) : 0;
            const itemTotal = price * i.qty;
            const itemGst = Math.round((itemTotal * gstRate) / 100);
            newRunning += itemTotal + itemGst;
          });
        });

        await tableService.update(selectedTable.id, { running_amount: newRunning });
        setTables((prev) =>
          prev.map((t) => t.id === selectedTable.id ? { ...t, runningAmount: newRunning } : t)
        );
      }

      toast.success('KOT round updated successfully');
      closeEditKot();
      // Refresh history
      await refreshKotHistory(selectedTable.label, selectedTable.id);
      // Log KOT edit to audit trail
      auditService.log({
        staffName: staffUser?.name || 'Staff',
        staffRole: staffUser?.role || 'captain',
        action: 'KOT_EDITED',
        entity: selectedTable.label,
        details: `KOT round edited — Table: ${selectedTable.label} | Items retained: ${validItems.length}`,
        severity: 'warning',
        outlet: staffUser?.outlet || 'koramangala',
      }).catch(() => {/* non-blocking */});
    } catch (err: any) {
      toast.error('Failed to save changes: ' + err.message);
    } finally {
      setEditKotSaving(false);
    }
  }

  // ── Delete KOT round helpers ──────────────────────────────────────────
  function openDeleteKot(kot: typeof kotHistory[0], roundLabel: string) {
    setDeletingKotId(kot.id);
    setDeleteKotRoundLabel(roundLabel);
    setDeleteKotConfirming(false);
  }

  function closeDeleteKot() {
    setDeletingKotId(null);
    setDeleteKotRoundLabel('');
    setDeleteKotConfirming(false);
  }

  async function confirmDeleteKot() {
    if (!deletingKotId || !selectedTable) return;
    // Role guard: only owner and manager can delete KOT rounds
    const allowedRoles = ['owner', 'manager'];
    if (staffUser && !allowedRoles.includes(staffUser.role)) {
      toast.error(`Access denied — only managers and owners can delete KOT rounds`);
      closeDeleteKot();
      return;
    }
    setDeleteKotConfirming(true);
    try {
      // Delete all items for this KOT
      await supabase.from('kot_items').delete().eq('kot_id', deletingKotId);
      // Delete the KOT itself
      await supabase.from('kots').delete().eq('id', deletingKotId);

      // Recalculate running amount from remaining KOTs
      const { data: allKots } = await supabase
        .from('kots')
        .select('id, kot_items(qty, menu_item_id)')
        .eq('table_label', selectedTable.label)
        .eq('restaurant_id', activeRestaurant?.id)
        .not('status', 'in', '("voided")');

      if (allKots) {
        const menuItemIds = Array.from(
          new Set(
            allKots.flatMap((k: any) =>
              (k.kot_items || []).map((i: any) => i.menu_item_id).filter(Boolean)
            )
          )
        );

        let priceMap: Record<string, number> = {};
        let gstMap: Record<string, number> = {};
        if (menuItemIds.length > 0) {
          const { data: menuData } = await supabase
            .from('menu_items')
            .select('id, price, gst_rate')
            .in('id', menuItemIds);
          if (menuData) {
            menuData.forEach((m: any) => {
              priceMap[m.id] = Number(m.price) || 0;
              gstMap[m.id] = Number(m.gst_rate) || 0;
            });
          }
        }

        let newRunning = 0;
        allKots.forEach((k: any) => {
          (k.kot_items || []).forEach((i: any) => {
            const price = i.menu_item_id ? (priceMap[i.menu_item_id] ?? 0) : 0;
            const gstRate = i.menu_item_id ? (gstMap[i.menu_item_id] ?? 0) : 0;
            const itemTotal = price * i.qty;
            const itemGst = Math.round((itemTotal * gstRate) / 100);
            newRunning += itemTotal + itemGst;
          });
        });

        await tableService.update(selectedTable.id, { running_amount: newRunning });
        setTables((prev) =>
          prev.map((t) => t.id === selectedTable.id ? { ...t, runningAmount: newRunning } : t)
        );
      }

      toast.success(`${deleteKotRoundLabel} deleted successfully`);
      closeDeleteKot();
      await refreshKotHistory(selectedTable.label, selectedTable.id);
      // Log KOT deletion to audit trail
      auditService.log({
        staffName: staffUser?.name || 'Staff',
        staffRole: staffUser?.role || 'manager',
        action: 'KOT_DELETED',
        entity: selectedTable.label,
        details: `KOT round deleted — ${deleteKotRoundLabel} | Table: ${selectedTable.label}`,
        severity: 'critical',
        outlet: staffUser?.outlet || 'koramangala',
      }).catch(() => {/* non-blocking */});
    } catch (err: any) {
      toast.error('Failed to delete round: ' + err.message);
    } finally {
      setDeleteKotConfirming(false);
    }
  }

  // ── Add Table handler ─────────────────────────────────────────────────
  async function confirmAddTable() {
    if (!activeRestaurant?.id) {
      toast.error('No active restaurant selected. Please select a restaurant and try again.');
      return;
    }
    if (!addTableLabel.trim()) {
      toast.error('Please enter a table name/number');
      return;
    }
    if (tables.some((t) => t.label.toLowerCase() === addTableLabel.trim().toLowerCase())) {
      toast.error('A table with this name already exists');
      return;
    }
    setAddTableLoading(true);
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert({
          restaurant_id: activeRestaurant.id,
          label: addTableLabel.trim(),
          section: addTableSection,
          capacity: addTableCapacity,
          status: 'available',
        })
        .select()
        .single();
      if (error) throw error;
      toast.success(`Table "${addTableLabel.trim()}" added successfully`);
      setShowAddTableModal(false);
      setAddTableLabel('');
      setAddTableSection('Indoor');
      setAddTableCapacity(4);
      await loadTables();
    } catch (err: any) {
      toast.error('Failed to add table: ' + err.message);
    } finally {
      setAddTableLoading(false);
    }
  }

  // ── Edit Table handlers ───────────────────────────────────────────────
  function openEditTable(table: TableData, e: React.MouseEvent) {
    e.stopPropagation();
    setEditTableTarget(table);
    setEditTableLabel(table.label);
    setEditTableSection(table.section);
    setEditTableCapacity(table.capacity);
    setShowEditTableModal(true);
  }

  async function confirmEditTable() {
    if (!editTableTarget || !editTableLabel.trim()) {
      toast.error('Please enter a table name/number');
      return;
    }
    const duplicate = tables.find(
      (t) => t.label.toLowerCase() === editTableLabel.trim().toLowerCase() && t.id !== editTableTarget.id
    );
    if (duplicate) {
      toast.error('A table with this name already exists');
      return;
    }
    setEditTableLoading(true);
    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({
          label: editTableLabel.trim(),
          section: editTableSection,
          capacity: editTableCapacity,
        })
        .eq('id', editTableTarget.id);
      if (error) throw error;
      toast.success(`Table "${editTableLabel.trim()}" updated successfully`);
      setShowEditTableModal(false);
      setEditTableTarget(null);
      await loadTables();
    } catch (err: any) {
      toast.error('Failed to update table: ' + err.message);
    } finally {
      setEditTableLoading(false);
    }
  }

  // ── Delete Table handlers ─────────────────────────────────────────────
  function openDeleteTable(table: TableData, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTableTarget(table);
    setShowDeleteTableModal(true);
  }

  async function confirmDeleteTable() {
    if (!deleteTableTarget) return;
    if (deleteTableTarget.status !== 'available' && deleteTableTarget.status !== 'cleaning') {
      toast.error('Cannot delete an occupied or reserved table. Clear the table first.');
      setShowDeleteTableModal(false);
      return;
    }
    setDeleteTableLoading(true);
    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', deleteTableTarget.id);
      if (error) throw error;
      toast.success(`Table "${deleteTableTarget.label}" removed`);
      setShowDeleteTableModal(false);
      setDeleteTableTarget(null);
      if (selectedTableId === deleteTableTarget.id) setSelectedTableId(null);
      await loadTables();
    } catch (err: any) {
      toast.error('Failed to delete table: ' + err.message);
    } finally {
      setDeleteTableLoading(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm">Loading floor plan…</p>
        </div>
      </div>
    );
  }

  const cartTotals = calcCartTotal(cart);

  return (
    <div className="flex h-full relative">
      <OfflineQueuePanel networkStatus={networkStatus} />

      {/* ── Left: Floor Plan ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Stats bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card flex-shrink-0 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-foreground">{stats.total}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-muted-foreground hidden sm:inline">Occupied</span>
              <span className="font-bold text-amber-400">{stats.occupied}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
              <span className="text-muted-foreground hidden sm:inline">Available</span>
              <span className="font-bold text-accent">{stats.available}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-muted-foreground hidden sm:inline">Reserved</span>
              <span className="font-bold text-blue-400">{stats.reserved}</span>
            </div>
          </div>
          <div className="ml-auto flex gap-1 p-0.5 bg-secondary rounded-lg flex-shrink-0">
            {(['All', ...sections] as (Section | 'All')[]).map((s) => (
              <button
                key={`sec-${s}`}
                onClick={() => setSelectedSection(s)}
                className={`px-2 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  selectedSection === s ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'Private Dining' ? <span className="sm:hidden">Private</span> : null}
                <span className={s === 'Private Dining' ? 'hidden sm:inline' : ''}>{s}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 sm:p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3">
            {filteredTables.map((table) => {
              const cfg = statusConfig[table.status];
              const isSelected = selectedTableId === table.id;
              const duration = getSeatedDuration(table.seatedAt);

              return (
                <div
                  key={`tcard-${table.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedTableId(table.id);
                    setShowDetailPanel(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedTableId(table.id);
                      setShowDetailPanel(true);
                    }
                  }}
                  className={`group relative flex flex-col items-start p-2 sm:p-3 rounded-2xl border-2 text-left transition-all active:scale-95 cursor-pointer ${cfg.bg} ${cfg.border} ${
                    isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'hover:ring-1 hover:ring-primary/40 hover:ring-offset-1 hover:ring-offset-background'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${cfg.dot} mb-1.5 sm:mb-2`} />
                  <span className="text-lg sm:text-xl font-black text-foreground leading-none mb-1">{table.label}</span>
                  <div className="flex items-center gap-1 mb-1">
                    <Users size={10} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {table.covers ? `${table.covers}/${table.capacity}` : table.capacity}
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
                  {duration && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock size={9} className="text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground font-mono">{duration}</span>
                    </div>
                  )}
                  {table.runningAmount !== undefined && table.runningAmount > 0 && (
                    <div className="mt-1">
                      <span className="text-xs font-bold text-foreground font-mono">₹{table.runningAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {table.kotCount && table.kotCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-[9px] font-bold text-white">
                      {table.kotCount}
                    </span>
                  )}
                  {table.status === 'bill_requested' && (
                    <span className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {table.status === 'reserved' && table.reservedFor && (
                    <p className="text-[9px] text-blue-400 mt-1 truncate w-full">{table.reservedFor}</p>
                  )}
                  {/* Edit / Delete buttons — visible only to owner, manager, outlet_manager */}
                  {canManageTables && (
                    <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => openEditTable(table, e)}
                        className="w-5 h-5 rounded bg-primary/20 border border-primary/40 flex items-center justify-center hover:bg-primary/40 transition-all"
                        title="Edit table"
                      >
                        <Edit2 size={9} className="text-primary" />
                      </button>
                      <button
                        onClick={(e) => openDeleteTable(table, e)}
                        className="w-5 h-5 rounded bg-destructive/15 border border-destructive/30 flex items-center justify-center hover:bg-destructive/30 transition-all"
                        title="Delete table"
                      >
                        <Trash2 size={9} className="text-destructive" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => canManageTables ? setShowAddTableModal(true) : toast.error('Only owners and managers can add tables')}
              className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all min-h-[90px] sm:min-h-[100px]">
              <Plus size={18} className="mb-1" />
              <span className="text-[10px] font-semibold">Add Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Table Detail Sidebar (desktop always visible, mobile/tablet slide-over) ── */}
      {/* Mobile/tablet overlay backdrop */}
      {showDetailPanel && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setShowDetailPanel(false)}
        />
      )}

      <div className={`
        fixed lg:static inset-y-0 right-0 z-40
        w-80 sm:w-96 lg:w-72 xl:w-80
        flex-shrink-0 border-l border-border bg-card flex flex-col
        transition-transform duration-300 ease-in-out
        ${showDetailPanel ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border lg:hidden bg-card">
          <span className="text-sm font-bold text-foreground">Table Details</span>
          <button
            onClick={() => setShowDetailPanel(false)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X size={18} />
          </button>
        </div>

        {selectedTable ? (
          <>
            {/* Table header */}
            <div className={`px-4 py-4 border-b border-border ${statusConfig[selectedTable.status].bg}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-foreground">{selectedTable.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${statusConfig[selectedTable.status].bg} ${statusConfig[selectedTable.status].border} ${statusConfig[selectedTable.status].text}`}>
                    {statusConfig[selectedTable.status].label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{selectedTable.section}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Section</p>
                  <p className="font-semibold text-foreground">{selectedTable.section}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Capacity</p>
                  <p className="font-semibold text-foreground">{selectedTable.capacity} seats</p>
                </div>
                {selectedTable.covers && (
                  <div>
                    <p className="text-muted-foreground">Covers</p>
                    <p className="font-semibold text-foreground">{selectedTable.covers}</p>
                  </div>
                )}
                {selectedTable.captain && (
                  <div>
                    <p className="text-muted-foreground">Captain</p>
                    <p className="font-semibold text-foreground">{selectedTable.captain}</p>
                  </div>
                )}
                {selectedTable.seatedAt && (
                  <div>
                    <p className="text-muted-foreground">Seated</p>
                    <p className="font-semibold text-foreground">{getSeatedDuration(selectedTable.seatedAt)} ago</p>
                  </div>
                )}
                {selectedTable.runningAmount !== undefined && selectedTable.runningAmount > 0 && (
                  <div>
                    <p className="text-muted-foreground">Running Amount</p>
                    <p className="font-bold text-foreground font-mono">₹{selectedTable.runningAmount.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {selectedTable.kotCount !== undefined && selectedTable.kotCount > 0 && (
                  <div>
                    <p className="text-muted-foreground">KOTs Fired</p>
                    <p className="font-semibold text-foreground">{selectedTable.kotCount}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">

              {/* ── AVAILABLE ── */}
              {selectedTable.status === 'available' && (
                <button
                  onClick={() => openSeatModal(selectedTable.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-accent hover:bg-accent/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
                >
                  <Utensils size={15} />
                  Seat Table
                </button>
              )}

              {/* ── OCCUPIED ── */}
              {selectedTable.status === 'occupied' && (
                <>
                  {/* Add Items / Order */}
                  <button
                    onClick={() => { loadMenuItems(); setShowOrderPanel(true); }}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-accent hover:bg-accent/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
                  >
                    <ShoppingCart size={15} />
                    Add Items / Order
                    {cart.length > 0 && (
                      <span className="ml-auto bg-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {cart.reduce((s, c) => s + c.qty, 0)}
                      </span>
                    )}
                  </button>

                  {/* Request Bill */}
                  <button
                    onClick={() => requestBill(selectedTable.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
                  >
                    <ReceiptText size={15} />
                    Request Bill
                    <ArrowRight size={13} className="ml-auto" />
                  </button>

                  {/* Assign / Change Captain */}
                  <button
                    onClick={() => {
                      setAssignCaptain(selectedTable.captain ?? '');
                      loadCaptainList();
                      setShowAssignModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-secondary border border-border text-foreground font-semibold text-sm rounded-xl hover:border-primary/40 transition-all"
                  >
                    <UserCheck size={15} />
                    {selectedTable.captain ? `Change Captain (${selectedTable.captain})` : 'Assign Captain'}
                  </button>

                  {selectedTableHasNoOrderHistory && (
                    <button
                      onClick={() => markAvailable(selectedTable.id, true)}
                      className="w-full flex items-center gap-2 px-4 py-3 bg-accent/15 border border-accent/30 text-accent font-bold text-sm rounded-xl transition-all active:scale-95"
                    >
                      <CheckCircle size={15} />
                      Mark Available (No Orders)
                    </button>
                  )}
                </>
              )}

              {/* ── BILL REQUESTED ── */}
              {selectedTable.status === 'bill_requested' && (
                <>
                  {/* Generate Bill → POS */}
                  <button
                    onClick={() => generateBill(selectedTable)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
                  >
                    <CreditCard size={15} />
                    Generate Bill
                    <ArrowRight size={13} className="ml-auto" />
                  </button>

                  {/* Still allow adding items */}
                  <button
                    onClick={() => { loadMenuItems(); setShowOrderPanel(true); }}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-secondary border border-border text-foreground font-semibold text-sm rounded-xl hover:border-primary/40 transition-all"
                  >
                    <ShoppingCart size={15} />
                    Add More Items
                  </button>

                  {/* Mark cleaning after bill settled externally */}
                  <button
                    onClick={() => markCleaning(selectedTable.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-sm rounded-xl transition-all"
                  >
                    Mark Cleaning (Bill Settled)
                  </button>
                </>
              )}

              {/* ── CLEANING ── */}
              {selectedTable.status === 'cleaning' && (
                <button
                  onClick={() => markAvailable(selectedTable.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-accent/15 border border-accent/30 text-accent font-bold text-sm rounded-xl transition-all active:scale-95"
                >
                  <CheckCircle size={15} />
                  Mark Available
                </button>
              )}

              {/* ── RESERVED ── */}
              {selectedTable.status === 'reserved' && (
                <button
                  onClick={() => openSeatModal(selectedTable.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-accent hover:bg-accent/90 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
                >
                  <Utensils size={15} />
                  Seat Reserved Table
                </button>
              )}

              {/* ── KOT ROUND HISTORY ── */}
              {(selectedTable.status === 'occupied' || selectedTable.status === 'bill_requested') && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock size={11} />
                    Order History
                    {kotHistoryLoading && <Loader2 size={10} className="animate-spin ml-1" />}
                  </p>
                  {!kotHistoryLoading && kotHistory.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No rounds fired yet</p>
                  )}
                  <div className="space-y-2">
                    {kotHistory.map((kot, idx) => (
                      <div key={kot.id} className="rounded-xl border border-border bg-secondary/50 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-secondary border-b border-border">
                          <span className="text-xs font-bold text-foreground">Round {idx + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {kot.fireTime ? new Date(kot.fireTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                            </span>
                            <button
                              onClick={() => openEditKot(kot)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary text-[9px] font-bold hover:bg-primary/25 transition-all"
                              title="Edit this round"
                            >
                              <Edit2 size={8} />
                              Edit
                            </button>
                            <button
                              onClick={() => openDeleteKot(kot, `Round ${idx + 1}`)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[9px] font-bold hover:bg-destructive/20 transition-all"
                              title="Delete this round"
                            >
                              <Trash2 size={8} />
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="px-3 py-2 space-y-1">
                          {kot.items.map((item, iIdx) => (
                            <div key={iIdx} className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-sm border-2 flex-shrink-0 ${item.isVeg ? 'border-accent' : 'border-red-500'}`}>
                                <div className={`w-1 h-1 rounded-full m-auto mt-0.5 ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                              </div>
                              <span className="text-[11px] text-foreground flex-1 truncate">{item.name}</span>
                              <span className="text-[11px] font-bold text-muted-foreground">×{item.qty}</span>
                            </div>
                          ))}
                          {kot.items.length === 0 && (
                            <p className="text-[10px] text-muted-foreground italic">No items</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
            <Utensils size={32} className="mb-3 opacity-20" />
            <p className="text-sm font-semibold">Select a table</p>
            <p className="text-xs opacity-60 mt-1 text-center">Click any table on the floor plan to view details</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Edit KOT Round
      ══════════════════════════════════════════════════════════════════ */}
      {editingKotId && selectedTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg mx-0 sm:mx-4 flex flex-col" style={{ maxHeight: '88vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Edit KOT Round — {selectedTable.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Modify quantities or remove items from this round</p>
              </div>
              <button onClick={closeEditKot} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row flex-1 min-h-0">
              {/* Current items */}
              <div className="flex-1 flex flex-col min-w-0 border-b sm:border-b-0 sm:border-r border-border">
                <div className="px-4 py-2.5 border-b border-border flex-shrink-0 flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground">Current Items</p>
                  <button
                    onClick={() => { loadMenuItems(); setShowAddToKotPanel(!showAddToKotPanel); }}
                    className="flex items-center gap-1 px-7 py-1 bg-primary/15 border border-primary/30 text-primary rounded-lg text-xs font-semibold hover:bg-primary/25 transition-all"
                  >
                    <Plus size={10} />
                    Add Item
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2" style={{ maxHeight: '40vh' }}>
                  {editKotItems.filter((i) => i.qty > 0).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                      <AlertTriangle size={20} className="mb-1 opacity-30" />
                      <p className="text-xs">All items removed</p>
                    </div>
                  ) : (
                    editKotItems.filter((i) => i.qty > 0).map((item) => (
                      <div key={`ci-${item.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary border border-border">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">₹{item.price} × {item.qty}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => removeFromCart(item.menuItemId)} className="w-6 h-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center hover:border-red-500/40 hover:text-red-400 transition-all">
                            <Minus size={10} />
                          </button>
                          <button onClick={() => addToCart({ id: item.menuItemId, name: item.name, price: item.price, category: '', isVeg: item.isVeg, gstRate: item.gstRate, available: true })}>
                            <Plus size={10} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add items panel */}
              {showAddToKotPanel && (
                <div className="w-full sm:w-52 flex-shrink-0 flex flex-col border-t sm:border-t-0 border-border">
                  <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                        placeholder="Search menu…"
                        className="w-full pl-7 pr-2 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1" style={{ maxHeight: '30vh' }}>
                    {menuLoading ? (
                      <div className="flex items-center justify-center h-20">
                        <Loader2 size={18} className="animate-spin text-primary" />
                      </div>
                    ) : (
                      menuItems.filter((m) => !menuSearch || m.name.toLowerCase().includes(menuSearch.toLowerCase())).map((item) => (
                        <button
                          key={`addkot-${item.id}`}
                          onClick={() => editKotAddMenuItem(item)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-secondary border border-border hover:border-primary/30 text-left transition-all"
                        >
                          <div className={`w-2 h-2 rounded-sm border flex-shrink-0 ${item.isVeg ? 'border-accent' : 'border-red-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">₹{item.price}</p>
                          </div>
                          <Plus size={10} className="text-primary flex-shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
              <button
                onClick={closeEditKot}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveEditKot}
                disabled={editKotSaving}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                {editKotSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Delete KOT Round Confirmation
      ══════════════════════════════════════════════════════════════════ */}
      {deletingKotId && selectedTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-destructive" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Delete {deleteKotRoundLabel}?</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Table {selectedTable.label}</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              All items in <span className="font-semibold text-foreground">{deleteKotRoundLabel}</span> will be permanently removed and the running amount will be updated.
            </p>
            <div className="flex gap-2">
              <button
                onClick={closeDeleteKot}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteKot}
                disabled={deleteKotConfirming}
                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
              >
                {deleteKotConfirming ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete Round
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Add Table
      ══════════════════════════════════════════════════════════════════ */}
      {showAddTableModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-0 sm:mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Add New Table</h3>
              <button onClick={() => setShowAddTableModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Table Name / Number</label>
                <input
                  value={addTableLabel}
                  onChange={(e) => setAddTableLabel(e.target.value)}
                  placeholder="e.g. T1, Table 5, Bar 2"
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Section</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {sections.map((s) => (
                    <button
                      key={`add-sec-${s}`}
                      onClick={() => setAddTableSection(s)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                        addTableSection === s ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-secondary border-border text-foreground hover:border-primary/30'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Capacity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAddTableCapacity((c) => Math.max(1, c - 1))}
                    className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-2xl font-black text-foreground w-10 text-center">{addTableCapacity}</span>
                  <button
                    onClick={() => setAddTableCapacity((c) => c + 1)}
                    className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground">seats</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddTableModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddTable}
                disabled={!addTableLabel.trim() || addTableLoading}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
              >
                {addTableLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Edit Table
      ══════════════════════════════════════════════════════════════════ */}
      {showEditTableModal && editTableTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-0 sm:mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Edit Table — {editTableTarget.label}</h3>
              <button onClick={() => setShowEditTableModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Table Name / Number</label>
                <input
                  value={editTableLabel}
                  onChange={(e) => setEditTableLabel(e.target.value)}
                  placeholder="e.g. T1, Table 5, Bar 2"
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Section</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {sections.map((s) => (
                    <button
                      key={`edit-sec-${s}`}
                      onClick={() => setEditTableSection(s)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                        editTableSection === s ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-secondary border-border text-foreground hover:border-primary/30'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Capacity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditTableCapacity((c) => Math.max(1, c - 1))}
                    className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-2xl font-black text-foreground w-10 text-center">{editTableCapacity}</span>
                  <button
                    onClick={() => setEditTableCapacity((c) => c + 1)}
                    className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground">seats</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditTableModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmEditTable}
                disabled={!editTableLabel.trim() || editTableLoading}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
              >
                {editTableLoading ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Delete Table Confirmation
      ══════════════════════════════════════════════════════════════════ */}
      {showDeleteTableModal && deleteTableTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Delete Table?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{deleteTableTarget.label} · {deleteTableTarget.section}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Table <span className="font-semibold text-foreground">"{deleteTableTarget.label}"</span> will be permanently removed from the floor plan. This action cannot be undone.
            </p>
            {(deleteTableTarget.status !== 'available' && deleteTableTarget.status !== 'cleaning') && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-400 font-medium">This table is currently {deleteTableTarget.status}. Clear it before deleting.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteTableModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTable}
                disabled={deleteTableLoading || (deleteTableTarget.status !== 'available' && deleteTableTarget.status !== 'cleaning')}
                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
              >
                {deleteTableLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Seat Table
      ══════════════════════════════════════════════════════════════════ */}
      {showSeatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-0 sm:mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Seat Table</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tables.find((t) => t.id === seatTargetId)?.label ?? ''}
                </p>
              </div>
              <button onClick={() => setShowSeatModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                  Captain Name <span className="text-destructive">*</span>
                </label>
                <select
                  value={seatCaptain}
                  onChange={(e) => setSeatCaptain(e.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                  required
                >
                  <option value="">— Select Captain —</option>
                  {captainList.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Number of Covers</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSeatCovers((c) => Math.max(1, c - 1))}
                    className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-2xl font-black text-foreground w-10 text-center">{seatCovers}</span>
                  <button
                    onClick={() => setSeatCovers((c) => c + 1)}
                    className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground">guests</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSeatModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmSeat}
                disabled={!seatCaptain.trim() || seatLoading}
                className="flex-1 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                {seatLoading ? <Loader2 size={14} className="animate-spin" /> : <Utensils size={14} />}
                Seat Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: Assign Captain
      ══════════════════════════════════════════════════════════════════ */}
      {showAssignModal && selectedTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-0 sm:mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Assign Captain</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTable.label}</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                  Captain Name <span className="text-destructive">*</span>
                </label>
                <select
                  value={assignCaptain}
                  onChange={(e) => setAssignCaptain(e.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                  required
                >
                  <option value="">— Select Captain —</option>
                  {captainList.map((s) => (
                    <option key={`assign-${s.id}`} value={s.name}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmAssignCaptain}
                disabled={!assignCaptain.trim() || assignLoading}
                className="flex-1 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                {assignLoading ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PANEL: Per-table ordering (Add Items / Fire KOT)
      ══════════════════════════════════════════════════════════════════ */}
      {showOrderPanel && selectedTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl mx-0 sm:mx-4 flex flex-col" style={{ maxHeight: '92vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    Add Items — {selectedTable.label}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-bold">
                    Round {(selectedTable.kotCount ?? 0) + 1}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Captain: {selectedTable.captain ?? 'Unassigned'} · {selectedTable.covers ?? 0} covers
                  {(selectedTable.kotCount ?? 0) > 0 && (
                    <span className="ml-2 text-muted-foreground">· {selectedTable.kotCount} round{selectedTable.kotCount === 1 ? '' : 's'} fired</span>
                  )}
                </p>
              </div>
              <button onClick={closeOrderPanel} className="text-muted-foreground hover:text-foreground p-1">
                <X size={18} />
              </button>
            </div>

            {/* Body: stacked on mobile, side-by-side on sm+ */}
            <div className="flex flex-col sm:flex-row flex-1 min-h-0">
              {/* Menu side */}
              <div className="flex-1 flex flex-col min-w-0 border-b sm:border-b-0 sm:border-r border-border">
                {/* Search + category */}
                <div className="px-3 sm:px-4 py-3 border-b border-border flex-shrink-0 space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search menu…"
                      className="w-full pl-8 pr-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                    {menuCategories.map((cat) => (
                      <button
                        key={`mcat-${cat}`}
                        onClick={() => setMenuCategory(cat)}
                        className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          menuCategory === cat ? 'bg-primary text-white' : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Menu list */}
                <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1.5" style={{ maxHeight: '40vh' }}>
                  {menuLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 size={24} className="animate-spin text-primary" />
                    </div>
                  ) : filteredMenu.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <Utensils size={24} className="mb-2 opacity-30" />
                      <p className="text-sm">No items found</p>
                    </div>
                  ) : (
                    filteredMenu.map((item) => {
                      const inCart = cart.find((c) => c.menuItemId === item.id);
                      return (
                        <div
                          key={`mi-${item.id}`}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary border border-border hover:border-primary/30 transition-all"
                        >
                          <div className={`w-3 h-3 rounded-sm border-2 flex-shrink-0 ${item.isVeg ? 'border-accent' : 'border-red-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full m-auto mt-0.5 ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">₹{item.price} · {item.category}</p>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="w-6 h-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center hover:border-red-500/40 hover:text-red-400 transition-all"
                              >
                                <Minus size={10} className="text-primary" />
                              </button>
                              <span className="text-sm font-bold text-primary w-5 text-center">{inCart.qty}</span>
                              <button
                                onClick={() => addToCart({ id: item.id, name: item.name, price: item.price, category: '', isVeg: item.isVeg, gstRate: item.gstRate, available: true })}
                                className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/90 transition-all"
                              >
                                <Plus size={10} className="text-white" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/90 transition-all flex-shrink-0"
                            >
                              <Plus size={13} className="text-white" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Cart side */}
              <div className="w-full sm:w-52 flex-shrink-0 flex flex-col">
                <div className="px-3 py-3 border-b border-border flex-shrink-0 flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground">Order Cart</p>
                  {cart.length > 0 && (
                    <button onClick={clearCart} className="text-[10px] text-red-400 hover:text-red-300 font-medium">
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5" style={{ maxHeight: '25vh' }}>
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
                      <ShoppingCart size={20} className="mb-1 opacity-30" />
                      <p className="text-[11px]">Cart is empty</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={`ci-${item.menuItemId}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary border border-border">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">₹{item.price} × {item.qty}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => removeFromCart(item.menuItemId)} className="w-6 h-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center hover:border-red-500/40 hover:text-red-400 transition-all">
                            <Minus size={10} />
                          </button>
                          <button onClick={() => addToCart({ id: item.menuItemId, name: item.name, price: item.price, category: '', isVeg: item.isVeg, gstRate: item.gstRate, available: true })}>
                            <Plus size={10} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {/* Cart totals + fire KOT */}
                {cart.length > 0 && (
                  <div className="p-3 border-t border-border flex-shrink-0 space-y-2">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>₹{cartTotals.subtotal}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>GST</span>
                        <span>₹{cartTotals.gst}</span>
                      </div>
                      <div className="flex justify-between font-bold text-foreground">
                        <span>Total</span>
                        <span>₹{cartTotals.total}</span>
                      </div>
                    </div>
                    <button
                      onClick={fireKOT}
                      disabled={kotLoading}
                      className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5"
                    >
                      {kotLoading ? <Loader2 size={12} className="animate-spin" /> : <ChefHat size={12} />}
                      Fire KOT · Round {(selectedTable.kotCount ?? 0) + 1}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}