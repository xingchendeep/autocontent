'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserTemplate, ApiSuccess, ApiError } from '@/types';
import type { TemplateFormValues } from '@/lib/validations/template';
import { useToast } from '@/contexts/ToastContext';

export interface UseTemplatesReturn {
  templates: UserTemplate[];
  loading: boolean;
  error: string | null;
  create: (values: TemplateFormValues) => Promise<boolean>;
  update: (id: string, values: Partial<TemplateFormValues>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refresh: () => void;
}

export function useTemplates(teamId?: string | null): UseTemplatesReturn {
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = teamId ? `/api/templates?teamId=${teamId}` : '/api/templates';
      const res = await fetch(url);
      const body: ApiSuccess<{ items: UserTemplate[] }> | ApiError = await res.json();
      if (body.success) {
        setTemplates(body.data.items);
      } else {
        setError(body.error.message);
      }
    } catch {
      setError('获取模板列表失败');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const create = useCallback(async (values: TemplateFormValues): Promise<boolean> => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body: ApiSuccess<UserTemplate> | ApiError = await res.json();
      if (body.success) {
        setTemplates((prev) => [body.data, ...prev]);
        toast({ type: 'success', message: '模板创建成功' });
        return true;
      }
      toast({ type: 'error', message: body.error.message });
      return false;
    } catch {
      toast({ type: 'error', message: '创建模板失败' });
      return false;
    }
  }, [toast]);

  const update = useCallback(async (id: string, values: Partial<TemplateFormValues>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body: ApiSuccess<UserTemplate> | ApiError = await res.json();
      if (body.success) {
        setTemplates((prev) => prev.map((t) => (t.id === id ? body.data : t)));
        toast({ type: 'success', message: '模板更新成功' });
        return true;
      }
      toast({ type: 'error', message: body.error.message });
      return false;
    } catch {
      toast({ type: 'error', message: '更新模板失败' });
      return false;
    }
  }, [toast]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      const body: ApiSuccess<unknown> | ApiError = await res.json();
      if (body.success) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        toast({ type: 'success', message: '模板已删除' });
        return true;
      }
      toast({ type: 'error', message: body.error.message });
      return false;
    } catch {
      toast({ type: 'error', message: '删除模板失败' });
      return false;
    }
  }, [toast]);

  return { templates, loading, error, create, update, remove, refresh: fetchTemplates };
}
