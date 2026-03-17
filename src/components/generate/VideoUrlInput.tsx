'use client';

import { useState, useCallback } from 'react';

type ExtractStatus = 'idle' | 'extracting' | 'polling' | 'success' | 'error';

interface VideoUrlInputProps {
  onExtracted: (text: string) => void;
  disabled?: boolean;
}

/** 支持的视频平台提示 */
const SUPPORTED_HINT = 'B站、抖音、快手等平台的视频链接';

export default function VideoUrlInput({ onExtracted, disabled = false }: VideoUrlInputProps) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ExtractStatus>('idle');
  const [message, setMessage] = useState('');

  const isValidUrl = useCallback((v: string) => {
    try {
      const u = new URL(v.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  const canExtract = url.trim().length > 0 && isValidUrl(url) && status !== 'extracting' && status !== 'polling';

  async function handleExtract() {
    if (!canExtract) return;
    const videoUrl = url.trim();

    setStatus('extracting');
    setMessage('正在提交提取任务...');

    try {
      // Step 1: Submit extraction job
      const submitRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      });

      const submitJson = await submitRes.json();
      if (!submitJson.success) {
        setStatus('error');
        setMessage(submitJson.error?.message ?? '提取任务提交失败');
        return;
      }

      const { jobId, platform } = submitJson.data;
      setStatus('polling');
      setMessage(`正在提取视频脚本（${platform}），请稍候...`);

      // Step 2: Poll for result
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));

        const pollRes = await fetch(`/api/extract/${jobId}`);
        const pollJson = await pollRes.json();

        if (!pollJson.success) continue;

        const job = pollJson.data;
        if (job.status === 'completed' && job.result?.text) {
          setStatus('success');
          const method = job.result.method === 'subtitle_api' ? '字幕提取' : '语音识别';
          setMessage(`✅ ${method}完成，内容已填入输入框`);
          onExtracted(job.result.text);
          return;
        }
        if (job.status === 'failed') {
          setStatus('error');
          setMessage(`❌ 提取失败：${job.error ?? '未知错误'}`);
          return;
        }
      }

      setStatus('error');
      setMessage('提取超时，请稍后重试');
    } catch {
      setStatus('error');
      setMessage('网络错误，请检查网络后重试');
    }
  }

  const isWorking = status === 'extracting' || status === 'polling';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="url"
          className={[
            'flex-1 rounded-lg border px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-300',
            disabled || isWorking
              ? 'cursor-not-allowed bg-zinc-100 text-zinc-400 border-zinc-200'
              : 'bg-white text-zinc-900 border-zinc-300',
          ].join(' ')}
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (status === 'error' || status === 'success') setStatus('idle'); }}
          disabled={disabled || isWorking}
          placeholder={`粘贴视频链接（${SUPPORTED_HINT}）`}
          aria-label="视频链接输入"
        />
        <button
          type="button"
          onClick={handleExtract}
          disabled={!canExtract || disabled}
          className={[
            'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-300',
            !canExtract || disabled
              ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          ].join(' ')}
        >
          {isWorking ? '提取中...' : '提取脚本'}
        </button>
      </div>

      {/* Status message */}
      {message && (
        <p
          className={[
            'text-xs px-1',
            status === 'error' ? 'text-red-500' : status === 'success' ? 'text-green-600' : 'text-zinc-500',
          ].join(' ')}
          role={status === 'error' ? 'alert' : undefined}
        >
          {isWorking && (
            <span className="inline-block mr-1 animate-spin">⏳</span>
          )}
          {message}
        </p>
      )}

      <p className="text-xs text-zinc-400 px-1">
        支持 B站（字幕提取）、抖音、快手等平台。粘贴视频页面链接，自动提取视频中的语音内容。
      </p>
    </div>
  );
}
