'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SavedScriptItem, ApiSuccess, ApiError } from '@/types';

export interface UseSavedScriptsReturn {
  items: SavedScriptItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  deleteScript: (id: string) => Promise<boolean>;
}

export function useSavedScripts(enabled: boolean): UseSavedScriptsReturn {
  const [items, setItems] = useState<SavedScriptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const fetchScripts = useCallback(async () => {
    if (!enabledRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scripts?limit=50');
      const body: ApiSuccess<{ items: SavedScriptItem[] }> | ApiError =
        await res.json();
      if (!enabledRef.current) return;
      if (body.success) {
        setItems(body.data.items);
      } else {
        setError(body.error.message);
      }
    } catch (err) {
      if (!enabledRef.current) return;
      setError(err instanceof Error ? err.message : '获取脚本列表失败');
    } finally {
      if (enabledRef.current) setLoading(false);
    }
  }, []);

  const deleteScriptFn = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
      const body: ApiSuccess<unknown> | ApiError = await res.json();
      if (body.success) {
        setItems((prev) => prev.filter((s) => s.id !== id));
        return true;
      }
      setError(body.error.message);
      return false;
    } catch {
      setError('删除脚本失败');
      return false;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      fetchScripts();
    } else {
      setItems([]);
      setError(null);
      setLoading(false);
    }
  }, [enabled, fetchScripts]);

  return {
    items,
    loading,
    error,
    refresh: fetchScripts,
    deleteScript: deleteScriptFn,
  };
}
