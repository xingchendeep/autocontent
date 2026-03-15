'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HistorySummaryItem, ApiSuccess, ApiError } from '@/types';

export interface UseCloudHistoryReturn {
  items: HistorySummaryItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCloudHistory(enabled: boolean): UseCloudHistoryReturn {
  const [items, setItems] = useState<HistorySummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const fetchHistory = useCallback(async () => {
    if (!enabledRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/history?limit=10');
      const body: ApiSuccess<{ items: HistorySummaryItem[] }> | ApiError =
        await res.json();

      if (!enabledRef.current) return;

      if (body.success) {
        setItems(body.data.items);
      } else {
        setError(body.error.message);
      }
    } catch (err) {
      if (!enabledRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      if (enabledRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch when enabled changes to true
  useEffect(() => {
    if (enabled) {
      fetchHistory();
    } else {
      setItems([]);
      setError(null);
      setLoading(false);
    }
  }, [enabled, fetchHistory]);

  return { items, loading, error, refresh: fetchHistory };
}
