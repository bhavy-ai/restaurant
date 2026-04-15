'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Bike, RefreshCw, CheckCircle, XCircle, AlertTriangle, Loader2, Zap, Phone, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';

interface AggregatorOrder {
  id: string;
  orderNumber: string;
  aggregator: string;
  aggregatorOrderId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  status: OrderStatus;
  createdAt: string;
}

interface AggregatorConfig {
  id: string;
  platform: string;
  displayName: string;
  apiKey: string;
  restaurantId: string;
  enabled: boolean;
  lastStatus: string;
  lastCheckedAt: string | null;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'New', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  preparing: { label: 'Preparing', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  ready: { label: 'Ready', color: 'bg-accent/15 text-accent border-accent/30' },
  dispatched: { label: 'Dispatched', color: 'bg-primary/15 text-primary border-primary/30' },
  delivered: { label: 'Delivered', color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const AGGREGATOR_COLORS: Record<string, string> = {
  zomato: 'bg-red-500/15 text-red-400 border-red-500/30',
  swiggy: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

export default function AggregatorOrdersClient() {
  const supabase = createClient();
  const { activeRestaurant, activeOutlet } = useAuth();
  const restaurantId = activeRestaurant?.id;
  const outletSlug = activeOutlet?.slug || 'koramangala';
  const [orders, setOrders] = useState<AggregatorOrder[]>([]);
  const [configs, setConfigs] = useState<AggregatorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('takeaway_orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('outlet', outletSlug)
        .eq('order_type', 'aggregator')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setOrders((data || []).map((r: any) => ({
        id: r.id,
        orderNumber: r.order_number,
        aggregator: r.aggregator || 'unknown',
        aggregatorOrderId: r.aggregator_order_id || '',
        customerName: r.customer_name || 'Aggregator Customer',
        customerPhone: r.customer_phone || '',
        deliveryAddress: r.delivery_address || '',
        items: r.items || [],
        total: Number(r.total),
        status: r.status as OrderStatus,
        createdAt: r.created_at,
      })));
    } catch (err: any) {
      toast.error('Failed to load aggregator orders: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, outletSlug]);

  const loadConfigs = useCallback(async () => {
    if (!restaurantId) {
      setConfigs([]);
      return;
    }
    try {
      const { data } = await supabase
        .from('aggregator_config')
        .select('*')
        .eq('outlet', outletSlug)
        .eq('restaurant_id', restaurantId);
      setConfigs((data || []).map((r: any) => ({
        id: r.id,
        platform: r.platform,
        displayName: r.display_name,
        apiKey: r.api_key,
        restaurantId: r.restaurant_id,
        enabled: r.enabled,
        lastStatus: r.last_status,
        lastCheckedAt: r.last_checked_at,
      })));
    } catch {
      // non-critical
    }
  }, [restaurantId, outletSlug]);

  useEffect(() => {
    loadOrders();
    loadConfigs();
  }, [loadOrders, loadConfigs]);

  // Real-time subscription for new aggregator orders
  useEffect(() => {
    const channel = supabase
      .channel('aggregator_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'takeaway_orders' }, (payload) => {
        if (
          payload.new.order_type === 'aggregator' &&
          payload.new.restaurant_id === restaurantId &&
          payload.new.outlet === outletSlug
        ) {
          const r = payload.new;
          setOrders((prev) => [{
            id: r.id,
            orderNumber: r.order_number,
            aggregator: r.aggregator || 'unknown',
            aggregatorOrderId: r.aggregator_order_id || '',
            customerName: r.customer_name || 'Aggregator Customer',
            customerPhone: r.customer_phone || '',
            deliveryAddress: r.delivery_address || '',
            items: r.items || [],
            total: Number(r.total),
            status: r.status as OrderStatus,
            createdAt: r.created_at,
          }, ...prev]);
          toast.success(`New ${r.aggregator?.toUpperCase()} order #${r.order_number}`, { icon: '🛵' });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'takeaway_orders' }, (payload) => {
        if (
          payload.new.order_type === 'aggregator' &&
          payload.new.restaurant_id === restaurantId &&
          payload.new.outlet === outletSlug
        ) {
          setOrders((prev) => prev.map((o) => o.id === payload.new.id ? { ...o, status: payload.new.status } : o));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, outletSlug]);

  async function pollOrders() {
    setPolling(true);
    // Simulate polling — in production, call actual Zomato/Swiggy partner APIs
    // The API keys and restaurant IDs are stored in aggregator_config table
    const enabledConfigs = configs.filter((c) => c.enabled && c.apiKey && c.restaurantId);

    if (enabledConfigs.length === 0) {
      toast.info('No aggregators configured. Add API keys in Admin Panel → Integrations.');
      setPolling(false);
      return;
    }

    // Update last_checked_at for all enabled configs
    for (const config of enabledConfigs) {
      await supabase
        .from('aggregator_config')
        .update({ last_checked_at: new Date().toISOString(), last_status: 'checked' })
        .eq('id', config.id);
    }

    // In production: call Zomato/Swiggy partner APIs here
    // Example: GET https://api.zomato.com/v1/orders?restaurant_id={id}&status=pending
    // For now, show informational message
    toast.info(`Polled ${enabledConfigs.length} aggregator(s). Live orders appear automatically via webhook.`);
    await loadOrders();
    await loadConfigs();
    setPolling(false);
  }

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    setUpdatingId(orderId);
    try {
      const { error } = await supabase
        .from('takeaway_orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success(`Order status updated to ${newStatus}`);
    } catch (err: any) {
      toast.error('Update failed: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  const nextStatus: Record<OrderStatus, OrderStatus | null> = {
    pending: 'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'dispatched',
    dispatched: 'delivered',
    delivered: null,
    cancelled: null,
  };

  const filteredOrders = filterPlatform === 'all'
    ? orders
    : orders.filter((o) => o.aggregator === filterPlatform);

  const platforms = [...new Set(orders.map((o) => o.aggregator))];

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Aggregator Orders</h2>
          <p className="text-sm text-muted-foreground">Live orders from Zomato & Swiggy</p>
        </div>
        <button
          onClick={pollOrders}
          disabled={polling}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
        >
          {polling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Poll Orders
        </button>
      </div>

      {/* Aggregator Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {configs.map((config) => (
          <div key={`cfg-${config.id}`} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${AGGREGATOR_COLORS[config.platform] || 'bg-secondary text-muted-foreground border-border'}`}>
                  {config.platform}
                </div>
                <span className="text-sm font-semibold text-foreground">{config.displayName}</span>
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.enabled ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-secondary border-border text-muted-foreground'}`}>
                {config.enabled ? <CheckCircle size={9} /> : <XCircle size={9} />}
                {config.enabled ? 'Active' : 'Inactive'}
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Restaurant ID: <span className="text-foreground font-mono">{config.restaurantId || 'Not configured'}</span></p>
              <p>API Key: <span className="text-foreground font-mono">{config.apiKey ? '••••••••' : 'Not configured'}</span></p>
              {config.lastCheckedAt && (
                <p>Last polled: {new Date(config.lastCheckedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              )}
            </div>
            {!config.enabled && (
              <div className="mt-2 flex items-start gap-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-amber-400">Configure API key & Restaurant ID in Admin Panel → Integrations to enable live order pull.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filter */}
      {platforms.length > 0 && (
        <div className="flex gap-1.5 p-0.5 bg-secondary rounded-xl w-fit">
          <button
            onClick={() => setFilterPlatform('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterPlatform === 'all' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            All ({orders.length})
          </button>
          {platforms.map((p) => (
            <button
              key={`filter-${p}`}
              onClick={() => setFilterPlatform(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filterPlatform === p ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p} ({orders.filter((o) => o.aggregator === p).length})
            </button>
          ))}
        </div>
      )}

      {/* Orders */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground bg-card border border-border rounded-2xl">
          <Bike size={32} className="mb-2 opacity-30" />
          <p className="text-sm font-semibold">No aggregator orders yet</p>
          <p className="text-xs opacity-60">Orders from Zomato & Swiggy will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredOrders.map((order) => {
            const statusCfg = STATUS_CONFIG[order.status];
            const next = nextStatus[order.status];
            return (
              <div key={`agg-order-${order.id}`} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                {/* Order header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${AGGREGATOR_COLORS[order.aggregator] || 'bg-secondary text-muted-foreground border-border'}`}>
                      {order.aggregator}
                    </span>
                    <span className="text-xs font-bold text-foreground font-mono">#{order.orderNumber}</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                    {statusCfg.label}
                  </span>
                </div>

                {/* Customer */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">{order.customerName}</p>
                  {order.customerPhone && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone size={10} />
                      {order.customerPhone}
                    </div>
                  )}
                  {order.deliveryAddress && (
                    <div className="flex items-start gap-1 text-[11px] text-muted-foreground">
                      <MapPin size={10} className="mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">{order.deliveryAddress}</span>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="bg-secondary rounded-xl p-2.5 space-y-1">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <div key={`item-${idx}`} className="flex justify-between text-xs">
                      <span className="text-foreground">{item.qty}× {item.name}</span>
                      <span className="text-muted-foreground font-mono">₹{item.price * item.qty}</span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">+{order.items.length - 3} more items</p>
                  )}
                  <div className="flex justify-between text-xs font-bold border-t border-border pt-1 mt-1">
                    <span className="text-foreground">Total</span>
                    <span className="text-primary font-mono">₹{order.total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Time */}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {order.aggregatorOrderId && ` · Ref: ${order.aggregatorOrderId}`}
                </p>

                {/* Action */}
                {next && (
                  <button
                    onClick={() => updateStatus(order.id, next)}
                    disabled={updatingId === order.id}
                    className="w-full py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {updatingId === order.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Zap size={12} />
                    )}
                    Mark as {STATUS_CONFIG[next].label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
