import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/auth/server';
import ScriptItem from '@/components/dashboard/ScriptItem';

interface ScriptRow {
  id: string;
  title: string;
  content: string;
  source: 'manual' | 'extract';
  source_url: string | null;
  created_at: string;
}

export default async function ScriptsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const db = await createSupabaseServerClient();
  let rows: ScriptRow[] = [];
  let hasError = false;

  try {
    const result = await db
      .from('saved_scripts')
      .select('id, title, content, source, source_url, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    rows = (result.data ?? []) as ScriptRow[];
    if (result.error) hasError = true;
  } catch {
    hasError = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">脚本库</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 返回生成页
        </Link>
      </div>

      {hasError && (
        <p className="text-sm text-red-500 mb-4">加载脚本列表失败，请刷新重试。</p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">
          暂无保存的脚本。生成内容后脚本会自动保存到这里，方便下次复用。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <ScriptItem
                title={row.title}
                content={row.content}
                source={row.source}
                sourceUrl={row.source_url}
                createdAt={row.created_at}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
