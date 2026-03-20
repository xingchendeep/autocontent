'use client';

import { useState } from 'react';
import Link from 'next/link';
import PlatformSelector from '@/components/generate/PlatformSelector';
import { TemplateSelector } from '@/components/generate/TemplateSelector';
import { BatchJobDetail } from '@/components/dashboard/BatchJobDetail';
import { useBatchJob } from '@/hooks/useBatchJob';
import { batchFormSchema } from '@/lib/validations/batch';
import type { PlatformCode } from '@/types';

const MAX_ITEMS = 50;

export function BatchPanel() {
  const [items, setItems] = useState<string[]>(['']);
  const [platforms, setPlatforms] = useState<PlatformCode[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const { submit, loading, error } = useBatchJob();

  function addItem() {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [...prev, '']);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, value: string) {
    setItems((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  async function handleSubmit() {
    const payload = {
      items: items.map((content) => ({ content })),
      platforms,
      templateId: templateId ?? undefined,
    };
    const result = batchFormSchema.safeParse(payload);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    const jobId = await submit({
      items: items.map((content) => ({ content, platforms })),
      templateId: templateId ?? undefined,
    });
    if (jobId) setSubmittedJobId(jobId);
  }

  if (submittedJobId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <button
          type="button"
          onClick={() => setSubmittedJobId(null)}
          className="mb-4 text-sm text-blue-600 hover:underline"
        >
          ← 返回批量生成
        </button>
        <BatchJobDetail jobId={submittedJobId} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">批量生成</h1>

      {error === 'PLAN_LIMIT_REACHED' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          当前套餐不支持批量生成。
          <Link href="/dashboard" className="ml-1 text-blue-600 hover:underline">升级套餐</Link>
        </div>
      )}

      <div className="mb-6">
        <TemplateSelector selectedId={templateId} onSelect={setTemplateId} />
      </div>

      <div className="mb-6">
        <PlatformSelector selected={platforms} onChange={setPlatforms} />
        {errors.platforms && <p className="mt-1 text-xs text-red-500">{errors.platforms}</p>}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">内容项 ({items.length}/{MAX_ITEMS})</span>
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= MAX_ITEMS}
          className="text-sm text-blue-600 hover:underline disabled:text-zinc-400 disabled:no-underline"
        >
          {items.length >= MAX_ITEMS ? '已达上限' : '+ 添加内容'}
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {items.map((content, i) => (
          <div key={i} className="flex gap-2">
            <textarea
              value={content}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder={`内容 ${i + 1}`}
              rows={2}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="self-start text-xs text-red-500 hover:underline"
              >
                删除
              </button>
            )}
          </div>
        ))}
        {errors.items && <p className="text-xs text-red-500">{errors.items}</p>}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? '提交中…' : '提交批量任务'}
      </button>
    </div>
  );
}
