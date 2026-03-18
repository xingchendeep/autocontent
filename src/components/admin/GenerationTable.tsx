'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface AdminGenerationItem {
  id: string;
  userEmail: string | null;
  inputSnippet: string;
  platforms: string[];
  status: string;
  modelName: string | null;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  createdAt: string;
}

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'duration_ms', label: '耗时' },
  { value: 'tokens_input', label: 'Token 输入' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'partial', label: '部分成功' },
  { value: 'failed', label: '失败' },
];

export function GenerationTable() {
  const { toast } = useToast();
  const [items, setItems] = useState<AdminGenerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const res = await fetch(`/api/admin/generations?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } catch {
      toast({ type: 'error', message: '加载生成记录失败' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, sortBy, sortOrder, startDate, endDate, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/generations/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '生成记录已删除' });
        fetchData();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '删除失败' });
      }
    } finally {
      setDeleteId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜索内容…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchData(); } }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          aria-label="状态筛选"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          aria-label="排序字段"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        >
          {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
        </button>
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          aria-label="开始日期"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          aria-label="结束日期"
        />
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-zinc-500">
              <th className="px-4 py-2 font-medium">用户</th>
              <th className="px-4 py-2 font-medium">内容摘要</th>
              <th className="px-4 py-2 font-medium">平台</th>
              <th className="px-4 py-2 font-medium">状态</th>
              <th className="px-4 py-2 text-right font-medium">耗时</th>
              <th className="px-4 py-2 text-right font-medium">Tokens</th>
              <th className="px-4 py-2 font-medium">时间</th>
              <th className="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              items.map((g) => (
                <tr key={g.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="max-w-[140px] truncate px-4 py-2 text-zinc-600">
                    {g.userEmail ?? '—'}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-zinc-700">
                    {g.inputSnippet}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {g.platforms.length} 个平台
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={g.status} />
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-600">
                    {(g.durationMs / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-600">
                    {g.tokensInput + g.tokensOutput}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(g.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-2 flex gap-2">
                    <Link
                      href={`/admin/generations/${g.id}`}
                      className="text-zinc-600 hover:text-zinc-900 hover:underline"
                    >
                      详情
                    </Link>
                    <button
                      onClick={() => setDeleteId(g.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
        <span>共 {total} 条</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-2 py-1">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="确认删除"
        message="确定要删除这条生成记录吗？此操作不可撤销。"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-green-50 text-green-600',
    partial: 'bg-yellow-50 text-yellow-600',
    failed: 'bg-red-50 text-red-600',
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${styles[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status}
    </span>
  );
}
