'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface AuditLogItem {
  id: string;
  userEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function AuditLogTable() {
  const { toast } = useToast();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (actionFilter) params.set('action', actionFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    try {
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } catch {
      toast({ type: 'error', message: '加载审计日志失败' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, startDate, endDate, toast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="筛选 Action…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchLogs(); } }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" aria-label="开始日期" />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" aria-label="结束日期" />
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-zinc-500">
              <th className="px-4 py-2 font-medium">时间</th>
              <th className="px-4 py-2 font-medium">用户</th>
              <th className="px-4 py-2 font-medium">操作</th>
              <th className="px-4 py-2 font-medium">资源</th>
              <th className="px-4 py-2 font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">加载中…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">暂无数据</td></tr>
            ) : (
              items.map((log) => (
                <tr key={log.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-zinc-600">
                    {log.userEmail ?? 'System'}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {log.resourceType ? `${log.resourceType}/${log.resourceId ?? ''}` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {Object.keys(log.metadata).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        {expandedId === log.id ? '收起' : '展开'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded metadata */}
      {expandedId && (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">
            {JSON.stringify(
              items.find((i) => i.id === expandedId)?.metadata ?? {},
              null,
              2,
            )}
          </pre>
        </div>
      )}

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
        <span>共 {total} 条</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40">上一页</button>
          <span className="px-2 py-1">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  );
}
