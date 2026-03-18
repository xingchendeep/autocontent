'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface ScriptItem {
  id: string;
  userId: string;
  userEmail: string | null;
  title: string;
  contentSnippet: string;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
}

interface PaginatedResult {
  items: ScriptItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function ScriptManager() {
  const [data, setData] = useState<PaginatedResult>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/scripts?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/scripts/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '脚本已删除' });
        fetchData();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '删除失败' });
      }
    } finally {
      setDeleteId(null);
    }
  }

  const totalPages = Math.ceil(data.total / data.pageSize);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
          placeholder="搜索标题或内容..."
          className="w-64 rounded border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => { setSearch(searchInput); setPage(1); }}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
        >
          搜索
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">加载中...</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无脚本</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 font-medium text-zinc-600">标题</th>
                  <th className="px-4 py-2 font-medium text-zinc-600">用户</th>
                  <th className="px-4 py-2 font-medium text-zinc-600">来源</th>
                  <th className="px-4 py-2 font-medium text-zinc-600">内容摘要</th>
                  <th className="px-4 py-2 font-medium text-zinc-600">创建时间</th>
                  <th className="px-4 py-2 font-medium text-zinc-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="max-w-[200px] truncate px-4 py-2 font-medium text-zinc-900">{s.title}</td>
                    <td className="px-4 py-2 text-zinc-600">{s.userEmail ?? s.userId.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${s.source === 'extract' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>
                        {s.source === 'extract' ? '提取' : '手动'}
                      </span>
                    </td>
                    <td className="max-w-[300px] truncate px-4 py-2 text-zinc-500">{s.contentSnippet}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{new Date(s.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setDeleteId(s.id)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
              <span>共 {data.total} 条，第 {page}/{totalPages} 页</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">上一页</button>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">下一页</button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="确认删除"
        message="确定要删除这条脚本吗？此操作不可撤销。"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
