'use client';

import { useTemplates } from '@/hooks/useTemplates';
import type { ToneValue } from '@/types';

const TONE_LABELS: Record<ToneValue, string> = {
  professional: '专业',
  casual: '轻松',
  humorous: '幽默',
  authoritative: '权威',
  empathetic: '共情',
};

const LENGTH_LABELS: Record<string, string> = {
  short: '短',
  medium: '中',
  long: '长',
};

interface TemplateSelectorProps {
  selectedId: string | null;
  onSelect: (templateId: string | null) => void;
}

export function TemplateSelector({ selectedId, onSelect }: TemplateSelectorProps) {
  const { templates, loading, error } = useTemplates();

  if (loading) {
    return <p className="text-xs text-zinc-400">加载模板中…</p>;
  }

  if (error) {
    return <p className="text-xs text-red-500">模板加载失败</p>;
  }

  const selected = (templates ?? []).find((t) => t.id === selectedId);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="template-select" className="text-sm font-medium text-zinc-700">
        选择模板
      </label>
      <select
        id="template-select"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      >
        <option value="">不使用模板</option>
        {(templates ?? []).map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {selected && (
        <p className="text-xs text-zinc-500">
          语气：{TONE_LABELS[selected.tone]} · 长度：{LENGTH_LABELS[selected.length] ?? selected.length}
        </p>
      )}
    </div>
  );
}
