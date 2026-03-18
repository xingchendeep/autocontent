'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/contexts/ToastContext';

interface GenerationDetailData {
  id: string;
  userId: string | null;
  userEmail: string | null;
  inputSource: string;
  inputContent: string;
  platforms: string[];
  resultJson: Record<string, unknown>;
  status: string;
  modelName: string | null;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  createdAt: string;
}

export function GenerationDetail({ generationId }: { generationId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<GenerationDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/generations/${generationId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else toast({ type: 'error', message: res.error?.message ?? '加载失败' });
      })
      .catch(() => toast({ type: 'error', message: '加载失败' }))
      .finally(() => setLoading(false));
  }, [generationId, toast]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>;
  }

  if (!data) {
    return <p className="py-8 text-center text-sm text-zinc-400">记录不存在</p>;
  }

  return (
    <div>
      <Link
        href="/admin/generations"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← 返回生成记录
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* Meta info */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">基本信息</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="ID" value={data.id} />
            <Row label="用户" value={data.userEmail ?? '—'} />
            <Row label="来源" value={data.inputSource} />
            <Row label="平台" value={data.platforms.join(', ')} />
            <Row label="状态" value={data.status} />
            <Row label="模型" value={data.modelName ?? '—'} />
            <Row label="耗时" value={`${(data.durationMs / 1000).toFixed(1)}s`} />
            <Row label="Token 输入" value={String(data.tokensInput)} />
            <Row label="Token 输出" value={String(data.tokensOutput)} />
            <Row
              label="创建时间"
              value={new Date(data.createdAt).toLocaleString('zh-CN')}
            />
          </dl>
        </div>

        {/* Input content */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">输入内容</h2>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs text-zinc-700">
            {data.inputContent}
          </pre>
        </div>

        {/* Result JSON */}
        <div className="col-span-full rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">生成结果</h2>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs text-zinc-700">
            {JSON.stringify(data.resultJson, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-700">{value}</dd>
    </div>
  );
}
