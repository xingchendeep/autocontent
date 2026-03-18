'use client';

import { useCallback, useState } from 'react';

interface UseAdminApiOptions {
  onError?: (message: string) => void;
}

/**
 * Generic hook for Admin API calls.
 * Handles loading state, error extraction, and typed responses.
 */
export function useAdminApi<T>(options?: UseAdminApiOptions) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async (url: string, init?: RequestInit): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, init);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          return json.data as T;
        }
        const msg = json.error?.message ?? '请求失败';
        setError(msg);
        options?.onError?.(msg);
        return null;
      } catch {
        const msg = '网络请求失败';
        setError(msg);
        options?.onError?.(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options],
  );

  const get = useCallback(
    (url: string) => request(url),
    [request],
  );

  const post = useCallback(
    (url: string, body: unknown) =>
      request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    [request],
  );

  const put = useCallback(
    (url: string, body: unknown) =>
      request(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    [request],
  );

  const patch = useCallback(
    (url: string, body: unknown) =>
      request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    [request],
  );

  const del = useCallback(
    (url: string) => request(url, { method: 'DELETE' }),
    [request],
  );

  return { data, loading, error, get, post, put, patch, del, request };
}
