'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface SystemTemplate {
  platform: string;
  displayName: string;
  promptInstructions: string;
  maxTitleLength: number;
  maxContentLength: number;
  hashtagStyle: string;
  promptVersion: string;
  updatedBy: string | null;
  updatedAt: string;
}

const HASHTAG_OPTIONS = ['inline', 'trailing', 'none'];

export function TemplateEditor() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SystemTemplate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<SystemTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/templates')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setTemplates(res.data);
          setSelected(res.data[0].platform);
          setDraft(res.data[0]);
        }
      })
      .catch(() => toast({ type: 'error', message: '加载模板失败' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSelect = useCallback(
    (platform: string) => {
      setSelected(platform);
      const t = templates.find((t) => t.platform === platform);
      if (t) setDraft(t);
    },
    [templates],
  );

  const handleSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/templates/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: draft.displayName,
          promptInstructions: draft.promptInstructions,
          maxTitleLength: draft.maxTitleLength,
          maxContentLength: draft.maxContentLength,
          hashtagStyle: draft.hashtagStyle,
          promptVersion: draft.promptVersion,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '模板已保存' });
        setTemplates((prev) =>
          prev.map((t) => (t.platform === selected ? { ...t, ...json.data } : t)),
        );
      } else {
        toast({ type: 'error', message: json.error?.message ?? '保存失败' });
      }
    } catch {
      toast({ type: 'error', message: '保存失败' });
    } finally {
      setSaving(false);
    }
  }, [selected, draft, toast]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>;
  }

  return (
    <div className="flex gap-6">
      {/* Platform list */}
      <div className="w-44 shrink-0 space-y-1">
        {templates.map((t) => (
          <button
            key={t.platform}
            type="button"
            onClick={() => handleSelect(t.platform)}
            className={`w-full rounded-md px-3 py-2 text-left text-sm ${
              selected === t.platform
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {t.displayName}
          </button>
        ))}
      </div>

      {/* Editor */}
      {selected && (
        <div className="flex-1 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="space-y-4">
            <Field label="显示名称">
              <input
                type="text"
                value={draft.displayName ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              />
            </Field>
            <Field label="提示词">
              <textarea
                value={draft.promptInstructions ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, promptInstructions: e.target.value }))}
                rows={6}
                className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="标题最大长度">
                <input
                  type="number"
                  min={0}
                  value={draft.maxTitleLength ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, maxTitleLength: Number(e.target.value) }))}
                  className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                />
              </Field>
              <Field label="正文最大长度">
                <input
                  type="number"
                  min={0}
                  value={draft.maxContentLength ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, maxContentLength: Number(e.target.value) }))}
                  className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                />
              </Field>
              <Field label="标签风格">
                <select
                  value={draft.hashtagStyle ?? 'none'}
                  onChange={(e) => setDraft((d) => ({ ...d, hashtagStyle: e.target.value }))}
                  className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                >
                  {HASHTAG_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Prompt 版本">
              <input
                type="text"
                value={draft.promptVersion ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, promptVersion: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              />
            </Field>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
