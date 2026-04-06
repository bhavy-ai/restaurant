'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineQueue, QueueItem, SyncResult } from '@/lib/offlineQueue';

export interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  pendingCount: number;
  queueItems: QueueItem[];
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  triggerSync: () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refresh pending count
  const refreshCount = useCallback(async () => {
    const count = await offlineQueue.getPendingCount();
    setPendingCount(count);
    const items = await offlineQueue.getAll();
    setQueueItems(items);
  }, []);

  // Trigger sync
  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const result = await offlineQueue.syncAll();
      setLastSyncResult(result);
      await refreshCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, refreshCount]);

  useEffect(() => {
    // Initial state
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Debounce sync by 1.5s to let connection stabilize
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        triggerSync();
      }, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to queue changes
    const unsubscribe = offlineQueue.subscribe((items) => {
      setQueueItems(items);
      const pending = items.filter((i) => i.status === 'pending' || i.status === 'failed').length;
      setPendingCount(pending);
    });

    // Initial load
    refreshCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  // Re-wire triggerSync when it changes (avoids stale closure in event handler)
  useEffect(() => {
    const handleOnline = () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        triggerSync();
      }, 1500);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [triggerSync]);

  return {
    isOnline,
    wasOffline,
    pendingCount,
    queueItems,
    isSyncing,
    lastSyncResult,
    triggerSync,
  };
}
