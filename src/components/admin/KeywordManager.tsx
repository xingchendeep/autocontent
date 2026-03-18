'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface BlockedKeywordItem {
  id: string;
  keyword: string;
  category: string;
  createdBy: string | null;
  createdAt: string;
}

const CATEGORIES = ['general', 'political', 'violence', 'pornography', 'fraud'];

export function KeywordManager() {
  const { toast } = useToast();
  const [items, setItems] = useState<BlockedKeywordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlockedKeywordItem | null>(null);

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (categoryFilter) params.set('category', categoryFilter);
    try {
      const res = await fetch(`/api/admin/keywords?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } catch {
      toast({ type: 'error', message: '加载关键词失败' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, categoryFilter, toast]);

  useEffect(() => { fetchKeywords(); }, [fetchKeywords]);

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword.trim(), category: newCategory }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '添加成功' });
        setNewKeyword('');
        fetchKeywords();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '添加失败' });
      }
    } catch {
      toast({ type: 'error', message: '添加失败' });
    } finally {
      setAdding(false);
    }
  }, [newKeyword, newCategory, toast, fetchKeywords]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/keywords/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '已删除' });
        fetchKeywords();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '删除失败' });
      }
    } catch {
      toast({ type: 'error', message: '删除失败' });
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, toast, fetchKeywords]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* Add form */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="kw-input" className="block text-sm font-medium text-zinc-700">关键词</label>
          <input
            id="kw-input"
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="输入关键词…"
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="kw-cat" className="block text-sm font-medium text-zinc-700">分类</label>
          <select
            id="kw-cat"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          type="submit"
          disabled={adding}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {adding ? '添加中…' : '添加'}
        </button>
      </form>

      {/* Filter */}
      <div className="mt-4 flex items-center gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          aria-label="分类筛选"
        >
          <option value="">全部分类</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-zinc-500">共 {total} 条</span>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-zinc-500">
              <th className="px-4 py-2 font-medium">关键词</th>
              <th className="px-4 py-2 font-medium">分类</th>
              <th className="px-4 py-2 font-medium">添加时间</th>
              <th className="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">加载中…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">暂无数据</td></tr>
            ) : (
              items.map((kw) => (
                <tr key={kw.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-4 py-2 text-zinc-700">{kw.keyword}</td>
                  <td className="px-4 py-2 text-zinc-600">{kw.category}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(kw.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(kw)}
                      className="text-red-600 hover:text-red-800 hover:underline"
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
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-zinc-500">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40">上一页</button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除"
        message={`确定要删除关键词「${deleteTarget?.keyword ?? ''}」吗？`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </div>
  );
}
