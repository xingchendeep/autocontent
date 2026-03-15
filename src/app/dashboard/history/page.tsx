import Link from 'next/link';
import HistoryItem from '@/components/dashboard/HistoryItem';
import { getSession } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { createSnippet } from '@/lib/snippets';
import type { HistorySummaryItem } from '@/types';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface HistoryData {
  items: HistorySummaryItem[];
  pagination: Pagination;
}

const LIMIT = 20;

async function fetchHistory(page: number): Promise<{ data: HistoryData | null; error: string | null }> {
  const session = await getSession();
  if (!session) {
    return { data: null, error: 'Authentication required' };
  }

  const from = (page - 1) * LIMIT;
  const to = page * LIMIT - 1;

  const db = await createSupabaseServerClient();
  const { data, count, error } = await db
    .from('generations')
    .select(
      'id, input_source, input_content, platforms, platform_count, status, model_name, duration_ms, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return { data: null, error: 'Failed to fetch history' };
  }

  const total = count ?? 0;
  const items: HistorySummaryItem[] = (data ?? []).map((row) => ({
    id: row.id as string,
    inputSource: row.input_source as 'manual' | 'extract',
    inputSnippet: createSnippet(row.input_content as string),
    platforms: row.platforms as string[],
    platformCount: row.platform_count as number,
    status: row.status as 'success' | 'partial' | 'failed',
    modelName: row.model_name as string | null,
    durationMs: row.duration_ms as number,
    createdAt: row.created_at as string,
  }));

  return {
    data: { items, pagination: { page, limit: LIMIT, total, hasMore: page * LIMIT < total } },
    error: null,
  };
}

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function HistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const { data, error } = await fetchHistory(page);

  if (error || !data) {
    throw new Error(error ?? 'Failed to load history');
  }

  const { items, pagination } = data;
  const totalPages = Math.max(1, Math.ceil(pagination.total / LIMIT));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">生成历史</h1>

      {items.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-6 py-10 text-center">
          <p className="mb-3 text-sm text-zinc-500">暂无生成记录</p>
          <Link href="/" className="text-sm font-medium text-zinc-900 underline underline-offset-2">
            前往首页开始生成
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <HistoryItem key={item.id} item={item} />
          ))}
        </div>
      )}

      {pagination.total > LIMIT && (
        <div className="mt-6 flex items-center justify-between text-sm text-zinc-500">
          <Link
            href={`/dashboard/history?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={page <= 1 ? 'pointer-events-none opacity-40' : 'hover:text-zinc-900'}
          >
            ← 上一页
          </Link>
          <span>{page} / {totalPages}</span>
          <Link
            href={`/dashboard/history?page=${page + 1}`}
            aria-disabled={!pagination.hasMore}
            className={!pagination.hasMore ? 'pointer-events-none opacity-40' : 'hover:text-zinc-900'}
          >
            下一页 →
          </Link>
        </div>
      )}
    </div>
  );
}
