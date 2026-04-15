'use client';

import { createClient } from '@/lib/supabase/client';

// ── Error helper ──────────────────────────────────────────────
function isSchemaError(error: any): boolean {
  if (!error) return false;
  if (error.code && typeof error.code === 'string') {
    const cls = error.code.substring(0, 2);
    if (cls === '42' || cls === '08') return true;
    if (cls === '23') return false;
  }
  if (error.message) {
    return /relation.*does not exist|column.*does not exist|function.*does not exist|syntax error|type.*does not exist/i.test(error.message);
  }
  return false;
}

// ── Request context type ──────────────────────────────────────
export interface RequestContext {
  restaurantId: string;
  outletId?: string;
  outletSlug?: string;
}

// ── Menu Items ────────────────────────────────────────────────
export const menuService = {
  async getAll(outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('menu_items')
        .select('*')
        .eq('outlet', outlet)
        .order('category')
        .order('name');
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category: r.category,
        isVeg: r.is_veg,
        gstRate: r.gst_rate,
        hsnCode: r.hsn_code,
        available: r.available,
      }));
    } catch (e: any) { console.error('menuService.getAll:', e.message); throw e; }
  },

  async create(item: {
    name: string;
    category: string;
    price: number;
    gstRate: number;
    hsnCode: string;
    isVeg: boolean;
    available?: boolean;
    outlet?: string;
  }, ctx?: RequestContext) {
    const supabase = createClient();
    const { data, error } = await supabase.from('menu_items').insert({
      name: item.name,
      category: item.category,
      price: item.price,
      gst_rate: item.gstRate,
      hsn_code: item.hsnCode,
      is_veg: item.isVeg,
      available: item.available !== false,
      outlet: item.outlet || 'koramangala',
      ...(ctx?.restaurantId ? { restaurant_id: ctx.restaurantId } : {}),
    }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, category: data.category, price: Number(data.price), gstRate: data.gst_rate, hsnCode: data.hsn_code, isVeg: data.is_veg, available: data.available };
  },

  async update(id: string, updates: {
    name?: string;
    category?: string;
    price?: number;
    gstRate?: number;
    hsnCode?: string;
    isVeg?: boolean;
    available?: boolean;
  }) {
    const supabase = createClient();
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.price !== undefined) payload.price = updates.price;
    if (updates.gstRate !== undefined) payload.gst_rate = updates.gstRate;
    if (updates.hsnCode !== undefined) payload.hsn_code = updates.hsnCode;
    if (updates.isVeg !== undefined) payload.is_veg = updates.isVeg;
    if (updates.available !== undefined) payload.available = updates.available;
    const { error } = await supabase.from('menu_items').update(payload).eq('id', id);
    if (error && isSchemaError(error)) throw error;
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error && isSchemaError(error)) throw error;
  },

  async toggleAvailability(id: string, available: boolean) {
    const supabase = createClient();
    const { error } = await supabase.from('menu_items').update({ available }).eq('id', id);
    if (error && isSchemaError(error)) throw error;
  },
};

// ── Restaurant Tables ─────────────────────────────────────────
export const tableService = {
  async getAll(outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('restaurant_tables')
        .select('*')
        .eq('outlet', outlet)
        .order('label');
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(mapTable);
    } catch (e: any) { console.error('tableService.getAll:', e.message); throw e; }
  },

  async update(id: string, updates: Record<string, any>) {
    const supabase = createClient();
    const { error } = await supabase.from('restaurant_tables').update(updates).eq('id', id);
    if (error && isSchemaError(error)) throw error;
  },

  async seat(id: string, captain: string, covers: number) {
    return tableService.update(id, {
      status: 'occupied',
      captain,
      covers,
      seated_at: new Date().toISOString(),
      running_amount: 0,
      kot_count: 0,
    });
  },

  async requestBill(id: string) {
    return tableService.update(id, { status: 'bill_requested' });
  },

  async markCleaning(id: string) {
    return tableService.update(id, {
      status: 'cleaning',
      covers: null,
      captain: null,
      seated_at: null,
      running_amount: 0,
    });
  },

  async markAvailable(id: string) {
    return tableService.update(id, {
      status: 'available',
      covers: null,
      captain: null,
      seated_at: null,
      running_amount: 0,
      kot_count: 0,
    });
  },

  async assignCaptain(id: string, captain: string) {
    return tableService.update(id, { captain });
  },
};

function mapTable(r: any) {
  return {
    id: r.id,
    label: r.label,
    section: r.section,
    capacity: r.capacity,
    status: r.status,
    covers: r.covers,
    captain: r.captain,
    seatedAt: r.seated_at,
    runningAmount: r.running_amount ? Number(r.running_amount) : undefined,
    reservedFor: r.reserved_for,
    reservedAt: r.reserved_at,
    kotCount: r.kot_count,
  };
}

// ── Orders ────────────────────────────────────────────────────
export const orderService = {
  async create(order: {
    tableId?: string;
    tableLabel: string;
    orderType: string;
    covers: number;
    steward: string;
    shiftId?: string;
    outlet?: string;
  }, ctx?: RequestContext) {
    const supabase = createClient();
    const orderNumber = `ORD-${Date.now()}`;
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          table_id: order.tableId || null,
          table_label: order.tableLabel,
          order_type: order.orderType,
          covers: order.covers,
          steward: order.steward,
          shift_id: order.shiftId || null,
          outlet: order.outlet || 'koramangala',
          status: 'open',
          ...(ctx?.restaurantId ? { restaurant_id: ctx.restaurantId } : {}),
        })
        .select()
        .single();
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      return data;
    } catch (e: any) { console.error('orderService.create:', e.message); throw e; }
  },

  async addItems(orderId: string, items: Array<{
    menuItemId: string;
    name: string;
    price: number;
    qty: number;
    gstRate: number;
    isVeg: boolean;
    note?: string;
  }>) {
    const supabase = createClient();
    const rows = items.map((i) => ({
      order_id: orderId,
      menu_item_id: i.menuItemId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      gst_rate: i.gstRate,
      is_veg: i.isVeg,
      note: i.note || null,
    }));
    const { error } = await supabase.from('order_items').insert(rows);
    if (error && isSchemaError(error)) throw error;
  },

  async updateTotals(orderId: string, totals: {
    subtotal: number;
    discountAmt: number;
    totalGst: number;
    grandTotal: number;
    discountPct: number;
    couponCode?: string;
  }) {
    const supabase = createClient();
    const { error } = await supabase.from('orders').update({
      subtotal: totals.subtotal,
      discount_amt: totals.discountAmt,
      total_gst: totals.totalGst,
      grand_total: totals.grandTotal,
      discount_pct: totals.discountPct,
      coupon_code: totals.couponCode || null,
    }).eq('id', orderId);
    if (error && isSchemaError(error)) throw error;
  },

  async updateStatus(orderId: string, status: string) {
    const supabase = createClient();
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error && isSchemaError(error)) throw error;
  },
};

// ── KOTs ──────────────────────────────────────────────────────
export const kotService = {
  async getActive(outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('kots')
        .select('*, kot_items(*)')
        .eq('outlet', outlet)
        .not('status', 'in', '("bumped","voided")')
        .order('fire_time');
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(mapKOT);
    } catch (e: any) { console.error('kotService.getActive:', e.message); throw e; }
  },

  async create(kot: {
    kotNumber: string;
    orderId?: string;
    tableLabel: string;
    orderType: string;
    station: string;
    priority: string;
    steward: string;
    covers: number;
    outlet?: string;
    items: Array<{ menuItemId?: string; name: string; qty: number; note?: string; isVeg: boolean }>;
  }, ctx?: RequestContext) {
    const supabase = createClient();
    try {
      const outletToUse = kot.outlet || 'koramangala';
      const payload = {
        kot_number: kot.kotNumber,
        order_id: kot.orderId || null,
        table_label: kot.tableLabel,
        order_type: kot.orderType,
        station: kot.station,
        priority: kot.priority,
        steward: kot.steward,
        covers: kot.covers,
        outlet: outletToUse,
        status: 'pending',
        fire_time: new Date().toISOString(),
        ...(ctx?.restaurantId ? { restaurant_id: ctx.restaurantId } : {}),
      };
      // Backward compatibility: keep removing missing columns reported by
      // PostgREST schema-cache errors until insert succeeds or a non-compat
      // error occurs.
      let insertPayload: Record<string, any> = { ...payload };
      let kotData: any = null;
      let kotError: any = null;

      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await supabase
          .from('kots')
          .insert(insertPayload)
          .select()
          .single();
        kotData = res.data;
        kotError = res.error;
        if (!kotError) break;

        // If order_id points to a non-orders row (e.g. takeaway_orders id),
        // retry with a null order_id to satisfy kots_order_id_fkey.
        if (kotError?.code === '23503' && /kots_order_id_fkey/i.test(kotError?.message || '')) {
          insertPayload.order_id = null;
          continue;
        }

        // Legacy enum/value compatibility: retry without enum-backed fields
        // when DB rejects a newer enum value payload.
        if (kotError?.code === '22P02') {
          const msg = String(kotError?.message || '').toLowerCase();
          if (msg.includes('order_type') && 'order_type' in insertPayload) {
            delete insertPayload.order_type;
            continue;
          }
          if (msg.includes('priority') && 'priority' in insertPayload) {
            delete insertPayload.priority;
            continue;
          }
          if (msg.includes('status') && 'status' in insertPayload) {
            delete insertPayload.status;
            continue;
          }
        }

        if (kotError?.code !== 'PGRST204') break;

        const missingColumn = (kotError.message || '').match(/'([^']+)' column/)?.[1];
        if (!missingColumn || !(missingColumn in insertPayload)) break;
        delete insertPayload[missingColumn];
      }

      if (kotError) {
        throw kotError;
      }
      const items = kot.items.map((i) => ({
        kot_id: kotData.id,
        menu_item_id: i.menuItemId || null,
        name: i.name,
        qty: i.qty,
        note: i.note || null,
        is_veg: i.isVeg,
      }));
      const { error: itemsError } = await supabase.from('kot_items').insert(items);
      if (itemsError && isSchemaError(itemsError)) throw itemsError;
      return kotData;
    } catch (e: any) { console.error('kotService.create:', e.message); throw e; }
  },

  async advanceStatus(kotId: string, newStatus: string) {
    const supabase = createClient();
    const { error } = await supabase.from('kots').update({ status: newStatus }).eq('id', kotId);
    if (error && isSchemaError(error)) throw error;
  },

  async void(kotId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('kots').update({ status: 'voided' }).eq('id', kotId);
    if (error && isSchemaError(error)) throw error;
  },

  async bump(kotId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('kots').update({ status: 'bumped' }).eq('id', kotId);
    if (error && isSchemaError(error)) throw error;
  },
};

function mapKOT(r: any) {
  return {
    id: r.id,
    kotNumber: r.kot_number,
    tableLabel: r.table_label,
    orderType: r.order_type || r.type || 'dine-in',
    station: r.station,
    status: r.status,
    priority: r.priority,
    steward: r.steward,
    covers: r.covers,
    fireTime: r.fire_time,
    items: (r.kot_items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      note: i.note,
      isVeg: i.is_veg,
    })),
  };
}

// ── Bills / Payments ──────────────────────────────────────────
export const billService = {
  async create(bill: {
    billNumber: string;
    orderId?: string;
    tableLabel: string;
    covers: number;
    itemsCount: number;
    grossAmount: number;
    discountAmt: number;
    gstAmount: number;
    netAmount: number;
    paymentMode: string;
    cashTendered?: number;
    cashChange?: number;
    splitCash?: number;
    splitUpi?: number;
    cashier: string;
    shiftId?: string;
    outlet?: string;
    idempotencyKey?: string;
  }, ctx?: RequestContext) {
    return billService.settle(bill, ctx);
  },

  async getByShift(shiftId: string, ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('bills')
        .select('*')
        .eq('shift_id', shiftId)
        .order('created_at', { ascending: false });
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(mapBill);
    } catch (e: any) { console.error('billService.getByShift:', e.message); throw e; }
  },

  async getToday(outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let query = supabase
        .from('bills')
        .select('*')
        .eq('outlet', outlet)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(mapBill);
    } catch (e: any) { console.error('billService.getToday:', e.message); throw e; }
  },

  // Cross-restaurant bills for owner reporting
  async getCrossRestaurant(restaurantIds: string[], since: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('bills')
        .select('id, restaurant_id, outlet, net_amount, gross_amount, gst_amount, status, created_at, cashier')
        .in('restaurant_id', restaurantIds)
        .gte('created_at', since)
        .in('status', ['settled', 'open'])
        .order('created_at', { ascending: false });
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return data || [];
    } catch (e: any) { console.error('billService.getCrossRestaurant:', e.message); throw e; }
  },

  async settle(bill: {
    billNumber: string;
    orderId?: string;
    tableLabel: string;
    covers: number;
    itemsCount: number;
    grossAmount: number;
    discountAmt: number;
    gstAmount: number;
    netAmount: number;
    paymentMode: string;
    cashTendered?: number;
    cashChange?: number;
    splitCash?: number;
    splitUpi?: number;
    cashier: string;
    shiftId?: string;
    outlet?: string;
    idempotencyKey?: string;
  }, ctx?: RequestContext) {
    const supabase = createClient();
    try {
      // If an idempotency key is provided, check for an existing bill with the
      // same bill_number to prevent duplicate charges on reconnect / sync retry.
      if (bill.idempotencyKey) {
        const { data: existing } = await supabase
          .from('bills')
          .select('id')
          .eq('bill_number', bill.billNumber)
          .maybeSingle();
        if (existing) {
          return existing;
        }
      }

      let insertPayload: Record<string, any> = {
          bill_number: bill.billNumber,
          order_id: bill.orderId || null,
          table_label: bill.tableLabel,
          covers: bill.covers,
          items_count: bill.itemsCount,
          gross_amount: bill.grossAmount,
          discount_amt: bill.discountAmt,
          gst_amount: bill.gstAmount,
          net_amount: bill.netAmount,
          payment_mode: bill.paymentMode,
          cash_tendered: bill.cashTendered || null,
          cash_change: bill.cashChange || null,
          split_cash: bill.splitCash || null,
          split_upi: bill.splitUpi || null,
          cashier: bill.cashier,
          status: 'settled',
          shift_id: bill.shiftId || null,
          outlet: bill.outlet || 'koramangala',
          settled_at: new Date().toISOString(),
          ...(ctx?.restaurantId ? { restaurant_id: ctx.restaurantId } : {}),
      };

      for (let attempt = 0; attempt < 8; attempt++) {
        const { data, error } = await supabase
          .from('bills')
          .insert(insertPayload)
          .select()
          .single();
        if (!error) {
          return data;
        }

        if (error?.code === 'PGRST204') {
          const missingColumn = (error.message || '').match(/'([^']+)' column/)?.[1];
          if (missingColumn && missingColumn in insertPayload) {
            delete insertPayload[missingColumn];
            continue;
          }
        }

        throw error;
      }

      return null;
    } catch (e: any) { console.error('billService.settle:', e.message); throw e; }
  },

  async void(billId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('bills').update({ status: 'voided' }).eq('id', billId);
    if (error && isSchemaError(error)) throw error;
  },
};

function mapBill(r: any) {
  return {
    id: r.id,
    billNo: r.bill_number,
    tableLabel: r.table_label,
    time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    items: r.items_count,
    covers: r.covers,
    gross: Number(r.gross_amount),
    discount: Number(r.discount_amt),
    gst: Number(r.gst_amount),
    net: Number(r.net_amount),
    paymentMode: r.payment_mode?.charAt(0).toUpperCase() + r.payment_mode?.slice(1) || 'UPI',
    cashier: r.cashier,
    status: r.status,
    stripeStatus: r.stripe_status ?? null,
    stripeReceiptUrl: r.stripe_receipt_url ?? null,
  };
}

// ── Inventory ─────────────────────────────────────────────────
export const inventoryService = {
  async getAll(outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('inventory_items')
        .select('*')
        .eq('outlet', outlet)
        .order('name');
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(mapInventoryItem);
    } catch (e: any) { console.error('inventoryService.getAll:', e.message); throw e; }
  },

  async adjust(itemId: string, adjustmentType: 'add' | 'remove' | 'wastage', quantity: number, reason: string, staffName?: string, outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      const { data: item, error: fetchError } = await supabase
        .from('inventory_items')
        .select('current_stock, reorder_level, max_stock')
        .eq('id', itemId)
        .single();
      if (fetchError) {
        if (isSchemaError(fetchError)) throw fetchError;
        return;
      }
      const delta = adjustmentType === 'add' ? quantity : -quantity;
      const newStock = Math.max(0, Number(item.current_stock) + delta);
      const reorderLevel = Number(item.reorder_level);
      const maxStock = Number(item.max_stock);
      const newStatus =
        newStock <= 0 ? 'critical' :
        newStock < reorderLevel * 0.5 ? 'critical' :
        newStock < reorderLevel ? 'low' :
        newStock > maxStock * 0.9 ? 'overstock' : 'ok';

      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ current_stock: Math.round(newStock * 1000) / 1000, status: newStatus })
        .eq('id', itemId);
      if (updateError && isSchemaError(updateError)) throw updateError;

      const { error: logError } = await supabase.from('inventory_adjustments').insert({
        inventory_item_id: itemId,
        adjustment_type: adjustmentType,
        quantity,
        reason,
        staff_name: staffName || 'Staff',
        outlet,
        ...(ctx?.restaurantId ? { restaurant_id: ctx.restaurantId } : {}),
      });
      if (logError && isSchemaError(logError)) throw logError;
    } catch (e: any) { console.error('inventoryService.adjust:', e.message); throw e; }
  },
};

function mapInventoryItem(r: any) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    currentStock: Number(r.current_stock),
    reorderLevel: Number(r.reorder_level),
    maxStock: Number(r.max_stock),
    lastPurchasePrice: Number(r.last_purchase_price),
    consumedToday: Number(r.consumed_today),
    variance: Number(r.variance),
    supplier: r.supplier || '',
    lastUpdated: r.last_updated || '',
    status: r.status as 'ok' | 'low' | 'critical' | 'overstock',
  };
}

// ── Staff Users ───────────────────────────────────────────────
export const staffService = {
  async getAll(outlet?: string, ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase.from('staff_users').select('*').order('name');
      if (outlet) query = query.or(`outlet.eq.${outlet},outlet.eq.All Outlets`);
      if (ctx?.restaurantId) query = (query as any).eq('restaurant_id', ctx.restaurantId);
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map(mapStaffUser);
    } catch (e: any) { console.error('staffService.getAll:', e.message); throw e; }
  },

  async create(staff: {
    name: string;
    email: string;
    phone?: string;
    role: string;
    outlet: string;
    outlet_id?: string; // New: outlet UUID
  }, ctx?: RequestContext) {
    if (!ctx?.restaurantId) {
      throw new Error('Missing restaurant context for staff creation');
    }

    const supabase = createClient();
    const { data, error } = await supabase.from('staff_users').insert({
      name: staff.name,
      email: staff.email,
      phone: staff.phone || null,
      role: staff.role,
      outlet: staff.outlet,
      outlet_id: staff.outlet_id || null,
      status: 'active',
      permissions: [],
      restaurant_id: ctx.restaurantId,
    }).select().single();
    if (error) throw error;
    return mapStaffUser(data);
  },

  async update(id: string, updates: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    outlet?: string;
    outlet_id?: string; // New: outlet UUID
  }) {
    const supabase = createClient();
    const { error } = await supabase.from('staff_users').update(updates).eq('id', id);
    if (error && isSchemaError(error)) throw error;
  },

  async toggleStatus(id: string, currentStatus: string) {
    const supabase = createClient();
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('staff_users').update({ status: newStatus }).eq('id', id);
    if (error && isSchemaError(error)) throw error;
    return newStatus;
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('staff_users').delete().eq('id', id);
    if (error && isSchemaError(error)) throw error;
  },
};

function mapStaffUser(r: any) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    outlet: r.outlet,
    outlet_id: r.outlet_id || '',
    status: r.status,
    lastLogin: r.last_login || 'Never',
    permissions: r.permissions || [],
  };
}

// ── Audit Logs ────────────────────────────────────────────────
export const auditService = {
  async getRecent(outlet = 'koramangala', limit = 50, ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('outlet', outlet)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((r) => ({
        id: r.id,
        timestamp: new Date(r.created_at).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }),
        user: r.staff_name,
        role: r.staff_role || '',
        action: r.action,
        entity: r.entity || '',
        details: r.details || '',
        ip: r.ip_address || '',
        severity: r.severity as 'info' | 'warning' | 'critical',
      }));
    } catch (e: any) { console.error('auditService.getRecent:', e.message); throw e; }
  },

  async log(entry: {
    staffName: string;
    staffRole?: string;
    action: string;
    entity?: string;
    details?: string;
    ipAddress?: string;
    severity?: 'info' | 'warning' | 'critical';
    outlet?: string;
  }, ctx?: RequestContext) {
    const supabase = createClient();
    let payload: Record<string, any> = {
      staff_name: entry.staffName,
      staff_role: entry.staffRole || null,
      action: entry.action,
      entity: entry.entity || null,
      details: entry.details || null,
      ip_address: entry.ipAddress || null,
      severity: entry.severity || 'info',
      outlet: entry.outlet || 'koramangala',
      ...(ctx?.restaurantId ? { restaurant_id: ctx.restaurantId } : {}),
    };

    // Audit logging should never break user flows. Retry by stripping unknown
    // columns reported by PostgREST schema cache, then fail-open.
    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from('audit_logs').insert(payload);
      if (!error) return;

      if (error?.code === 'PGRST204') {
        const missingColumn = (error.message || '').match(/'([^']+)' column/)?.[1];
        if (missingColumn && missingColumn in payload) {
          delete payload[missingColumn];
          continue;
        }
      }

      if (isSchemaError(error)) {
        console.warn('auditService.log schema fallback:', error.message);
      } else {
        console.warn('auditService.log failed (non-blocking):', error.message || error);
      }
      return;
    }
  },
};

// ── Shifts ────────────────────────────────────────────────────
export const shiftService = {
  async getActive(outlet = 'koramangala', ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('shifts')
        .select('*')
        .eq('outlet', outlet)
        .eq('is_closed', false)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      return data;
    } catch (e: any) { console.error('shiftService.getActive:', e.message); throw e; }
  },

  async close(shiftId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('shifts').update({
      is_closed: true,
      closed_at: new Date().toISOString(),
    }).eq('id', shiftId);
    if (error && isSchemaError(error)) throw error;
  },

  async getStats(shiftId: string, ctx?: RequestContext) {
    const supabase = createClient();
    try {
      let query = supabase
        .from('bills')
        .select('*')
        .eq('shift_id', shiftId)
        .eq('status', 'settled');
      if (ctx?.restaurantId) {
        query = query.eq('restaurant_id', ctx.restaurantId);
      }
      const { data, error } = await query;
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      const bills = data || [];
      const totalBills = bills.length;
      const totalCovers = bills.reduce((s: number, b: any) => s + (b.covers || 0), 0);
      const grossSales = bills.reduce((s: number, b: any) => s + Number(b.gross_amount), 0);
      const discounts = bills.reduce((s: number, b: any) => s + Number(b.discount_amt), 0);
      const totalGst = bills.reduce((s: number, b: any) => s + Number(b.gst_amount), 0);
      const netSales = bills.reduce((s: number, b: any) => s + Number(b.net_amount), 0);
      const cashSales = bills.filter((b: any) => b.payment_mode === 'cash').reduce((s: number, b: any) => s + Number(b.net_amount), 0);
      const upiSales = bills.filter((b: any) => b.payment_mode === 'upi').reduce((s: number, b: any) => s + Number(b.net_amount), 0);
      const cardSales = bills.filter((b: any) => b.payment_mode === 'card').reduce((s: number, b: any) => s + Number(b.net_amount), 0);
      const voidedBills = await supabase.from('bills').select('net_amount').eq('shift_id', shiftId).eq('status', 'voided');
      const voids = (voidedBills.data || []).reduce((s: number, b: any) => s + Number(b.net_amount), 0);
      return {
        totalBills,
        totalCovers,
        grossSales: Math.round(grossSales),
        discounts: Math.round(discounts),
        voids: Math.round(voids),
        netSales: Math.round(netSales),
        cashSales: Math.round(cashSales),
        upiSales: Math.round(upiSales),
        cardSales: Math.round(cardSales),
        totalGst: Math.round(totalGst),
        cgst: Math.round(totalGst / 2),
        sgst: Math.round(totalGst / 2),
        avgBillValue: totalBills > 0 ? Math.round(netSales / totalBills) : 0,
        avgCoverValue: totalCovers > 0 ? Math.round(netSales / totalCovers) : 0,
      };
    } catch (e: any) { console.error('shiftService.getStats:', e.message); throw e; }
  },
};

// ── GST Configuration ─────────────────────────────────────────
export const gstService = {
  async get(outlet = 'koramangala') {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('gst_config')
        .select('*')
        .eq('outlet', outlet)
        .maybeSingle();
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      if (!data) return null;
      return {
        id: data.id,
        gstin: data.gstin,
        legalName: data.legal_name,
        tradeName: data.trade_name,
        registrationType: data.registration_type,
        rate5Enabled: data.rate_5_enabled,
        rate12Enabled: data.rate_12_enabled,
        rate18Enabled: data.rate_18_enabled,
        rate0Enabled: data.rate_0_enabled,
      };
    } catch (e: any) { console.error('gstService.get:', e.message); throw e; }
  },

  async save(outlet = 'koramangala', config: {
    gstin: string;
    legalName: string;
    tradeName: string;
    registrationType: string;
    rate5Enabled: boolean;
    rate12Enabled: boolean;
    rate18Enabled: boolean;
    rate0Enabled: boolean;
  }) {
    const supabase = createClient();
    const payload = {
      outlet,
      gstin: config.gstin,
      legal_name: config.legalName,
      trade_name: config.tradeName,
      registration_type: config.registrationType,
      rate_5_enabled: config.rate5Enabled,
      rate_12_enabled: config.rate12Enabled,
      rate_18_enabled: config.rate18Enabled,
      rate_0_enabled: config.rate0Enabled,
    };
    const { error } = await supabase.from('gst_config').upsert(payload, { onConflict: 'outlet' });
    if (error) throw error;
  },
};

// ── Outlet Settings ───────────────────────────────────────────
export const outletSettingsService = {
  async get(outlet = 'koramangala') {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('outlet_settings')
        .select('*')
        .eq('outlet', outlet)
        .maybeSingle();
      if (error) {
        if (isSchemaError(error)) throw error;
        return null;
      }
      if (!data) return null;
      return {
        name: data.name,
        gstin: data.gstin,
        fssai: data.fssai,
        address: data.address,
        phone: data.phone,
        email: data.email,
        upiId: data.upi_id,
        billPrefix: data.bill_prefix,
        kotPrefix: data.kot_prefix,
        printCopies: String(data.print_copies),
        serviceCharge: data.service_charge_enabled,
        serviceChargePct: String(data.service_charge_pct),
      };
    } catch (e: any) { console.error('outletSettingsService.get:', e.message); throw e; }
  },

  async save(outlet = 'koramangala', settings: {
    name: string;
    gstin: string;
    fssai: string;
    address: string;
    phone: string;
    email: string;
    upiId: string;
    billPrefix: string;
    kotPrefix: string;
    printCopies: string;
    serviceCharge: boolean;
    serviceChargePct: string;
  }) {
    const supabase = createClient();
    const payload = {
      outlet,
      name: settings.name,
      gstin: settings.gstin,
      fssai: settings.fssai,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      upi_id: settings.upiId,
      bill_prefix: settings.billPrefix,
      kot_prefix: settings.kotPrefix,
      print_copies: parseInt(settings.printCopies) || 2,
      service_charge_enabled: settings.serviceCharge,
      service_charge_pct: parseFloat(settings.serviceChargePct) || 10,
    };
    const { error } = await supabase.from('outlet_settings').upsert(payload, { onConflict: 'outlet' });
    if (error) throw error;
  },
};

// ── Printer Configuration ─────────────────────────────────────
export const printerService = {
  async getAll(outlet = 'koramangala') {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('printer_config')
        .select('*')
        .eq('outlet', outlet)
        .order('created_at');
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        printerType: r.printer_type,
        ipAddress: r.ip_address,
        port: r.port,
        paperWidth: r.paper_width,
        enabled: r.enabled,
      }));
    } catch (e: any) { console.error('printerService.getAll:', e.message); throw e; }
  },

  async upsert(outlet = 'koramangala', printer: {
    id?: string;
    name: string;
    printerType: string;
    ipAddress: string;
    port: number;
    paperWidth: string;
    enabled: boolean;
  }) {
    const supabase = createClient();
    const payload: any = {
      outlet,
      name: printer.name,
      printer_type: printer.printerType,
      ip_address: printer.ipAddress,
      port: printer.port,
      paper_width: printer.paperWidth,
      enabled: printer.enabled,
      updated_at: new Date().toISOString(),
    };
    if (printer.id) payload.id = printer.id;
    const { data, error } = await supabase
      .from('printer_config')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      printerType: data.printer_type,
      ipAddress: data.ip_address,
      port: data.port,
      paperWidth: data.paper_width,
      enabled: data.enabled,
    };
  },

  async delete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('printer_config').delete().eq('id', id);
    if (error) throw error;
  },
};

// ── Aggregator Configuration ──────────────────────────────────
export const aggregatorService = {
  async getAll(outlet = 'koramangala') {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('aggregator_config')
        .select('*')
        .eq('outlet', outlet)
        .order('platform');
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((r) => ({
        id: r.id,
        platform: r.platform,
        displayName: r.display_name,
        apiKey: r.api_key,
        restaurantId: r.restaurant_id,
        enabled: r.enabled,
        lastCheckedAt: r.last_checked_at,
        lastStatus: r.last_status,
      }));
    } catch (e: any) { console.error('aggregatorService.getAll:', e.message); throw e; }
  },

  async save(outlet = 'koramangala', config: {
    id?: string;
    platform: string;
    displayName: string;
    apiKey: string;
    restaurantId: string;
    enabled: boolean;
  }) {
    const supabase = createClient();
    const payload: any = {
      outlet,
      platform: config.platform,
      display_name: config.displayName,
      api_key: config.apiKey,
      restaurant_id: config.restaurantId,
      enabled: config.enabled,
      updated_at: new Date().toISOString(),
    };
    if (config.id) payload.id = config.id;
    const { data, error } = await supabase
      .from('aggregator_config')
      .upsert(payload, { onConflict: 'outlet,platform' })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      platform: data.platform,
      displayName: data.display_name,
      apiKey: data.api_key,
      restaurantId: data.restaurant_id,
      enabled: data.enabled,
      lastCheckedAt: data.last_checked_at,
      lastStatus: data.last_status,
    };
  },

  async updateStatus(id: string, status: 'connected' | 'error' | 'unchecked') {
    const supabase = createClient();
    const { error } = await supabase
      .from('aggregator_config')
      .update({ last_status: status, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};

// ── Multi-Restaurant Service ───────────────────────────────────
export const multiRestaurantService = {
  // Get all restaurants accessible to a user
  async getAccessibleRestaurants(userId?: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        gstin: r.gstin,
        plan: r.plan,
        isActive: r.is_active,
      }));
    } catch (e: any) { console.error('multiRestaurantService.getAccessibleRestaurants:', e.message); return []; }
  },

  // Get outlets for a restaurant
  async getOutlets(restaurantId: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('outlets')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name');
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return (data || []).map((o: any) => ({
        id: o.id,
        restaurantId: o.restaurant_id,
        name: o.name,
        slug: o.slug,
        address: o.address,
        isActive: o.is_active,
      }));
    } catch (e: any) { console.error('multiRestaurantService.getOutlets:', e.message); return []; }
  },

  // Cross-restaurant revenue summary for owner dashboard
  async getCrossRestaurantRevenue(restaurantIds: string[], since: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('bills')
        .select('restaurant_id, outlet, net_amount, gross_amount, gst_amount, status, created_at')
        .in('restaurant_id', restaurantIds)
        .gte('created_at', since)
        .in('status', ['settled', 'open']);
      if (error) {
        if (isSchemaError(error)) throw error;
        return [];
      }
      return data || [];
    } catch (e: any) { console.error('multiRestaurantService.getCrossRestaurantRevenue:', e.message); return []; }
  },

  // Get feature flags for a restaurant
  async getFeatureFlags(restaurantId: string) {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('restaurant_feature_flags')
        .select('flag_key, flag_value')
        .eq('restaurant_id', restaurantId);
      if (error) return {};
      const flags: Record<string, boolean> = {};
      (data || []).forEach((f: any) => { flags[f.flag_key] = f.flag_value; });
      return flags;
    } catch { return {}; }
  },
};
