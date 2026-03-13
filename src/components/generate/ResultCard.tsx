'use client';

import { useState } from 'react';
import { PLATFORM_TEMPLATES } from '@/lib/ai/templates';
import { trackCopyClick } from '@/lib/analytics';
import type { PlatformCode, GeneratePlatformOutput } from '@/types';

interface ResultCardProps {
  platform: PlatformCode;
  result: GeneratePlatformOutput | null;
  error?: string;
}

export default function ResultCard({ platform, result, error }: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const displayName = PLATFORM_TEMPLATES[platform].displayName;

  async function handleCopy() {
    if (!result) return;
    const text = [result.title, result.content, result.hashtags?.join(' ')]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    trackCopyClick(platform);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-700">{displayName}</span>
        {result && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-blue-600 hover:underline focus:outline-none"
            aria-label={`复制 ${displayName} 文案`}
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
        )}
      </div>

      {result ? (
        <div className="flex flex-col gap-2 text-sm text-zinc-800">
          {result.title && (
            <p className="font-medium">{result.title}</p>
          )}
          <p className="whitespace-pre-wrap">{result.content}</p>
          {result.hashtags && result.hashtags.length > 0 && (
            <p className="text-blue-500">{result.hashtags.join(' ')}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-red-500" role="alert">
          {error ?? '生成失败'}
        </p>
      )}
    </div>
  );
}
