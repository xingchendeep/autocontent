'use client';

import { useEffect, useState } from 'react';

interface SummaryData {
  totalUsers: number;
  todayActiveUsers: number;
  totalGenerations: number;
  todayGenerations: number;
}

const CARDS = [
  { key: 'totalUsers', label: '总用户数', icon: '👥' },
  { key: 'todayActiveUsers', label: '今日活跃', icon: '🟢' },
  { key: 'totalGenerations', label: '总生成数', icon: '📝' },
  { key: 'todayGenerations', label: '今日生成', icon: '⚡' },
] as const;

export function AnalyticsSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/analytics/summary')
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span aria-hidden="true">{card.icon}</span>
            {card.label}
          </div>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {loading ? '—' : (data?.[card.key] ?? 0).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
