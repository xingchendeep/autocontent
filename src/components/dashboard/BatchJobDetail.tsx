'use client';

import { useEffect, useState } from 'react';
import { useBatchJob } from '@/hooks/useBatchJob';
import { Skeleton } from '@/components/ui/Skeleton';
import type { BatchJobItem, PlatformCode } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  partial: '部分完成',
};

export function BatchJobDetail({ jobId }: { jobId: string }) {
  const { job, polling, error, startPolling } = useBatchJob();

  useEffect(() => {
    startPolling(jobId);
  }, [jobId, startPolling]);

  if (error === '任务不存在') {
    return <p className="py-8 text-center text-sm text-zinc-500">任务不存在</p>;
  }

  if (!job) {
    return <Skeleton rows={4} widths={['100%', '80%', '60%', '100%']} />;
  }

  const pct = job.itemCount > 0 ? Math.round((job.completedCount / job.itemCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {STATUS_LABELS[job.status] ?? job.status}
          </span>
          {polling && <span className="text-xs text-zinc-400">轮询中…</span>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {job.completedCount}/{job.itemCount} 完成
          {job.failedCount > 0 && <span className="ml-2 text-red-500">{job.failedCount} 失败</span>}
        </p>
      </div>

      {job.items && job.items.length > 0 && (
        <div className="flex flex-col gap-3">
          {job.items.map((item, i) => (
            <BatchResultItem key={item.itemId} item={item} index={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchResultItem({ item, index }: { item: BatchJobItem; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-700">#{index}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              item.status === 'completed'
                ? 'bg-green-50 text-green-700'
                : item.status === 'failed'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            {item.status === 'completed' ? '成功' : item.status === 'failed' ? '失败' : STATUS_LABELS[item.status] ?? item.status}
          </span>
        </div>
        {item.status === 'completed' && item.results && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:underline"
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>

      {item.status === 'failed' && item.errorMessage && (
        <p className="mt-2 text-xs text-red-500">{item.errorMessage}</p>
      )}

      {expanded && item.results && (
        <div className="mt-3 flex flex-col gap-2">
          {(Object.entries(item.results) as [PlatformCode, { content: string }][]).map(
            ([platform, result]) => (
              <PlatformResult key={platform} platform={platform} content={result.content} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function PlatformResult({ platform, content }: { platform: string; content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded border border-zinc-100 bg-zinc-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600">{platform}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-blue-600 hover:underline"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm text-zinc-700">{content}</p>
    </div>
  );
}
