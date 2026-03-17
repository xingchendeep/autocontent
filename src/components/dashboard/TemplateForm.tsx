'use client';

import { useState } from 'react';
import { templateFormSchema, type TemplateFormValues } from '@/lib/validations/template';
import type { ToneValue, LengthValue } from '@/types';

const TONE_OPTIONS: { value: ToneValue; label: string }[] = [
  { value: 'professional', label: '专业' },
  { value: 'casual', label: '轻松' },
  { value: 'humorous', label: '幽默' },
  { value: 'authoritative', label: '权威' },
  { value: 'empathetic', label: '共情' },
];

const LENGTH_OPTIONS: { value: LengthValue; label: string }[] = [
  { value: 'short', label: '短' },
  { value: 'medium', label: '中' },
  { value: 'long', label: '长' },
];

interface TemplateFormProps {
  initialValues?: {
    name: string;
    tone: ToneValue;
    length: LengthValue;
    customInstructions?: string;
  };
  onSubmit: (values: TemplateFormValues) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function TemplateForm({ initialValues, onSubmit, onCancel, loading }: TemplateFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [tone, setTone] = useState<ToneValue>(initialValues?.tone ?? 'professional');
  const [length, setLength] = useState<LengthValue>(initialValues?.length ?? 'medium');
  const [customInstructions, setCustomInstructions] = useState(initialValues?.customInstructions ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = templateFormSchema.safeParse({ name, tone, length, customInstructions: customInstructions || undefined });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    await onSubmit(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="tpl-name" className="mb-1 block text-sm font-medium text-zinc-700">名称</label>
        <input
          id="tpl-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className={`w-full rounded-md border px-3 py-2 text-sm ${errors.name ? 'border-red-500' : 'border-zinc-300'}`}
          disabled={loading}
        />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tpl-tone" className="mb-1 block text-sm font-medium text-zinc-700">语气</label>
          <select
            id="tpl-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value as ToneValue)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            disabled={loading}
          >
            {TONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tpl-length" className="mb-1 block text-sm font-medium text-zinc-700">长度</label>
          <select
            id="tpl-length"
            value={length}
            onChange={(e) => setLength(e.target.value as LengthValue)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            disabled={loading}
          >
            {LENGTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="tpl-instructions" className="mb-1 block text-sm font-medium text-zinc-700">自定义指令（可选）</label>
        <textarea
          id="tpl-instructions"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          maxLength={2000}
          rows={3}
          className={`w-full rounded-md border px-3 py-2 text-sm ${errors.customInstructions ? 'border-red-500' : 'border-zinc-300'}`}
          disabled={loading}
        />
        <div className="mt-1 flex justify-between text-xs">
          {errors.customInstructions ? (
            <span className="text-red-500">{errors.customInstructions}</span>
          ) : <span />}
          <span className="text-zinc-400">{customInstructions.length} / 2000</span>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          disabled={loading}
        >
          取消
        </button>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '保存中…' : initialValues ? '更新' : '创建'}
        </button>
      </div>
    </form>
  );
}
