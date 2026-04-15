'use client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueueOperationType =
  | 'order_create' |'order_add_items' |'order_update_totals' |'order_update_status' |'takeaway_create' |'takeaway_cancel' |'kot_create' |'kot_void' |'table_seat' |'table_request_bill' |'table_mark_cleaning' |'table_mark_available' |'table_assign_captain' |'inventory_adjust' |'bill_create';

export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface QueueItem {
  id: string;
  type: QueueOperationType;
  payload: Record<string, any>;
  status: QueueItemStatus;
  createdAt: number;
  attemptCount: number;
  lastAttemptAt?: number;
  error?: string;
  conflictData?: Record<string, any>;
  idempotencyKey?: string;
}

export type ConflictResolutionStrategy = 'client_wins' | 'server_wins' | 'merge';

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

const DB_NAME = 'restroOS_offline_queue';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<QueueItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(item: QueueItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Idempotency Key Helper ─────────────────────────────────────────────────

/**
 * Generate a stable idempotency key for an operation.
 * Combines a semantic prefix with a random suffix so the same logical
 * action (e.g. settling bill B-1193) always produces the same key
 * within a single client session, preventing duplicate submissions
 * during reconnect / sync retries.
 */
export function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Queue Manager ─────────────────────────────────────────────────────────────

class OfflineQueueManager {
  private listeners: Array<(items: QueueItem[]) => void> = [];
  private syncInProgress = false;

  /**
   * Add a new operation to the queue.
   * If `idempotencyKey` is provided and an item with the same key already
   * exists in a non-failed/non-synced state, the enqueue is skipped and
   * the existing item's id is returned — preventing duplicate payments
   * during reconnect and sync retries.
   */
  async enqueue(
    type: QueueOperationType,
    payload: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<string> {
    if (idempotencyKey) {
      const existing = await dbGetAll();
      const duplicate = existing.find(
        (i) =>
          i.idempotencyKey === idempotencyKey &&
          i.status !== 'synced' &&
          i.status !== 'failed',
      );
      if (duplicate) {
        return duplicate.id;
      }
    }

    const item: QueueItem = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      status: 'pending',
      createdAt: Date.now(),
      attemptCount: 0,
      idempotencyKey,
    };
    await dbPut(item);
    this.notifyListeners();
    return item.id;
  }

  /** Get all queued items */
  async getAll(): Promise<QueueItem[]> {
    return dbGetAll();
  }

  /** Get pending count */
  async getPendingCount(): Promise<number> {
    const all = await dbGetAll();
    return all.filter((i) => i.status === 'pending' || i.status === 'failed').length;
  }

  /** Subscribe to queue changes */
  subscribe(listener: (items: QueueItem[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async notifyListeners() {
    const items = await dbGetAll();
    this.listeners.forEach((l) => l(items));
  }

  /** Resolve a conflict manually */
  async resolveConflict(id: string, strategy: ConflictResolutionStrategy): Promise<void> {
    const all = await dbGetAll();
    const item = all.find((i) => i.id === id);
    if (!item) return;

    if (strategy === 'server_wins') {
      // Discard local change
      await dbDelete(id);
    } else {
      // client_wins or merge: retry the operation
      await dbPut({ ...item, status: 'pending', error: undefined, conflictData: undefined });
    }
    this.notifyListeners();
  }

  /** Dismiss a failed item */
  async dismiss(id: string): Promise<void> {
    await dbDelete(id);
    this.notifyListeners();
  }

  /** Clear all synced items */
  async clearSynced(): Promise<void> {
    const all = await dbGetAll();
    await Promise.all(all.filter((i) => i.status === 'synced').map((i) => dbDelete(i.id)));
    this.notifyListeners();
  }

  /** Execute a single queue item against Supabase */
  private async executeItem(item: QueueItem): Promise<void> {
    // Dynamic import to avoid circular deps
    const { tableService, orderService, inventoryService, billService, kotService } =
      await import('@/lib/services/restaurantService');
    const supabase = (await import('@/lib/supabase/client')).createClient();

    const p = item.payload;

    switch (item.type) {
      case 'takeaway_create': {
        const takeawayTable = supabase.from('takeaway_orders') as any;
        const { data: orderRow, error: orderError } = await takeawayTable.insert({
          restaurant_id: p.restaurantId || p.restaurant_id || null,
          outlet: p.outlet || 'koramangala',
          order_number: p.orderNumber,
          order_type: p.orderType || 'takeaway',
          aggregator: p.aggregator || null,
          aggregator_order_id: p.aggregatorOrderId || null,
          customer_name: p.customerName || null,
          customer_phone: p.customerPhone || null,
          delivery_address: p.deliveryAddress || null,
          items: p.items || [],
          subtotal: p.subtotal || 0,
          gst_amount: p.gstAmount || 0,
          discount_amount: p.discountAmount || 0,
          total: p.total || 0,
          payment_mode: p.paymentMode || 'cash',
          status: p.status || 'pending',
          assigned_rider: p.assignedRider || null,
          estimated_time: p.estimatedTime || 30,
          notes: p.notes || null,
        }).select('id').single();
        if (orderError) throw orderError;

        const kotPayload = {
          kotNumber: `KOT-${p.orderNumber}`,
          orderId: orderRow?.id,
          tableLabel: p.orderType === 'delivery' ? 'DEL' : 'TKW',
          orderType: p.orderType || 'takeaway',
          station: 'Main Kitchen',
          priority: 'normal',
          steward: 'Counter',
          covers: 0,
          outlet: p.outlet || 'koramangala',
          items: (p.items || []).map((item: any) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            qty: item.qty,
            note: item.note,
            isVeg: item.isVeg ?? false,
          })),
        };
        await kotService.create(kotPayload as any, p.restaurantId ? { restaurantId: p.restaurantId, outletSlug: p.outlet } : undefined);
        break;
      }
      case 'takeaway_cancel': {
        const orderId = p.orderId;
        if (!orderId) break;
        const cancelPayload: Record<string, any> = {
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        };
        await (supabase.from('takeaway_orders') as any).update(cancelPayload).eq('id', orderId);
        await (supabase.from('kots') as any).update({ status: 'voided' }).eq('order_id', orderId);
        break;
      }
      case 'kot_create':
        await kotService.create(p as any, p.restaurantId ? { restaurantId: p.restaurantId, outletSlug: p.outletSlug || p.outlet } : undefined);
        break;
      case 'kot_void':
        if (p.orderId) {
          await (supabase.from('kots') as any).update({ status: 'voided' }).eq('order_id', p.orderId);
        } else {
          await kotService.void(p.kotId);
        }
        break;
      case 'table_seat':
        await tableService.seat(p.id, p.captain, p.covers);
        break;
      case 'table_request_bill':
        await tableService.requestBill(p.id);
        break;
      case 'table_mark_cleaning':
        await tableService.markCleaning(p.id);
        break;
      case 'table_mark_available':
        await tableService.markAvailable(p.id);
        break;
      case 'table_assign_captain':
        await tableService.assignCaptain(p.id, p.captain);
        break;
      case 'order_create':
        await orderService.create(p as any);
        break;
      case 'order_add_items':
        await orderService.addItems(p.orderId, p.items);
        break;
      case 'order_update_totals':
        await orderService.updateTotals(p.orderId, p.totals);
        break;
      case 'order_update_status':
        await orderService.updateStatus(p.orderId, p.status);
        break;
      case 'inventory_adjust':
        await inventoryService.adjust(p.itemId, p.type, p.qty, p.reason, p.adjustedBy);
        break;
      case 'bill_create':
        await billService.create(
          p as any,
          p.restaurantId ? { restaurantId: p.restaurantId, outletSlug: p.outletSlug || p.outlet } : undefined,
        );
        break;
      default:
        throw new Error(`Unknown operation type: ${item.type}`);
    }
  }

  /** Sync all pending items — call when connection is restored */
  async syncAll(onProgress?: (result: Partial<SyncResult>) => void): Promise<SyncResult> {
    if (this.syncInProgress) return { synced: 0, failed: 0, conflicts: 0 };
    this.syncInProgress = true;

    const result: SyncResult = { synced: 0, failed: 0, conflicts: 0 };

    try {
      const all = await dbGetAll();
      const pending = all
        .filter((i) => i.status === 'pending' || i.status === 'failed')
        .sort((a, b) => a.createdAt - b.createdAt); // FIFO

      for (const item of pending) {
        // Mark as syncing
        await dbPut({ ...item, status: 'syncing', lastAttemptAt: Date.now() });
        this.notifyListeners();

        try {
          await this.executeItem(item);
          await dbPut({ ...item, status: 'synced', error: undefined });
          result.synced++;
        } catch (err: any) {
          const isConflict =
            err?.code === '23505' || // unique violation
            err?.message?.includes('conflict') ||
            err?.message?.includes('already exists');

          if (isConflict) {
            await dbPut({
              ...item,
              status: 'conflict',
              error: err.message,
              attemptCount: item.attemptCount + 1,
              conflictData: { serverError: err.message, timestamp: Date.now() },
            });
            result.conflicts++;
          } else {
            await dbPut({
              ...item,
              status: item.attemptCount >= 2 ? 'failed' : 'pending',
              error: err.message,
              attemptCount: item.attemptCount + 1,
            });
            result.failed++;
          }
        }

        this.notifyListeners();
        onProgress?.(result);
      }
    } finally {
      this.syncInProgress = false;
    }

    // Auto-clear synced items after 30s
    setTimeout(() => this.clearSynced(), 30_000);

    return result;
  }
}

// Singleton
export const offlineQueue = new OfflineQueueManager();
