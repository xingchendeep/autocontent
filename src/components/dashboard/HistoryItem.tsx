'use client';

import { useState } from 'react';
import { PLATFORM_TEMPLATES } from '@/lib/ai/templates';
import type {
  HistorySummaryItem,
  HistoryDetailResponse,
  GeneratePlatformOutput,
  PlatformCode,
  ApiSuccess,
  ApiError,
} from '@/types';

const STATUS_STYLES: Record<HistorySummaryItem['status'], string> = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<HistorySummaryItem['status'], string> = {
  success: '成功',
  partial: '部分失败',
  failed: '失败',
};

interface Props {
  item: HistorySummaryItem;
}

export default function HistoryItem({ item }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<HistoryDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  const createdAt = new Date(item.createdAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const durationSec = (item.durationMs / 1000).toFixed(1);

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return; // already fetched

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/history/${item.id}`);
      const json = (await res.json()) as ApiSuccess<HistoryDetailResponse> | ApiError;
      if (!json.success) {
        setError((json as ApiError).error.message);
        return;
      }
      setDetail((json as ApiSuccess<HistoryDetailResponse>).data);
    } catch {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(platform: string, output: GeneratePlatformOutput) {
    const text = [output.title, output.content, output.hashtags?.join(' ')]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  }

  const results = detail?.resultJson as Partial<Record<PlatformCode, GeneratePlatformOutput>> | undefined;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* Summary row — always visible, clickable */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <time dateTime={item.createdAt} className="text-xs text-zinc-500">
            {createdAt}
          </time>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
              {STATUS_LABELS[item.status]}
            </span>
            <span className="text-xs text-zinc-400">{expanded ? '收起 ▲' : '展开 ▼'}</span>
          </div>
        </div>

        <p className="text-sm text-zinc-700" style={{ display: expanded ? undefined : '-webkit-box', WebkitLineClamp: expanded ? undefined : 2, WebkitBoxOrient: 'vertical', overflow: expanded ? undefined : 'hidden' }}>
          {item.inputSnippet.length === 0
            ? '无内容预览'
            : item.inputSnippet.length === 100
              ? `${item.inputSnippet}…`
              : item.inputSnippet}
        </p>

        <div className="flex flex-wrap gap-1">
          {item.platforms.map((p) => (
            <span key={p} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {p}
            </span>
          ))}
        </div>
        <p className="text-xs text-zinc-400">耗时 {durationSec} 秒</p>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-100 px-4 py-3 flex flex-col gap-4">
          {loading && <p className="text-sm text-zinc-400">加载中...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          {detail && (
            <>
              {/* Original script content */}
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-zinc-500">原始脚本</h3>
                <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {detail.inputContent}
                </div>
              </div>

              {/* Platform results */}
              {results && Object.keys(results).length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-medium text-zinc-500">各平台生成内容</h3>
                  {(Object.entries(results) as [PlatformCode, GeneratePlatformOutput][]).map(
                    ([platform, output]) => {
                      const displayName = PLATFORM_TEMPLATES[platform]?.displayName ?? platform;
                      return (
                        <div key={platform} className="rounded-lg border border-zinc-100 bg-white p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-zinc-700">{displayName}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCopy(platform, output); }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {copiedPlatform === platform ? '已复制 ✓' : '复制'}
                            </button>
                          </div>
                          {output.title && <p className="text-sm font-medium text-zinc-800">{output.title}</p>}
                          <p className="text-sm text-zinc-800 whitespace-pre-wrap">{output.content}</p>
                          {output.hashtags && output.hashtags.length > 0 && (
                            <p className="text-sm text-blue-500">{output.hashtags.join(' ')}</p>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
