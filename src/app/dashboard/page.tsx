import Link from 'next/link';
import UsageCard from '@/components/dashboard/UsageCard';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">控制台</h1>
        <Link
          href="/dashboard/history"
          className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
        >
          查看历史记录 →
        </Link>
      </div>

      {/* UsageCard loads independently — does not block the rest of the page */}
      <UsageCard />
    </div>
  );
}
