'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

type ExtractStatus = 'idle' | 'extracting' | 'polling' | 'success' | 'error';

interface VideoUrlInputProps {
  onExtracted: (text: string) => void;
  disabled?: boolean;
}

const SUPPORTED_HINT = 'B站、抖音、快手等平台的视频链接';

export default function VideoUrlInput({ onExtracted, disabled = false }: VideoUrlInputProps) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ExtractStatus>('idle');
  const [message, setMessage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWorking = status === 'extracting' || status === 'polling';

  useEffect(() => {
    if (isWorking) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isWorking]);

  const isValidUrl = useCallback((v: string) => {
    try {
      const u = new URL(v.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }, []);

  const canExtract = url.trim().length > 0 && isValidUrl(url) && !isWorking;

  // ── B站：通过服务端代理提取字幕（服务端调 B站 API，无 CORS 限制）──
  async function extractBilibili(videoUrl: string): Promise<string | null> {
    try {
      setMessage('正在提取 B站字幕...');
      const res = await fetch('/api/extract/bilibili-subtitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      });
      if (!res.ok) return null;
      const json = await res.json() as { success?: boolean; data?: { text: string } };
      return json.success && json.data?.text ? json.data.text : null;
    } catch {
      return null;
    }
  }

  // ── 抖音：解析短链/分享链获取 awemeId + CDN URL，然后交给服务端 ASR ──
  async function extractDouyin(videoUrl: string): Promise<{ awemeId: string; videoDirectUrl?: string } | null> {
    try {
      // 先尝试直接从 URL 提取 awemeId
      const videoMatch = videoUrl.match(/\/video\/(\d{15,})/);
      const modalMatch = videoUrl.match(/modal_id=(\d{15,})/);
      const directId = videoMatch?.[1] ?? modalMatch?.[1];

      // 如果能直接提取 awemeId，也调服务端获取 CDN URL
      // 如果是短链，服务端会同时解析 awemeId + CDN URL
      setMessage('正在解析抖音链接...');
      const res = await fetch('/api/extract/resolve-douyin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      });
      if (res.ok) {
        const json = await res.json() as { success?: boolean; data?: { awemeId: string; videoDirectUrl?: string } };
        if (json.success && json.data?.awemeId) {
          return { awemeId: json.data.awemeId, videoDirectUrl: json.data.videoDirectUrl ?? undefined };
        }
      }

      // 服务端解析失败，但如果有直接提取的 awemeId 就用它
      if (directId) return { awemeId: directId };
      return null;
    } catch {
      // 网络错误时 fallback 到直接提取
      const videoMatch = videoUrl.match(/\/video\/(\d{15,})/);
      const modalMatch = videoUrl.match(/modal_id=(\d{15,})/);
      const directId = videoMatch?.[1] ?? modalMatch?.[1];
      if (directId) return { awemeId: directId };
      return null;
    }
  }

  async function handleExtract() {
    if (!canExtract) return;
    const videoUrl = url.trim();
    const host = (() => { try { return new URL(videoUrl).hostname; } catch { return ''; } })();

    setStatus('extracting');
    setMessage('正在分析链接...');

    try {
      // ── B站：浏览器端直接提取字幕 ──
      if (host.includes('bilibili.com') || host.includes('b23.tv')) {
        const text = await extractBilibili(videoUrl);
        if (text) {
          setStatus('success');
          setMessage('✅ B站字幕提取成功，内容已填入输入框');
          onExtracted(text);
          return;
        }
        // 字幕提取失败，fallback 到服务端 ASR
        setMessage('该视频无字幕，尝试语音识别...');
      }

      // ── 抖音：提取 awemeId + CDN URL，传给服务端 ──
      let extraBody: Record<string, string> = {};
      if (host.includes('douyin.com') || host.includes('iesdouyin.com')) {
        const dy = await extractDouyin(videoUrl);
        if (dy?.awemeId) {
          extraBody = { awemeId: dy.awemeId };
          if (dy.videoDirectUrl) {
            // 把 CDN URL 作为 audioUrl 传给后端，后端直接用它提交 ASR，跳过代理下载
            extraBody.audioUrl = dy.videoDirectUrl;
            setMessage(`已获取视频地址，正在提交语音识别...`);
          } else {
            setMessage(`已获取视频 ID（${dy.awemeId}），正在提交语音识别...`);
          }
        } else {
          setStatus('error');
          setMessage('无法从该抖音链接解析出视频 ID，请尝试使用完整的视频页面链接');
          return;
        }
      }

      // ── 提交服务端提取任务 ──
      setMessage('正在提交提取任务...');
      const submitRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, ...extraBody }),
      });

      if (!submitRes.ok) {
        let errMsg = `请求失败（${submitRes.status}）`;
        try { const j = await submitRes.json(); errMsg = j.error?.message ?? errMsg; } catch { /* */ }
        setStatus('error');
        setMessage(errMsg);
        return;
      }

      const submitJson = await submitRes.json();
      if (!submitJson.success) {
        setStatus('error');
        setMessage(submitJson.error?.message ?? '提取任务提交失败');
        return;
      }

      const { jobId, platform, status: jobStatus, result, error: jobError } = submitJson.data as {
        jobId: string; platform: string; status?: string;
        result?: { text: string; method: string }; error?: string;
      };

      // POST 可能直接返回 completed（如 B站字幕）或 failed
      if (jobStatus === 'completed' && result?.text) {
        setStatus('success');
        const method = result.method === 'subtitle_api' ? '字幕提取' : '语音识别';
        setMessage(`✅ ${method}完成，内容已填入输入框`);
        onExtracted(result.text);
        return;
      }
      if (jobStatus === 'failed') {
        setStatus('error');
        setMessage(`❌ 提取失败：${jobError ?? '未知错误'}`);
        return;
      }

      setStatus('polling');
      setMessage(`正在提取视频脚本（${platform}），请稍候...`);

      // ── 轮询结果 ──
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        let pollJson: { success?: boolean; data?: { status: string; result?: { text: string; method: string }; error?: string } };
        try {
          const pollRes = await fetch(`/api/extract/${jobId}`);
          pollJson = await pollRes.json();
        } catch { continue; }

        if (!pollJson.success || !pollJson.data) continue;
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
    } catch (err) {
      setStatus('error');
      setMessage(`请求异常：${err instanceof Error ? err.message : String(err)}`);
    }
  }

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
          onChange={(e) => { setUrl(e.target.value); if (status !== 'idle') setStatus('idle'); setMessage(''); }}
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
          {isWorking ? `提取中… ${elapsed}s` : '提取脚本'}
        </button>
      </div>

      {isWorking && (
        <div className="px-1">
          <div className="h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden mb-1">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-1000 ease-linear"
              style={{ width: `${Math.min((elapsed / 120) * 100, 95)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">
            <span className="inline-block mr-1 animate-spin">⏳</span>
            {message} ({elapsed}s)
          </p>
        </div>
      )}

      {!isWorking && message && (
        <p
          className={[
            'text-xs px-1',
            status === 'error' ? 'text-red-500' : status === 'success' ? 'text-green-600' : 'text-zinc-500',
          ].join(' ')}
          role={status === 'error' ? 'alert' : undefined}
        >
          {message}
        </p>
      )}

      <p className="text-xs text-zinc-400 px-1">
        支持 B站（字幕提取）、抖音、快手等平台。粘贴视频页面链接，自动提取视频中的语音内容。
      </p>
    </div>
  );
}
