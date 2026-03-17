'use client';

import { useState } from 'react';

interface ScriptItemProps {
  title: string;
  content: string;
  source: 'manual' | 'extract';
  sourceUrl: string | null;
  createdAt: string;
}

export default function ScriptItem({ title, content, source, sourceUrl, createdAt }: ScriptItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 200;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="font-medium text-zinc-800">{title}</p>

      <div className="mt-2">
        <p className={[
          'text-sm text-zinc-600 whitespace-pre-wrap break-words',
          !expanded && isLong ? 'line-clamp-3' : '',
        ].join(' ')}>
          {content}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            {expanded ? '收起' : '展开全文'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-zinc-400">
          {source === 'extract' ? '🔗 视频提取' : '📝 手动输入'}
        </span>
        {sourceUrl && (
          <span className="text-xs text-zinc-400 truncate max-w-[200px]">· {sourceUrl}</span>
        )}
        <span className="text-xs text-zinc-400">
          · {new Date(createdAt).toLocaleString('zh-CN')}
        </span>
      </div>
    </div>
  );
}
