'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type UploadStatus = 'idle' | 'uploading' | 'polling' | 'success' | 'error';

interface FileUploadInputProps {
  onExtracted: (text: string) => void;
  disabled?: boolean;
}

const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTS = ['.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg'];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploadInput({ onExtracted, disabled = false }: FileUploadInputProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWorking = status === 'uploading' || status === 'polling';

  useEffect(() => {
    if (isWorking) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isWorking]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (file.size > MAX_SIZE) {
      setStatus('error');
      setMessage(`文件太大（${formatSize(file.size)}），最大支持 50MB`);
      return;
    }

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!ALLOWED_EXTS.includes(ext)) {
      setStatus('error');
      setMessage('不支持的文件格式，请上传 MP4/WebM/MOV/MP3/WAV/OGG 文件');
      return;
    }

    setFileName(file.name);
    setStatus('uploading');
    setMessage(`正在上传 ${file.name}（${formatSize(file.size)}）...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/extract/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        let errMsg = `上传失败（${uploadRes.status}）`;
        try {
          const errJson = await uploadRes.json();
          errMsg = errJson.error?.message ?? errMsg;
        } catch { /* response not JSON */ }
        setStatus('error');
        setMessage(errMsg);
        return;
      }

      const uploadJson = await uploadRes.json();
      if (!uploadJson.success) {
        setStatus('error');
        setMessage(uploadJson.error?.message ?? '上传失败');
        return;
      }

      const { jobId } = uploadJson.data;
      setStatus('polling');
      setMessage('上传完成，正在识别语音内容...');

      // Poll for result
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        let pollJson: { success?: boolean; data?: { status: string; result?: { text: string }; error?: string } };
        try {
          const pollRes = await fetch(`/api/extract/${jobId}`);
          pollJson = await pollRes.json();
        } catch {
          continue;
        }
        if (!pollJson.success || !pollJson.data) continue;

        const job = pollJson.data;
        if (job.status === 'completed' && job.result?.text) {
          setStatus('success');
          setMessage(`✅ 语音识别完成，内容已填入输入框`);
          onExtracted(job.result.text);
          return;
        }
        if (job.status === 'failed') {
          setStatus('error');
          setMessage(`❌ 识别失败：${job.error ?? '未知错误'}`);
          return;
        }
      }

      setStatus('error');
      setMessage('识别超时，请稍后重试');
    } catch (err) {
      setStatus('error');
      const detail = err instanceof Error ? err.message : String(err);
      setMessage(`请求异常：${detail}`);
    }
  }, [onExtracted]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".mp4,.webm,.mov,.mp3,.wav,.ogg"
          onChange={handleFileChange}
          disabled={disabled || isWorking}
          className="hidden"
          aria-label="选择视频或音频文件"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || isWorking}
          className={[
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-300',
            disabled || isWorking
              ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          ].join(' ')}
        >
          {isWorking ? `处理中… ${elapsed}s` : '📁 选择文件'}
        </button>
        {fileName && !isWorking && status !== 'error' && (
          <span className="text-xs text-zinc-500 truncate max-w-[200px]">{fileName}</span>
        )}
      </div>

      {/* Progress bar */}
      {isWorking && (
        <div>
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
        <p className={[
          'text-xs px-1',
          status === 'error' ? 'text-red-500' : status === 'success' ? 'text-green-600' : 'text-zinc-500',
        ].join(' ')} role={status === 'error' ? 'alert' : undefined}>
          {message}
        </p>
      )}

      <p className="text-xs text-zinc-400 px-1">
        支持 MP4、WebM、MOV 视频和 MP3、WAV、OGG 音频，最大 50MB。上传后自动识别语音内容。
      </p>
    </div>
  );
}
