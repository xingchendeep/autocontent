'use client';

import type { SavedScriptItem } from '@/types';

interface SavedScriptsPanelProps {
  items: SavedScriptItem[];
  loading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function SavedScriptsPanel({
  items,
  loading,
  onSelect,
  onDelete,
}: SavedScriptsPanelProps) {
  if (loading) {
    return <p className="text-sm text-zinc-400">加载脚本库...</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        暂无保存的脚本。生成内容后脚本会自动保存到这里。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3"
        >
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex-1 min-w-0 text-left text-sm hover:text-blue-600"
          >
            <span className="block font-medium text-zinc-800 truncate">
              {item.title}
            </span>
            <span className="block text-xs text-zinc-500 truncate mt-0.5">
              {item.contentSnippet.length === 100
                ? `${item.contentSnippet}…`
                : item.contentSnippet}
            </span>
            <span className="block text-xs text-zinc-400 mt-0.5">
              {item.source === 'extract' ? '🔗 视频提取' : '📝 手动输入'}
              {' · '}
              {new Date(item.createdAt).toLocaleString('zh-CN')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="shrink-0 text-xs text-zinc-400 hover:text-red-500 mt-1"
            aria-label={`删除脚本: ${item.title}`}
          >
            删除
          </button>
        </li>
      ))}
    </ul>
  );
}
