import { headers } from 'next/headers';
import Link from 'next/link';
import HistoryItem from '@/components/dashboard/HistoryItem';
import type { ApiSuccess, ApiError, HistorySummaryItem } from '@/types';

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
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  const res = await fetch(
    `${protocol}://${host}/api/history?page=${page}&limit=${LIMIT}`,
    { cache: 'no-store' },
  );
  const json = (await res.json()) as ApiSuccess<HistoryData> | ApiError;
  if (json.success) return { data: json.data, error: null };
  return { data: null, error: json.error.message };
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
