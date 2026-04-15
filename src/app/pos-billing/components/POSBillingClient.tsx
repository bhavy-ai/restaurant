'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ShoppingCart, Printer, CreditCard, Smartphone, Banknote, Plus, Minus, Trash2, Tag, Users, X, CheckCircle, Utensils, Bike, Package, SplitSquareVertical, RotateCcw, Loader2, Gift, Search, AlertTriangle, Eye, Bell } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { menuService, tableService, billService, shiftService, kotService } from '@/lib/services/restaurantService';
import { auditService } from '@/lib/services/restaurantService';
import { offlineQueue } from '@/lib/offlineQueue';
import { generateIdempotencyKey } from '@/lib/offlineQueue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import OfflineQueuePanel from '@/components/OfflineQueuePanel';
import GSTInvoice from '@/components/GSTInvoice';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────
interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isVeg: boolean;
  gstRate: number;
  hsnCode: string;
  available: boolean;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  gstRate: number;
  hsnCode?: string;
  note?: string;
  isVeg: boolean;
}

interface PendingPosOrder {
  id: string;
  orderNumber: string;
  orderType: 'takeaway' | 'delivery';
  cart: CartItem[];
  total: number;
  createdAt: string;
}

interface Table {
  id: string;
  label: string;
  status: 'available' | 'occupied' | 'bill_requested';
  captain?: string;
}

type OrderType = 'dine-in' | 'takeaway' | 'delivery';
type PaymentMode = 'cash' | 'upi' | 'card' | 'split';

// ── Helper ─────────────────────────────────────────────────────────────────
function calcCart(cart: CartItem[], discountPct: number) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const taxable = subtotal - discountAmt;
  const gstGroups: Record<number, number> = {};
  cart.forEach((i) => {
    const base = (i.price * i.qty * (1 - discountPct / 100));
    gstGroups[i.gstRate] = (gstGroups[i.gstRate] || 0) + base;
  });
  let totalGst = 0;
  const gstBreakdown = Object.entries(gstGroups).map(([rate, base]) => {
    const rateNum = Number(rate);
    const gst = Math.round(base * rateNum / 100);
    totalGst += gst;
    return { rate: rateNum, base: Math.round(base), cgst: Math.round(gst / 2), sgst: Math.round(gst / 2) };
  });
  const grandTotal = taxable + totalGst;
  return { subtotal, discountAmt, taxable, gstBreakdown, totalGst, grandTotal };
}

const menuCategories = ['All', 'Starters', 'Main Course', 'Breads', 'Rice & Biryani', 'Beverages', 'Desserts'];

function getPosDraftKey(restaurantId?: string, outletSlug?: string) {
  return restaurantId ? `restro_pos_draft_${restaurantId}_${outletSlug || 'default'}` : null;
}

function getPosPendingOrdersKey(restaurantId?: string, outletSlug?: string) {
  return restaurantId ? `restro_pos_pending_orders_${restaurantId}_${outletSlug || 'default'}` : null;
}

// ── Recipe stock deduction helper ─────────────────────────────────────────
async function deductRecipeStockForCart(supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>, cartItems: CartItem[]) {
  try {
    const menuItemIds = cartItems.map(c => c.menuItemId);
    const { data: recipes } = await supabase
      .from('recipes')
      .select('menu_item_id, ingredient_id, quantity_used')
      .in('menu_item_id', menuItemIds);

    if (!recipes || recipes.length === 0) return;

    const ingredientIds = [...new Set(recipes.map((r: any) => r.ingredient_id))];
    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, current_stock')
      .in('id', ingredientIds);

    if (!ingredients) return;

    const stockMap: Record<string, number> = {};
    ingredients.forEach((ing: any) => { stockMap[ing.id] = Number(ing.current_stock); });

    const deductions: Record<string, number> = {};
    cartItems.forEach(cartItem => {
      const itemRecipes = recipes.filter((r: any) => r.menu_item_id === cartItem.menuItemId);
      itemRecipes.forEach((recipe: any) => {
        const totalDeduct = Number(recipe.quantity_used) * cartItem.qty;
        deductions[recipe.ingredient_id] = (deductions[recipe.ingredient_id] || 0) + totalDeduct;
      });
    });

    const updates = Object.entries(deductions).map(([ingredientId, deductAmount]) => {
      const newStock = Math.max(0, (stockMap[ingredientId] || 0) - deductAmount);
      return supabase
        .from('ingredients')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', ingredientId);
    });

    await Promise.all(updates);
  } catch (e: any) {
    // Non-blocking
    console.warn('Recipe stock deduction failed (non-blocking):', e.message);
  }
}

// ── Main Component ─────────────────────────────────────────────
export default function POSBillingClient() {
  const searchParams = useSearchParams();
  const preloadTable = searchParams?.get('table') ?? null;
  const preloadCovers = searchParams?.get('covers') ? Number(searchParams.get('covers')) : null;

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('dine-in');
  const [covers, setCovers] = useState(preloadCovers ?? 2);
  const [discountPct, setDiscountPct] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [cashTendered, setCashTendered] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [showKotModal, setShowKotModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [searchItem, setSearchItem] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [billCounter, setBillCounter] = useState(1192);
  const networkStatus = useNetworkStatus();
  const { isOnline } = networkStatus;
  const [showMobileCart, setShowMobileCart] = useState(false);

  // ── Loyalty state ──────────────────────────────────────────────────────
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<any>(null);
  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [showLoyaltyPanel, setShowLoyaltyPanel] = useState(false);
  const [loyaltySearching, setLoyaltySearching] = useState(false);
  const [kotSentForCart, setKotSentForCart] = useState(false);

  // ── KOT Printer ────────────────────────────────────────────────────────
  const [kotPrinterIp, setKotPrinterIp] = useState<string | null>(null);

  // ── GST Invoice ────────────────────────────────────────────────────────
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastBillData, setLastBillData] = useState<any>(null);

  const supabase = createClient();
  const { staffUser, activeRestaurant, activeOutlet } = useAuth();
  const steward = selectedTable?.captain?.trim() || staffUser?.name || 'Captain';
  const restaurantId = activeRestaurant?.id;
  const outletSlug = activeOutlet?.slug || staffUser?.outlet || 'koramangala';
  const draftKey = getPosDraftKey(restaurantId, outletSlug);
  const pendingOrdersKey = getPosPendingOrdersKey(restaurantId, outletSlug);
  const draftLoadedRef = useRef(false);
  const pendingLoadedRef = useRef(false);
  const [pendingPosOrders, setPendingPosOrders] = useState<PendingPosOrder[]>([]);
  const [activePendingOrderId, setActivePendingOrderId] = useState<string | null>(null);

  // ── Idempotency keys (stable per session action) ───────────────────────
  const [kotIdempotencyKey, setKotIdempotencyKey] = useState<string>('');
  const [billIdempotencyKey, setBillIdempotencyKey] = useState<string>('');

  // ── Void Order state ───────────────────────────────────────────────────
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidOtherReason, setVoidOtherReason] = useState('');

  // ── Bill Preview state ─────────────────────────────────────────────────
  const [showBillPreview, setShowBillPreview] = useState(false);

  // ── Load initial data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!restaurantId) {
      setMenuItems([]);
      setTables([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [menuData, tableData, shift] = await Promise.all([
        menuService.getAll(outletSlug, { restaurantId, outletSlug }),
        tableService.getAll(outletSlug, { restaurantId, outletSlug }),
        shiftService.getActive(outletSlug, { restaurantId, outletSlug }),
      ]);
      setMenuItems(menuData);
      const posTables = tableData
        .filter((t) => ['Indoor', 'Bar', 'Outdoor', 'Private Dining'].includes(t.section))
        .map((t) => ({ id: t.id, label: t.label, status: t.status as Table['status'], captain: t.captain || undefined }));
      setTables(posTables);

      // If navigated from table management with a pre-selected table, auto-select it
      if (preloadTable) {
        const match = tableData.find((t: any) => t.label === preloadTable);
        if (match) {
          setSelectedTable({ id: match.id, label: match.label, status: match.status as Table['status'], captain: match.captain || undefined });
          setOrderType('dine-in');
          if (preloadCovers) setCovers(preloadCovers);

          // ── Load all KOT items for this table to populate the bill cart ──
          try {
            const supabaseClient = createClient();
            const { data: kots } = await supabaseClient
              .from('kots')
              .select('id, kot_number, fire_time, kot_items(id, name, qty, note, is_veg, menu_item_id)')
              .eq('table_label', preloadTable)
              .not('status', 'in', '("voided")')
              .order('fire_time', { ascending: true });

            if (kots && kots.length > 0) {
              // Aggregate all items across all KOTs into a single cart
              const aggregatedCart: CartItem[] = [];
              kots.forEach((kot: any) => {
                (kot.kot_items || []).forEach((item: any) => {
                  const menuMatch = menuData.find((m: MenuItem) => m.id === item.menu_item_id);
                  const existing = aggregatedCart.find((c) => c.menuItemId === item.menu_item_id);
                  if (existing) {
                    existing.qty += item.qty;
                  } else {
                    aggregatedCart.push({
                      menuItemId: item.menu_item_id || '',
                      name: item.name,
                      price: menuMatch ? menuMatch.price : 0,
                      qty: item.qty,
                      gstRate: menuMatch ? menuMatch.gstRate : 5,
                      hsnCode: menuMatch ? menuMatch.hsnCode : '',
                      isVeg: item.is_veg,
                      note: item.note || undefined,
                    });
                  }
                });
              });
              if (aggregatedCart.length > 0) {
                setCart(aggregatedCart);
                toast.success(`Table ${match.label} — ${aggregatedCart.length} item(s) loaded from ${kots.length} round(s)`);
              } else {
                toast.success(`Table ${match.label} pre-loaded — ready to bill`);
              }
            } else {
              toast.success(`Table ${match.label} pre-loaded — ready to bill`);
            }
          } catch (kotErr: any) {
            console.warn('Failed to load KOT items for table:', kotErr.message);
            toast.success(`Table ${match.label} pre-loaded — ready to bill`);
          }
        } else if (posTables.length > 0) {
          setSelectedTable(posTables[0]);
        }
      } else if (posTables.length > 0) {
        setSelectedTable(posTables[0]);
      }

      if (shift) setActiveShiftId(shift.id);

      // Seed the bill counter from the latest persisted bill so we do not
      // reuse an existing bill number and accidentally hit idempotency replay.
      const { data: latestBill } = await supabase
        .from('bills')
        .select('bill_number')
        .eq('restaurant_id', restaurantId)
        .eq('outlet', outletSlug)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestBillNumber = String(latestBill?.bill_number || '');
      const latestBillMatch = latestBillNumber.match(/(\d+)$/);
      if (latestBillMatch) {
        const nextBillCounter = Number(latestBillMatch[1]) + 1;
        if (Number.isFinite(nextBillCounter) && nextBillCounter > 0) {
          setBillCounter(nextBillCounter);
        }
      }

      // Load KOT printer IP
      const { data: printers } = await supabase
        .from('printer_config')
        .select('ip_address, port')
        .eq('outlet', outletSlug)
        .eq('restaurant_id', restaurantId)
        .eq('printer_type', 'kot')
        .eq('enabled', true)
        .limit(1);
      if (printers && printers.length > 0) {
        setKotPrinterIp(printers[0].ip_address);
      }
    } catch (err: any) {
      toast.error('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [preloadTable, preloadCovers, restaurantId, outletSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    draftLoadedRef.current = false;
    if (!draftKey || preloadTable) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && typeof draft === 'object') {
        setCart(Array.isArray(draft.cart) ? draft.cart : []);
        setSelectedTable(draft.selectedTable || null);
        setOrderType(draft.orderType || 'dine-in');
        if (typeof draft.covers === 'number') setCovers(draft.covers);
        if (typeof draft.discountPct === 'number') setDiscountPct(draft.discountPct);
        if (typeof draft.couponCode === 'string') setCouponCode(draft.couponCode);
        if (typeof draft.paymentMode === 'string') setPaymentMode(draft.paymentMode);
        if (typeof draft.cashTendered === 'string') setCashTendered(draft.cashTendered);
        if (typeof draft.splitCash === 'string') setSplitCash(draft.splitCash);
        if (typeof draft.splitUpi === 'string') setSplitUpi(draft.splitUpi);
      }
    } catch {
      // Ignore malformed drafts and start fresh.
    } finally {
      draftLoadedRef.current = true;
    }
  }, [draftKey, preloadTable]);

  useEffect(() => {
    if (!draftKey || !draftLoadedRef.current || preloadTable) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        cart,
        selectedTable,
        orderType,
        covers,
        discountPct,
        couponCode,
        paymentMode,
        cashTendered,
        splitCash,
        splitUpi,
      }));
    } catch {
      // Non-blocking
    }
  }, [draftKey, preloadTable, cart, selectedTable, orderType, covers, discountPct, couponCode, paymentMode, cashTendered, splitCash, splitUpi]);

  useEffect(() => {
    pendingLoadedRef.current = false;
    if (!pendingOrdersKey) return;
    try {
      const raw = localStorage.getItem(pendingOrdersKey);
      if (!raw) {
        setPendingPosOrders([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setPendingPosOrders(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPendingPosOrders([]);
    } finally {
      pendingLoadedRef.current = true;
    }
  }, [pendingOrdersKey]);

  useEffect(() => {
    if (!pendingOrdersKey || !pendingLoadedRef.current) return;
    try {
      localStorage.setItem(pendingOrdersKey, JSON.stringify(pendingPosOrders));
    } catch {
      // Non-blocking
    }
  }, [pendingOrdersKey, pendingPosOrders]);

  // ── Real-time subscriptions ────────────────────────────────────────────
  useEffect(() => {
    // Track last-seen status per table to avoid duplicate toasts when both
    // postgres_changes and broadcast channels fire for the same event.
    const lastSeenStatus = new Map<string, string>();

    const menuChannel = supabase
      .channel('pos_menu_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setMenuItems((prev) =>
            prev.map((m) =>
              m.id === payload.new.id
                ? { ...m, available: payload.new.available, price: Number(payload.new.price) }
                : m
            )
          );
        } else if (payload.eventType === 'INSERT') {
          const r = payload.new;
          setMenuItems((prev) => [...prev, {
            id: r.id, name: r.name, price: Number(r.price), category: r.category,
            isVeg: r.is_veg, gstRate: r.gst_rate, hsnCode: r.hsn_code, available: r.available,
          }]);
        }
      })
      .subscribe();

    const tableChannel = supabase
      .channel('pos_tables')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables' }, (payload) => {
        const newStatus = payload.new.status as Table['status'];
        const tableId = payload.new.id as string;
        const tableLabel = payload.new.label as string;
        const newCaptain = (payload.new.captain as string | null) || undefined;

        setTables((prev) =>
          prev.map((t) =>
            t.id === tableId ? { ...t, status: newStatus, captain: newCaptain } : t
          )
        );
        setSelectedTable((prev) =>
          prev?.id === tableId ? { ...prev, status: newStatus, captain: newCaptain } : prev
        );

        // Show toast only if this status change hasn't already been announced
        // by the broadcast channel (deduplicate using label+status key)
        const dedupeKey = `${tableLabel}:${newStatus}`;
        if (lastSeenStatus.get(tableLabel) !== newStatus) {
          lastSeenStatus.set(tableLabel, newStatus);
          if (newStatus === 'bill_requested') {
            toast.info(`🔔 Table ${tableLabel} — Bill Requested`, { duration: 6000 });
          } else if (newStatus === 'occupied') {
            toast.success(`🍽️ Table ${tableLabel} — Now Occupied`);
          } else if (newStatus === 'available') {
            toast.success(`✅ Table ${tableLabel} — Now Available`);
          }
        } else {
          // Clear the dedup key so next change is always announced
          lastSeenStatus.delete(dedupeKey);
        }
      })
      .subscribe();

    // ── Table status sync from Table Management (broadcast) ────────────
    const tableStatusSyncChannel = supabase
      .channel('table_status_sync')
      .on('broadcast', { event: 'table_status_changed' }, ({ payload }) => {
        if (!payload?.label) return;
        const newStatus = payload.status as Table['status'];
        const tableLabel = payload.label as string;
        const captain = (payload.captain as string | undefined) || undefined;

        // Update table status in POS table selector
        setTables((prev) =>
          prev.map((t) =>
            t.label === tableLabel ? { ...t, status: newStatus, captain } : t
          )
        );
        setSelectedTable((prev) =>
          prev?.label === tableLabel ? { ...prev, status: newStatus, captain } : prev
        );

        // Mark as seen so the postgres_changes channel doesn't double-toast
        lastSeenStatus.set(tableLabel, newStatus);

        if (newStatus === 'bill_requested') {
          toast.info(`🔔 Table ${tableLabel} — Bill Requested`, { duration: 6000 });
        } else if (newStatus === 'occupied') {
          toast.success(`🍽️ Table ${tableLabel} — Now Occupied`);
        } else if (newStatus === 'available') {
          toast.success(`✅ Table ${tableLabel} — Now Available`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(tableChannel);
      supabase.removeChannel(tableStatusSyncChannel);
    };
  }, []);

  const { subtotal, discountAmt, gstBreakdown, totalGst, grandTotal } = calcCart(cart, discountPct);

  const filteredItems = menuItems.filter((m) => {
    const catMatch = selectedCategory === 'All' || m.category === selectedCategory;
    const searchMatch = m.name.toLowerCase().includes(searchItem.toLowerCase());
    return catMatch && searchMatch;
  });

  function addToCart(item: MenuItem) {
    if (!item.available) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      const nextCart = existing ? prev.map((c) => c.menuItemId === item.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { menuItemId: item.id, name: item.name, price: item.price, qty: 1, gstRate: item.gstRate, isVeg: item.isVeg }];
      setKotSentForCart(false);
      return nextCart;
    });
  }

  function updateQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev.map((c) => c.menuItemId === menuItemId ? { ...c, qty: c.qty + delta } : c)
          .filter((c) => c.qty > 0)
    );
    setKotSentForCart(false);
  }

  function removeFromCart(menuItemId: string) {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
    setKotSentForCart(false);
  }

  function applyCoupon() {
    if (couponCode.toUpperCase() === 'WELCOME10') {
      // Role guard: only owner, manager, cashier can apply discounts
      const allowedRoles = ['owner', 'manager', 'cashier'];
      if (staffUser && !allowedRoles.includes(staffUser.role)) {
        toast.error(`Access denied — your role (${staffUser.role}) cannot apply discounts`);
        return;
      }
      setDiscountPct(10);
      toast.success('Coupon applied — 10% discount');
    } else if (couponCode.toUpperCase() === 'FLAT50') {
      toast.error('Coupon FLAT50 is expired');
    } else {
      toast.error('Invalid coupon code');
    }
  }

  async function createKitchenTicket() {
    if (cart.length === 0) { toast.error('Add items before sending KOT'); return false; }
    if (orderType === 'dine-in' && !selectedTable) { toast.error('Select a table before sending KOT'); return false; }
    if (!restaurantId) { toast.error('Restaurant context missing. Refresh and try again.'); return false; }

    if (kotSentForCart) {
      toast.success('KOT already sent for this cart');
      return true;
    }

    const tableLabel = orderType === 'dine-in' ? (selectedTable?.label || '') : orderType === 'takeaway' ? 'TKW' : 'DEL';
    const kotNumber = `K-${Date.now().toString().slice(-4)}`;
    const orderNumber = `POS-${orderType === 'takeaway' ? 'TKW' : 'DEL'}-${Date.now().toString().slice(-6)}`;
    const subtotalLive = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const gstLive = Math.round(subtotalLive * 0.05);
    const totalLive = subtotalLive + gstLive;

    let persistedOrderId: string | undefined;

    if (orderType !== 'dine-in') {
      if (!isOnline) {
        await offlineQueue.enqueue('takeaway_create', {
          restaurant_id: restaurantId,
          outlet: outletSlug,
          order_number: orderNumber,
          order_type: orderType,
          customer_name: activePendingOrderId ? pendingPosOrders.find((o) => o.id === activePendingOrderId)?.orderNumber : `Walk-in ${orderNumber}`,
          customer_phone: null,
          delivery_address: null,
          items: cart.map((c) => ({ name: c.name, qty: c.qty, price: c.price, menuItemId: c.menuItemId, isVeg: c.isVeg })),
          subtotal: subtotalLive,
          gst_amount: gstLive,
          discount_amount: 0,
          total: totalLive,
          payment_mode: paymentMode,
          status: 'pending',
          estimated_time: 20,
          notes: null,
        }, generateIdempotencyKey(`pos_takeaway_${orderNumber}`));
        persistedOrderId = `local-${orderNumber}`;
      } else {
        const { data: row, error: takeawayErr } = await supabase
          .from('takeaway_orders')
          .insert({
            restaurant_id: restaurantId,
            outlet: outletSlug,
            order_number: orderNumber,
            order_type: orderType,
            customer_name: `Walk-in ${orderNumber}`,
            customer_phone: null,
            delivery_address: null,
            items: cart.map((c) => ({ name: c.name, qty: c.qty, price: c.price, menuItemId: c.menuItemId, isVeg: c.isVeg })),
            subtotal: subtotalLive,
            gst_amount: gstLive,
            discount_amount: 0,
            total: totalLive,
            payment_mode: paymentMode,
            status: 'pending',
            estimated_time: 20,
            notes: null,
          })
          .select('id')
          .single();
        if (takeawayErr) throw takeawayErr;
        persistedOrderId = row?.id;
      }
    }

    const kotPayload = {
      kotNumber,
      orderId: orderType === 'dine-in' ? persistedOrderId : undefined,
      tableLabel,
      orderType,
      station: 'Main Kitchen',
      priority: 'normal',
      steward,
      covers: orderType === 'dine-in' ? covers : 0,
      outlet: outletSlug,
      items: cart.map((c) => ({
        menuItemId: c.menuItemId,
        name: c.name,
        qty: c.qty,
        note: c.note,
        isVeg: c.isVeg,
      })),
    };

    if (!isOnline) {
      const kotKey = kotIdempotencyKey || generateIdempotencyKey(`kot_${kotNumber}`);
      setKotIdempotencyKey(kotKey);
      await offlineQueue.enqueue('kot_create', { ...kotPayload, restaurantId, outletSlug }, kotKey);
      setKotSentForCart(true);

      if (orderType !== 'dine-in') {
        const pendingId = persistedOrderId || `local-${orderNumber}`;
        const pending: PendingPosOrder = {
          id: pendingId,
          orderNumber,
          orderType,
          cart: [...cart],
          total: totalLive,
          createdAt: new Date().toISOString(),
        };
        setPendingPosOrders((prev) => [pending, ...prev.filter((o) => o.id !== pendingId)]);
        setActivePendingOrderId(pendingId);
        setCart([]);
        setKotSentForCart(false);
        toast.success(`KOT #${kotNumber} queued. Order parked for billing.`);
        return true;
      }

      toast.success(`KOT #${kotNumber} queued — will sync when online`);
      return true;
    }

    try {
      await kotService.create(kotPayload, { restaurantId, outletSlug });
      setKotSentForCart(true);

      if (orderType === 'dine-in' && selectedTable) {
        try {
          await tableService.update(selectedTable.id, { status: 'occupied' });
          setTables((prev) => prev.map((t) => t.id === selectedTable.id ? { ...t, status: 'occupied' as Table['status'] } : t));
          supabase.channel('table_status_sync').send({
            type: 'broadcast',
            event: 'table_status_changed',
            payload: {
              tableId: selectedTable.id,
              label: selectedTable.label,
              status: 'occupied',
              updatedAt: new Date().toISOString(),
            },
          }).catch(() => {/* non-blocking */});
        } catch {
          // non-blocking
        }
      }

      if (orderType !== 'dine-in') {
        const pendingId = persistedOrderId || `local-${orderNumber}`;
        const pending: PendingPosOrder = {
          id: pendingId,
          orderNumber,
          orderType,
          cart: [...cart],
          total: totalLive,
          createdAt: new Date().toISOString(),
        };
        setPendingPosOrders((prev) => [pending, ...prev.filter((o) => o.id !== pendingId)]);
        setActivePendingOrderId(pendingId);
        setCart([]);
        setKotSentForCart(false);
        toast.success(`KOT #${kotNumber} sent. Order parked for billing.`);
        return true;
      }

      toast.success(`KOT #${kotNumber} sent to kitchen`);
      return true;
    } catch (err: any) {
      toast.error('Failed to send KOT: ' + err.message);
      return false;
    }
  }

  function loadPendingPosOrder(orderId: string) {
    const order = pendingPosOrders.find((o) => o.id === orderId);
    if (!order) return;
    setOrderType(order.orderType);
    setSelectedTable(null);
    setCart(order.cart);
    setActivePendingOrderId(order.id);
    setKotSentForCart(true);
    setShowMobileCart(true);
    toast.success(`Loaded ${order.orderNumber} for billing`);
  }

  function removePendingPosOrder(orderId: string) {
    const target = pendingPosOrders.find((o) => o.id === orderId);
    setPendingPosOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (activePendingOrderId === orderId) {
      setActivePendingOrderId(null);
      setCart([]);
      setKotSentForCart(false);
    }
    toast.success(target ? `${target.orderNumber} removed from parked list` : 'Removed from parked list');
  }

  function startNewClientOrder() {
    setCart([]);
    setKotSentForCart(false);
    setActivePendingOrderId(null);
    setDiscountPct(0);
    setCouponCode('');
    setLoyaltyCustomer(null);
    setLoyaltyPointsToRedeem(0);
    setLoyaltyPhone('');
    setShowLoyaltyPanel(false);
    toast.success('Ready for new client');
  }

  function sendKOT() {
    setShowKotModal(true);
  }

  function openBillPreview() {
    if (cart.length === 0) { toast.error('Add items before settling'); return; }
    setShowBillPreview(true);
  }

  // ── Load KOTs for a bill-requested table and open payment ─────────────
  const [loadingBillTable, setLoadingBillTable] = useState(false);

  function aggregateTableCartFromKOTs(kots: any[]): CartItem[] {
    const aggregatedCart: CartItem[] = [];
    (kots || []).forEach((kot: any) => {
      (kot.kot_items || []).forEach((item: any) => {
        const menuMatch = menuItems.find((m: MenuItem) => m.id === item.menu_item_id);
        const existing = aggregatedCart.find((c) => c.menuItemId === item.menu_item_id);
        if (existing) {
          existing.qty += item.qty;
        } else {
          aggregatedCart.push({
            menuItemId: item.menu_item_id || '',
            name: item.name,
            price: menuMatch ? menuMatch.price : 0,
            qty: item.qty,
            gstRate: menuMatch ? menuMatch.gstRate : 5,
            hsnCode: menuMatch ? menuMatch.hsnCode : '',
            isVeg: item.is_veg,
            note: item.note || undefined,
          });
        }
      });
    });
    return aggregatedCart;
  }

  async function loadCartForTable(table: Table) {
    const supabaseClient = createClient();
    const { data: kots } = await supabaseClient
      .from('kots')
      .select('id, kot_number, fire_time, kot_items(id, name, qty, note, is_veg, menu_item_id)')
      .eq('table_label', table.label)
      .not('status', 'in', '("voided")')
      .order('fire_time', { ascending: true });
    return aggregateTableCartFromKOTs(kots || []);
  }

  async function selectDineInTable(table: Table) {
    setSelectedTable(table);
    setOrderType('dine-in');
    setKotSentForCart(false);
    setActivePendingOrderId(null);

    if (table.status === 'occupied' || table.status === 'bill_requested') {
      try {
        const aggregatedCart = await loadCartForTable(table);
        setCart(aggregatedCart);
      } catch {
        setCart([]);
      }
      return;
    }

    setCart([]);
  }

  async function handleGenerateBillForTable(table: Table) {
    if (loadingBillTable) return;
    setLoadingBillTable(true);
    try {
      setSelectedTable(table);
      setOrderType('dine-in');
      const aggregatedCart = await loadCartForTable(table);

      if (aggregatedCart.length > 0) {
        setCart(aggregatedCart);
        toast.success(`Table ${table.label} — ${aggregatedCart.length} item(s) loaded`);
        setTimeout(() => setShowBillPreview(true), 200);
      } else {
        toast.warning(`Table ${table.label} — no items found in KOTs`);
      }
    } catch (err: any) {
      toast.error('Failed to load table items: ' + err.message);
    } finally {
      setLoadingBillTable(false);
    }
  }

  // ── Loyalty Discount amount
  const loyaltyDiscountAmt = Math.min(loyaltyPointsToRedeem, Math.floor(grandTotal * 0.2)); // max 20% of bill

  async function searchLoyaltyCustomer() {
    if (!loyaltyPhone || loyaltyPhone.length < 10) return;
    setLoyaltySearching(true);
    try {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, loyalty_points, total_spent, visit_count')
        .eq('restaurant_id', restaurantId || '')
        .eq('outlet', outletSlug)
        .eq('phone', loyaltyPhone.startsWith('+') ? loyaltyPhone : `+91${loyaltyPhone.replace(/^0/, '')}`)
        .single();
      if (data) {
        setLoyaltyCustomer(data);
        toast.success(`Found: ${data.name} — ${data.loyalty_points} points`);
      } else {
        toast.error('Customer not found');
        setLoyaltyCustomer(null);
      }
    } catch {
      toast.error('Customer not found');
      setLoyaltyCustomer(null);
    } finally {
      setLoyaltySearching(false);
    }
  }

  async function confirmKOT() {
    setShowKotModal(false);
    if (!kotSentForCart) {
      const kotCreated = await createKitchenTicket();
      if (!kotCreated) {
        setProcessingPayment(false);
        return;
      }
    }

    try {
      const billNum = `B-${billCounter}`;
      const billKey = billIdempotencyKey || generateIdempotencyKey(`bill_${billNum}_${paymentMode}`);
      setBillIdempotencyKey(billKey);

      const finalGrandTotal = grandTotal - loyaltyDiscountAmt;

      const billPayload = {
        billNumber: billNum,
        tableLabel: orderType === 'dine-in' ? (selectedTable?.label || 'TKW') : orderType === 'takeaway' ? 'TKW' : 'DEL',
        covers,
        itemsCount: cart.reduce((s, i) => s + i.qty, 0),
        grossAmount: subtotal,
        discountAmt: discountAmt + loyaltyDiscountAmt,
        gstAmount: totalGst,
        netAmount: finalGrandTotal,
        paymentMode,
        cashTendered: cashTendered ? Number(cashTendered) : undefined,
        cashChange: cashTendered ? Math.max(0, Number(cashTendered) - finalGrandTotal) : undefined,
        splitCash: splitCash ? Number(splitCash) : undefined,
        splitUpi: splitUpi ? Number(splitUpi) : undefined,
        cashier: staffUser?.name || 'Rahul Sharma',
        outlet: outletSlug,
        shiftId: activeShiftId || undefined,
        idempotencyKey: billKey,
      };

      const billResult = await billService.settle(billPayload, { restaurantId: restaurantId || '', outletSlug });
      await deductRecipeStockForCart(supabase, cart);

      // Deduct loyalty points if redeemed
      if (loyaltyCustomer && loyaltyPointsToRedeem > 0) {
        const pointsUsed = Math.min(loyaltyPointsToRedeem, loyaltyCustomer.loyalty_points);
        await supabase
          .from('customers')
          .update({
            loyalty_points: Math.max(0, loyaltyCustomer.loyalty_points - pointsUsed),
            total_spent: (loyaltyCustomer.total_spent || 0) + finalGrandTotal,
            visit_count: (loyaltyCustomer.visit_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', loyaltyCustomer.id);

        // Log redemption
        await supabase.from('loyalty_redemptions').insert({
          restaurant_id: restaurantId,
          outlet: outletSlug,
          customer_id: loyaltyCustomer.id,
          customer_name: loyaltyCustomer.name,
          points_redeemed: pointsUsed,
          discount_amount: loyaltyDiscountAmt,
          bill_number: billNum,
        });
      } else if (loyaltyCustomer) {
        // Earn points: 1 point per ₹10 spent
        const pointsEarned = Math.floor(finalGrandTotal / 10);
        await supabase
          .from('customers')
          .update({
            loyalty_points: (loyaltyCustomer.loyalty_points || 0) + pointsEarned,
            total_spent: (loyaltyCustomer.total_spent || 0) + finalGrandTotal,
            visit_count: (loyaltyCustomer.visit_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', loyaltyCustomer.id);
        toast.success(`+${pointsEarned} loyalty points earned for ${loyaltyCustomer.name}`);
      }

      setBillCounter((c) => c + 1);
      setProcessingPayment(false);
      setShowPayModal(false);
      setBillIdempotencyKey('');

      // Store bill data for invoice
      setLastBillData({
        billNumber: billNum,
        billDate: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        tableLabel: billPayload.tableLabel,
        covers,
        cashier: 'Rahul Sharma',
        paymentMode,
        items: cart.map((c) => ({
          name: c.name,
          hsnCode: c.hsnCode || '2106',
          qty: c.qty,
          price: c.price,
          gstRate: c.gstRate,
          isVeg: c.isVeg,
        })),
        discountPct,
      });

      toast.success(`Bill #${billNum} settled — ₹${finalGrandTotal.toLocaleString('en-IN')} via ${paymentMode.toUpperCase()}`);

      // Log bill settlement to audit trail
      auditService.log({
        staffName: staffUser?.name || 'Staff',
        staffRole: staffUser?.role || 'cashier',
        action: 'BILL_SETTLED',
        entity: billNum,
        details: `Table: ${billPayload.tableLabel} | Amount: ₹${finalGrandTotal.toLocaleString('en-IN')} | Mode: ${paymentMode.toUpperCase()} | Items: ${billPayload.itemsCount}${discountAmt > 0 ? ` | Discount: ₹${discountAmt}` : ''}`,
        severity: 'info',
        outlet: outletSlug,
      }, { restaurantId: restaurantId || '', outletSlug }).catch(() => {/* non-blocking */});

      // Sync bill settlement to Table Management + KDS: mark table as cleaning
      if (orderType === 'dine-in' && selectedTable) {
        try {
          // Update table status to cleaning in DB
          await tableService.markCleaning(selectedTable.id);
          // Broadcast to Table Management + KDS
          supabase.channel('table_status_sync').send({
            type: 'broadcast',
            event: 'table_status_changed',
            payload: {
              tableId: selectedTable.id,
              label: selectedTable.label,
              status: 'cleaning',
              updatedAt: new Date().toISOString(),
            },
          }).catch(() => {/* non-blocking */});
          // Update local POS table state — remove from bill_requested bar and mark available
          setTables((prev) => prev.map((t) => t.id === selectedTable.id ? { ...t, status: 'available' as Table['status'] } : t));
        } catch {
          // Non-blocking — table status sync failure shouldn't block bill settlement
        }
      }

      setShowInvoice(true);

      if (orderType !== 'dine-in' && activePendingOrderId) {
        setPendingPosOrders((prev) => prev.filter((o) => o.id !== activePendingOrderId));
        setActivePendingOrderId(null);
      }

      setCart([]);
      setDiscountPct(0);
      setCouponCode('');
      setLoyaltyCustomer(null);
      setLoyaltyPointsToRedeem(0);
      setLoyaltyPhone('');
      setLoyaltySearching(false);
      setShowLoyaltyPanel(false);
      // Reset selected table so bill-requested bar clears and state is fresh
      setSelectedTable(null);
      setKotSentForCart(false);
    } catch (err: any) {
      setProcessingPayment(false);
      toast.error('Payment failed: ' + err.message);
      await offlineQueue.enqueue('bill_create', { ...billPayload, restaurantId, outletSlug }, billKey);
      toast.info('Bill queued for retry when connection restores');
    }
  }

  const changeAmount = cashTendered ? Math.max(0, Number(cashTendered) - grandTotal) : 0;

  // ── Handle Void / Cancel Order ─────────────────────────────────────────
  async function handleVoidOrder() {
    const reason = voidReason === 'Other' ? voidOtherReason.trim() : voidReason;
    setShowVoidModal(false);

    // Log void to audit trail
    auditService.log({
      staffName: staffUser?.name || 'Staff',
      staffRole: staffUser?.role || 'cashier',
      action: 'ORDER_VOIDED',
      entity: selectedTable?.label || orderType,
      details: `Reason: ${reason} | Items: ${cart.reduce((s, i) => s + i.qty, 0)} | Table: ${selectedTable?.label || orderType}`,
      severity: 'warning',
      outlet: outletSlug,
    }, { restaurantId: restaurantId || '', outletSlug }).catch(() => {/* non-blocking */});

    // ── If the table was bill_requested, mark it available again ──────
    if (orderType === 'dine-in' && selectedTable && selectedTable.status === 'bill_requested') {
      try {
        await tableService.markAvailable(selectedTable.id);
        // Update local state
        setTables((prev) =>
          prev.map((t) => t.id === selectedTable.id ? { ...t, status: 'available' as Table['status'] } : t)
        );
        setSelectedTable((prev) => prev ? { ...prev, status: 'available' as Table['status'] } : prev);
        // Broadcast to Table Management + KDS
        supabase.channel('table_status_sync').send({
          type: 'broadcast',
          event: 'table_status_changed',
          payload: {
            tableId: selectedTable.id,
            label: selectedTable.label,
            status: 'available',
            updatedAt: new Date().toISOString(),
          },
        }).catch(() => {/* non-blocking */});
      } catch {
        // Non-blocking — still clear the cart even if status update fails
      }
    }

    setCart([]);
    setDiscountPct(0);
    setCouponCode('');
    setLoyaltyCustomer(null);
    setLoyaltyPointsToRedeem(0);
    setLoyaltyPhone('');
    setVoidReason('');
    setVoidOtherReason('');
    setKotSentForCart(false);
    toast.success(`Order voided — ${reason}`);
  }

  // ── Handle Payment Confirmation ────────────────────────────────────────
  async function handlePayment() {
    if (cart.length === 0) { toast.error('No items in cart'); return; }
    setProcessingPayment(true);
    await confirmKOT();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm">Loading POS data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full relative">
      <OfflineQueuePanel networkStatus={networkStatus} />

      {/* GST Invoice Modal */}
      {showInvoice && lastBillData && (
        <GSTInvoice
          {...lastBillData}
          onClose={() => setShowInvoice(false)}
        />
      )}

      {/* Mobile cart overlay */}
      {showMobileCart && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setShowMobileCart(false)} />
      )}

      {/* ── LEFT: Menu Browser ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card overflow-x-auto scrollbar-thin">
          {/* Order type */}
          <div className="flex gap-1 p-0.5 bg-secondary rounded-lg flex-shrink-0">
            {(['dine-in', 'takeaway', 'delivery'] as OrderType[]).map((t) => (
              <button
                key={`otype-${t}`}
                onClick={() => setOrderType(t)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  orderType === t ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'dine-in' && <Utensils size={11} />}
                {t === 'takeaway' && <Package size={11} />}
                {t === 'delivery' && <Bike size={11} />}
                <span className="capitalize hidden sm:inline">{t}</span>
              </button>
            ))}
          </div>

          {/* Table selector */}
          {orderType === 'dine-in' && (
            <div className="flex items-center gap-1 flex-wrap">
              {tables.filter((t) => t.status !== 'bill_requested').map((t) => (
                <button
                  key={`tsel-${t.id}`}
                  onClick={() => { void selectDineInTable(t); }}
                  className={`relative px-2 py-1 rounded-md text-xs transition-all ${
                    selectedTable?.id === t.id
                      ? t.status === 'occupied' ?'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold' :'bg-secondary text-muted-foreground border border-border font-bold'
                      : t.status === 'occupied' ?'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 font-normal' :'bg-secondary text-muted-foreground hover:text-foreground border border-border font-normal'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Covers */}
          {orderType === 'dine-in' && (
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              <Users size={12} className="text-muted-foreground" />
              <button onClick={() => setCovers(Math.max(1, covers - 1))} className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
                <Minus size={10} />
              </button>
              <span className="text-sm font-bold text-foreground w-4 text-center">{covers}</span>
              <button onClick={() => setCovers(covers + 1)} className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
                <Plus size={10} />
              </button>
            </div>
          )}

          {/* Mobile cart toggle */}
          <button
            onClick={() => setShowMobileCart(true)}
            className="lg:hidden ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold flex-shrink-0"
          >
            <ShoppingCart size={13} />
            {cart.length > 0 && <span className="bg-white text-primary rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{cart.reduce((s, i) => s + i.qty, 0)}</span>}
            <span>₹{grandTotal.toLocaleString('en-IN')}</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <input
            value={searchItem}
            onChange={(e) => setSearchItem(e.target.value)}
            placeholder="Search menu items..."
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 px-3 py-2 border-b border-border overflow-x-auto scrollbar-thin">
          {menuCategories.map((cat) => (
            <button
              key={`cat-${cat}`}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Item Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.menuItemId === item.id);
              return (
                <button
                  key={`menu-${item.id}`}
                  onClick={() => addToCart(item)}
                  disabled={!item.available}
                  className={`relative flex flex-col items-start p-2.5 md:p-3 rounded-xl border text-left transition-all active:scale-95 ${
                    !item.available
                      ? 'opacity-40 cursor-not-allowed bg-secondary border-border'
                      : inCart
                      ? 'bg-primary/10 border-primary/50 hover:bg-primary/15' :'bg-card border-border hover:border-primary/40 hover:bg-secondary'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center mb-1.5 ${item.isVeg ? 'border-accent' : 'border-red-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-snug mb-1">{item.name}</p>
                  <p className="text-sm font-bold text-primary font-mono">₹{item.price}</p>
                  {!item.available && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-red-500/20 text-red-400 px-1 rounded">86</span>
                  )}
                  {inCart && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">
                      {inCart.qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Utensils size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No items found for "{searchItem}"</p>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Order Summary + Payment ────────────────────────── */}
      <div className={`
        fixed inset-y-0 right-0 z-50 lg:relative lg:z-auto
        w-80 xl:w-96 flex flex-col bg-card flex-shrink-0
        transition-transform duration-300 ease-in-out
        ${showMobileCart ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border lg:hidden">
          <span className="text-sm font-bold text-foreground">Order Summary</span>
          <button onClick={() => setShowMobileCart(false)} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* ── Bill Requested Quick-Access Bar ───────────────────────── */}
        {tables.filter(t => t.status === 'bill_requested').length > 0 && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bell size={11} className="text-red-400 animate-pulse" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Bill Requested</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tables.filter(t => t.status === 'bill_requested').map(t => (
                <button
                  key={`br-${t.id}`}
                  onClick={() => handleGenerateBillForTable(t)}
                  disabled={loadingBillTable}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-60"
                >
                  {loadingBillTable && selectedTable?.id === t.id ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <CheckCircle size={10} />
                  )}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Order header — desktop */}
        <div className="hidden lg:flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {orderType === 'dine-in' ? (selectedTable?.label || 'Select Table') : orderType === 'takeaway' ? 'Takeaway' : 'Delivery'}
              </span>
              {orderType === 'dine-in' && (
                <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">{covers} covers</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{steward} · Live Order</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={sendKOT}
              disabled={cart.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/15 border border-accent/40 text-accent rounded-lg text-xs font-semibold hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Printer size={12} />
              KOT
            </button>
            <button
              onClick={startNewClientOrder}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Clear order"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* Pending takeaway/delivery orders */}
        {orderType !== 'dine-in' && pendingPosOrders.length > 0 && (
          <div className="px-3 py-2 border-b border-border bg-secondary/20">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Parked Orders</p>
              <button
                onClick={startNewClientOrder}
                className="text-[10px] px-2 py-0.5 rounded border border-border bg-card text-foreground hover:border-primary/40"
              >
                New Client
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pendingPosOrders.slice(0, 8).map((o) => (
                <button
                  key={`pending-${o.id}`}
                  onClick={() => loadPendingPosOrder(o.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${activePendingOrderId === o.id ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-card border-border text-foreground hover:border-primary/40'}`}
                >
                  <span>{o.orderNumber} · ₹{o.total}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    title="Remove from parked list"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePendingPosOrder(o.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        removePendingPosOrder(o.id);
                      }
                    }}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-destructive/15 hover:text-destructive"
                  >
                    <X size={10} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mobile order header */}
        <div className="flex lg:hidden items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">
              {orderType === 'dine-in' ? (selectedTable?.label || 'Table') : orderType === 'takeaway' ? 'Takeaway' : 'Delivery'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={sendKOT} disabled={cart.length === 0} className="flex items-center gap-1 px-2 py-1 bg-accent/15 border border-accent/40 text-accent rounded-lg text-xs font-semibold disabled:opacity-50">
              <Printer size={11} /> KOT
            </button>
            <button onClick={startNewClientOrder} className="w-6 h-6 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive">
              <RotateCcw size={11} />
            </button>
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1">
          {/* ── Bill Requested Banner ─────────────────────────────── */}
          {orderType === 'dine-in' && selectedTable?.status === 'bill_requested' && (
            <div className="mb-2 bg-red-500/10 border border-red-500/40 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-red-400 flex-shrink-0 animate-pulse" />
                <div>
                  <p className="text-xs font-bold text-red-400">Bill Requested</p>
                  <p className="text-[10px] text-muted-foreground">Table {selectedTable.label} is waiting</p>
                </div>
              </div>
              <button
                onClick={() => handleGenerateBillForTable(selectedTable)}
                disabled={loadingBillTable}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-60 flex-shrink-0"
              >
                {loadingBillTable ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                Generate Bill
              </button>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <ShoppingCart size={28} className="mb-2 opacity-30" />
              <p className="text-xs">No items added yet</p>
              <p className="text-[11px] opacity-60">Tap menu items to add</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={`cart-${item.menuItemId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary transition-colors group"
              >
                <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">₹{item.price} × {item.qty}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.menuItemId, -1)} className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <Minus size={9} />
                  </button>
                  <span className="text-xs font-bold text-foreground w-4 text-center tabular-nums">{item.qty}</span>
                  <button onClick={() => updateQty(item.menuItemId, 1)} className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <Plus size={9} />
                  </button>
                </div>
                <span className="text-xs font-bold text-foreground font-mono w-14 text-right tabular-nums">
                  ₹{(item.price * item.qty).toLocaleString('en-IN')}
                </span>
                <button
                  onClick={() => removeFromCart(item.menuItemId)}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Loyalty Redemption Panel */}
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => setShowLoyaltyPanel(!showLoyaltyPanel)}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Gift size={12} />
            {loyaltyCustomer ? `${loyaltyCustomer.name} — ${loyaltyCustomer.loyalty_points} pts` : 'Redeem Loyalty Points'}
          </button>

          {showLoyaltyPanel && (
            <div className="mt-2 space-y-2">
              {!loyaltyCustomer ? (
                <div className="flex gap-1.5">
                  <input
                    value={loyaltyPhone}
                    onChange={(e) => setLoyaltyPhone(e.target.value)}
                    placeholder="Customer phone"
                    className="flex-1 bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60"
                  />
                  <button
                    onClick={searchLoyaltyCustomer}
                    disabled={loyaltySearching}
                    className="px-2.5 py-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-semibold hover:bg-amber-500/25 disabled:opacity-50 transition-all"
                  >
                    {loyaltySearching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  </button>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{loyaltyCustomer.name}</p>
                      <p className="text-[10px] text-muted-foreground">{loyaltyCustomer.loyalty_points} pts available</p>
                    </div>
                    <button
                      onClick={() => { setLoyaltyCustomer(null); setLoyaltyPointsToRedeem(0); setLoyaltyPhone(''); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Redeem:</span>
                    <input
                      type="number"
                      value={loyaltyPointsToRedeem}
                      onChange={(e) => setLoyaltyPointsToRedeem(Math.min(Number(e.target.value), loyaltyCustomer.loyalty_points))}
                      min={0}
                      max={loyaltyCustomer.loyalty_points}
                      className="w-20 bg-secondary border border-border rounded-lg px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-amber-500/60"
                    />
                    <span className="text-muted-foreground">pts = ₹{loyaltyDiscountAmt} off</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Discount / Coupon */}
        <div className="px-3 py-2 border-t border-border">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-1.5 bg-secondary border border-border rounded-lg px-2.5">
              <Tag size={12} className="text-muted-foreground" />
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Coupon code"
                className="flex-1 bg-transparent text-xs text-foreground placeholder-muted-foreground focus:outline-none py-2"
              />
            </div>
            <button
              onClick={applyCoupon}
              className="px-3 py-2 bg-secondary border border-border rounded-lg text-xs font-semibold text-foreground hover:border-primary/50 transition-all"
            >
              Apply
            </button>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-xs text-accent">
              <span>Discount ({discountPct}%)</span>
              <span className="font-mono tabular-nums">−₹{discountAmt.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        {/* Bill Summary */}
        <div className="px-4 py-3 border-t border-border bg-[hsl(224_71%_5%)] space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">₹{subtotal.toLocaleString('en-IN')}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-xs text-accent">
              <span>Discount</span>
              <span className="font-mono tabular-nums">−₹{discountAmt.toLocaleString('en-IN')}</span>
            </div>
          )}
          {loyaltyDiscountAmt > 0 && (
            <div className="flex justify-between text-xs text-amber-400">
              <span>Loyalty Redemption</span>
              <span className="font-mono tabular-nums">−₹{loyaltyDiscountAmt.toLocaleString('en-IN')}</span>
            </div>
          )}
          {gstBreakdown.map((g) => (
            <div key={`gst-${g.rate}`} className="flex justify-between text-xs text-muted-foreground">
              <span>GST {g.rate}% (CGST {g.rate / 2}% + SGST {g.rate / 2}%)</span>
              <span className="font-mono tabular-nums">₹{(g.cgst + g.sgst).toLocaleString('en-IN')}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1.5 border-t border-border">
            <span className="text-sm font-bold text-foreground">Grand Total</span>
            <span className="text-lg font-bold text-primary font-mono tabular-nums">
              ₹{(grandTotal - loyaltyDiscountAmt).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Payment Mode */}
        <div className="px-3 py-2 border-t border-border">
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {(['cash', 'upi', 'card', 'split'] as PaymentMode[]).map((mode) => (
              <button
                key={`pm-${mode}`}
                onClick={() => setPaymentMode(mode)}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-semibold transition-all ${
                  paymentMode === mode ? 'bg-primary/15 border-primary/60 text-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode === 'cash' && <Banknote size={14} />}
                {mode === 'upi' && <Smartphone size={14} />}
                {mode === 'card' && <CreditCard size={14} />}
                {mode === 'split' && <SplitSquareVertical size={14} />}
                <span className="uppercase">{mode}</span>
              </button>
            ))}
          </div>

          {paymentMode === 'cash' && (
            <div className="flex gap-2">
              <input
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                placeholder="Cash tendered"
                type="number"
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
              {cashTendered && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg">
                  <span className="text-xs text-muted-foreground">Change</span>
                  <span className="text-sm font-bold text-accent font-mono">₹{Math.max(0, Number(cashTendered) - (grandTotal - loyaltyDiscountAmt)).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )}

          {paymentMode === 'upi' && (
            <div className="flex items-center gap-3 p-2 bg-secondary rounded-lg border border-border">
              <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                <div className="w-10 h-10 bg-[repeating-linear-gradient(45deg,#000_0,#000_2px,#fff_0,#fff_8px)] rounded" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Scan & Pay ₹{(grandTotal - loyaltyDiscountAmt).toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-muted-foreground">UPI ID: spicegarden@kotak</p>
                <p className="text-[10px] text-accent">Waiting for payment...</p>
              </div>
            </div>
          )}

          {paymentMode === 'split' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Cash</label>
                <input value={splitCash} onChange={(e) => setSplitCash(e.target.value)} type="number" placeholder="₹0" className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">UPI</label>
                <input value={splitUpi} onChange={(e) => setSplitUpi(e.target.value)} type="number" placeholder="₹0" className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
              </div>
            </div>
          )}
        </div>

        {/* Settle button */}
        <div className="px-3 pb-3 space-y-2">
          <button
            onClick={openBillPreview}
            disabled={cart.length === 0}
            className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98"
          >
            <Eye size={16} />
            Preview & Settle · ₹{(grandTotal - loyaltyDiscountAmt).toLocaleString('en-IN')}
          </button>
          {cart.length > 0 && (
            <button
              onClick={() => { setVoidReason(''); setVoidOtherReason(''); setShowVoidModal(true); }}
              className="w-full py-2 bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <AlertTriangle size={13} />
              Void / Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* ── KOT Modal ─────────────────────────────────────────────── */}
      {showKotModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Send KOT to Kitchen</h3>
              <button onClick={() => setShowKotModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="bg-secondary rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Table</span>
                <span className="font-semibold text-foreground">{selectedTable?.label || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Steward</span>
                <span className="font-semibold text-foreground">{steward}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Items</span>
                <span className="font-semibold text-foreground">{cart.length} items, {cart.reduce((s, i) => s + i.qty, 0)} qty</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Station</span>
                <span className="font-semibold text-foreground">Main Kitchen</span>
              </div>
              {kotPrinterIp && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Printer</span>
                  <span className="font-semibold text-accent font-mono">{kotPrinterIp}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowKotModal(false)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all">
                Cancel
              </button>
              <button onClick={async () => { await createKitchenTicket(); setShowKotModal(false); }} className="flex-1 py-2.5 bg-accent hover:bg-accent/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all">
                <Printer size={14} />
                Send to Kitchen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill Preview Modal ────────────────────────────────────── */}
      {showBillPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 flex flex-col animate-scale-in" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground">Bill Preview</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {orderType === 'dine-in' ? selectedTable?.label : orderType === 'takeaway' ? 'Takeaway' : 'Delivery'} · {covers} covers
                </p>
              </div>
              <button onClick={() => setShowBillPreview(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Items</p>
              <div className="space-y-1.5 mb-4">
                {cart.map((item) => (
                  <div key={`prev-${item.menuItemId}`} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${item.isVeg ? 'bg-accent' : 'bg-red-500'}`} />
                    <span className="flex-1 text-sm text-foreground truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{item.qty} × ₹{item.price}</span>
                    <span className="text-sm font-bold text-foreground font-mono w-16 text-right">₹{(item.price * item.qty).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>

              {/* Tax breakdown */}
              <div className="border-t border-border pt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal ({cart.reduce((s, i) => s + i.qty, 0)} items)</span>
                  <span className="font-mono">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                {discountPct > 0 && (
                  <div className="flex justify-between text-xs text-accent">
                    <span>Discount ({discountPct}%)</span>
                    <span className="font-mono">−₹{discountAmt.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {loyaltyDiscountAmt > 0 && (
                  <div className="flex justify-between text-xs text-amber-400">
                    <span>Loyalty Redemption</span>
                    <span className="font-mono">−₹{loyaltyDiscountAmt.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {gstBreakdown.map((g) => (
                  <div key={`gprev-${g.rate}`} className="flex justify-between text-xs text-muted-foreground">
                    <span>GST {g.rate}% (CGST {g.rate/2}% + SGST {g.rate/2}%)</span>
                    <span className="font-mono">₹{(g.cgst + g.sgst).toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-sm font-bold text-foreground">Grand Total</span>
                  <span className="text-xl font-bold text-primary font-mono">₹{(grandTotal - loyaltyDiscountAmt).toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Payment mode summary */}
              <div className="mt-4 p-3 bg-secondary rounded-xl border border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Payment</p>
                <div className="flex items-center gap-2">
                  {paymentMode === 'cash' && <Banknote size={14} className="text-accent" />}
                  {paymentMode === 'upi' && <Smartphone size={14} className="text-accent" />}
                  {paymentMode === 'card' && <CreditCard size={14} className="text-accent" />}
                  {paymentMode === 'split' && <SplitSquareVertical size={14} className="text-accent" />}
                  <span className="text-sm font-semibold text-foreground capitalize">{paymentMode}</span>
                  {paymentMode === 'cash' && cashTendered && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Tendered: ₹{Number(cashTendered).toLocaleString('en-IN')} · Change: ₹{Math.max(0, Number(cashTendered) - (grandTotal - loyaltyDiscountAmt)).toLocaleString('en-IN')}
                    </span>
                  )}
                  {paymentMode === 'split' && splitCash && splitUpi && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Cash ₹{Number(splitCash).toLocaleString('en-IN')} + UPI ₹{Number(splitUpi).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
              <button
                onClick={() => setShowBillPreview(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all"
              >
                Edit Order
              </button>
              <button
                onClick={() => { setShowBillPreview(false); setShowPayModal(true); }}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                <CheckCircle size={14} />
                Proceed to Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Void Order Modal ──────────────────────────────────────── */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-foreground">Void / Cancel Order</h3>
              <button onClick={() => setShowVoidModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Select a reason. This action will clear the current order and is logged.</p>
            <div className="space-y-2 mb-4">
              {['Customer cancelled', 'Wrong items added', 'Duplicate order', 'Table left without ordering', 'Test / Training order', 'Other'].map((reason) => (
                <button
                  key={`vr-${reason}`}
                  onClick={() => setVoidReason(reason)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                    voidReason === reason
                      ? 'bg-destructive/15 border-destructive/50 text-destructive' :'bg-secondary border-border text-foreground hover:border-destructive/30 hover:bg-destructive/5'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {voidReason === 'Other' && (
              <textarea
                value={voidOtherReason}
                onChange={(e) => setVoidOtherReason(e.target.value)}
                placeholder="Describe the reason..."
                rows={2}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-destructive/50 resize-none mb-4"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowVoidModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidOrder}
                disabled={!voidReason || (voidReason === 'Other' && !voidOtherReason.trim())}
                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 disabled:opacity-40 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                <AlertTriangle size={14} />
                Void Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Confirmation Modal ─────────────────────────── */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-base font-bold text-foreground">Confirm Payment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="bg-secondary rounded-xl p-4 mb-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Amount to collect</p>
              <p className="text-3xl font-bold text-primary font-mono tabular-nums">₹{(grandTotal - loyaltyDiscountAmt).toLocaleString('en-IN')}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{paymentMode} payment</p>
              {loyaltyDiscountAmt > 0 && (
                <p className="text-xs text-amber-400">Loyalty discount: −₹{loyaltyDiscountAmt}</p>
              )}
            </div>
            {paymentMode === 'cash' && cashTendered && (
              <div className="flex justify-between px-1 mb-3 text-sm">
                <span className="text-muted-foreground">Change to return</span>
                <span className="font-bold text-accent font-mono">₹{Math.max(0, Number(cashTendered) - (grandTotal - loyaltyDiscountAmt)).toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowPayModal(false)} className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all">
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={processingPayment}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-70 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                {processingPayment ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                ) : (
                  <><CheckCircle size={14} /> Confirm</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}