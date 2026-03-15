import type { HistorySummaryItem } from '@/types';

const STATUS_STYLES: Record<HistorySummaryItem['status'], string> = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  failed:  'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<HistorySummaryItem['status'], string> = {
  success: '成功',
  partial: '部分失败',
  failed:  '失败',
};

interface Props {
  item: HistorySummaryItem;
}

export default function HistoryItem({ item }: Props) {
  const createdAt = new Date(item.createdAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const durationSec = (item.durationMs / 1000).toFixed(1);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <time dateTime={item.createdAt} className="text-xs text-zinc-500">
          {createdAt}
        </time>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <p className="truncate text-sm text-zinc-700">
        {item.inputSnippet.length === 0
          ? <span className="text-zinc-400">无内容预览</span>
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
    </div>
  );
}
