'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface SystemConfigItem {
  key: string;
  value: string;
  valueType: string;
  updatedBy: string | null;
  updatedAt: string;
}

const LABELS: Record<string, string> = {
  rate_limit_per_minute: '每分钟速率限制',
  max_input_length: '最大输入字符数',
  max_platforms_per_request: '单次最大平台数',
};

export function SystemConfigForm() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SystemConfigItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/system-config')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setConfigs(res.data);
          const d: Record<string, string> = {};
          for (const c of res.data) d[c.key] = c.value;
          setDraft(d);
        }
      })
      .catch(() => toast({ type: 'error', message: '加载配置失败' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        const changed = configs
          .filter((c) => draft[c.key] !== c.value)
          .map((c) => ({ key: c.key, value: draft[c.key] }));

        if (changed.length === 0) {
          toast({ type: 'info', message: '没有修改' });
          setSaving(false);
          return;
        }

        const res = await fetch('/api/admin/system-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: changed }),
        });
        const json = await res.json();
        if (json.success) {
          setConfigs(json.data);
          toast({ type: 'success', message: '保存成功' });
        } else {
          toast({ type: 'error', message: json.error?.message ?? '保存失败' });
        }
      } catch {
        toast({ type: 'error', message: '保存失败' });
      } finally {
        setSaving(false);
      }
    },
    [configs, draft, toast],
  );

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {configs.map((c) => {
        const label = LABELS[c.key] ?? c.key;
        return (
          <div key={c.key}>
            <label htmlFor={`cfg-${c.key}`} className="block text-sm font-medium text-zinc-700">
              {label}
              <span className="ml-2 text-xs text-zinc-400">({c.valueType})</span>
            </label>
            {c.valueType === 'boolean' ? (
              <select
                id={`cfg-${c.key}`}
                value={draft[c.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                id={`cfg-${c.key}`}
                type={c.valueType === 'integer' ? 'number' : 'text'}
                value={draft[c.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              />
            )}
            <p className="mt-0.5 text-xs text-zinc-400">
              更新于 {new Date(c.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>
        );
      })}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? '保存中…' : '保存配置'}
      </button>
    </form>
  );
}
