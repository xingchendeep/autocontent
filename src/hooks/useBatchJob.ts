'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BatchJobStatus, PlatformCode, ApiSuccess, ApiError } from '@/types';
import { useToast } from '@/contexts/ToastContext';

const POLL_INTERVAL = 5000;
const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed']);

export interface BatchSubmitParams {
  items: Array<{ content: string; platforms: PlatformCode[] }>;
  templateId?: string;
}

export interface UseBatchJobReturn {
  submit: (params: BatchSubmitParams) => Promise<string | null>;
  job: BatchJobStatus | null;
  loading: boolean;
  polling: boolean;
  error: string | null;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
}

export function useBatchJob(): UseBatchJobReturn {
  const [job, setJob] = useState<BatchJobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPolling(false);
  }, []);

  const fetchJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.status === 404) {
        setError('任务不存在');
        stopPolling();
        return;
      }
      const body: ApiSuccess<BatchJobStatus> | ApiError = await res.json();
      if (body.success) {
        setJob(body.data);
        if (TERMINAL_STATUSES.has(body.data.status)) {
          stopPolling();
        }
      } else {
        setError(body.error.message);
      }
    } catch {
      // Keep last known state, retry on next poll
    }
  }, [stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    setPolling(true);
    fetchJob(jobId);
    timerRef.current = setInterval(() => fetchJob(jobId), POLL_INTERVAL);
  }, [fetchJob, stopPolling]);

  const submit = useCallback(async (params: BatchSubmitParams): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const body: ApiSuccess<{ jobId: string; itemCount: number; status: string }> | ApiError =
        await res.json();
      if (body.success) {
        toast({ type: 'success', message: '批量任务已提交' });
        return body.data.jobId;
      }
      if (res.status === 402) {
        setError('PLAN_LIMIT_REACHED');
      }
      toast({ type: 'error', message: body.error.message });
      return null;
    } catch {
      toast({ type: 'error', message: '提交批量任务失败' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { submit, job, loading, polling, error, startPolling, stopPolling };
}
