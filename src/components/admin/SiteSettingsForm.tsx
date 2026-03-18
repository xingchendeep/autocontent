'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface SiteSetting {
  key: string;
  value: string;
  valueType: string;
  updatedBy: string | null;
  updatedAt: string;
}

const LABELS: Record<string, string> = {
  site_title: '站点标题',
  site_description: '站点描述',
  hero_title: 'Hero 标题',
  hero_description: 'Hero 描述',
  copyright_text: '版权文本',
  meta_keywords: 'SEO 关键词',
};

export function SiteSettingsForm() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setSettings(res.data);
          const d: Record<string, string> = {};
          for (const s of res.data) d[s.key] = s.value;
          setDraft(d);
        }
      })
      .catch(() => toast({ type: 'error', message: '加载设置失败' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleChange = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        const changed = settings
          .filter((s) => draft[s.key] !== s.value)
          .map((s) => ({ key: s.key, value: draft[s.key] }));

        if (changed.length === 0) {
          toast({ type: 'info', message: '没有修改' });
          setSaving(false);
          return;
        }

        const res = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: changed }),
        });
        const json = await res.json();
        if (json.success) {
          setSettings(json.data);
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
    [settings, draft, toast],
  );

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {settings.map((s) => {
        const label = LABELS[s.key] ?? s.key;
        const isLong =
          s.key === 'hero_description' || s.key === 'site_description';
        return (
          <div key={s.key}>
            <label
              htmlFor={`setting-${s.key}`}
              className="block text-sm font-medium text-zinc-700"
            >
              {label}
            </label>
            {isLong ? (
              <textarea
                id={`setting-${s.key}`}
                value={draft[s.key] ?? ''}
                onChange={(e) => handleChange(s.key, e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            ) : (
              <input
                id={`setting-${s.key}`}
                type="text"
                value={draft[s.key] ?? ''}
                onChange={(e) => handleChange(s.key, e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            )}
            <p className="mt-0.5 text-xs text-zinc-400">
              更新于 {new Date(s.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>
        );
      })}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? '保存中…' : '保存设置'}
      </button>
    </form>
  );
}
