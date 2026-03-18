'use client';

import { useEffect, useState } from 'react';

interface DailyTrend {
  date: string;
  count: number;
}

interface PlatformDist {
  platform: string;
  count: number;
  percentage: number;
}

interface SubDist {
  planCode: string;
  planName: string;
  count: number;
}

interface TopUser {
  userId: string;
  email: string;
  generationCount: number;
  planCode: string | null;
}

export function AnalyticsCharts() {
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [platforms, setPlatforms] = useState<PlatformDist[]>([]);
  const [subs, setSubs] = useState<SubDist[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/analytics/trends').then((r) => r.json()),
      fetch('/api/admin/analytics/platforms').then((r) => r.json()),
      fetch('/api/admin/analytics/subscriptions').then((r) => r.json()),
      fetch('/api/admin/analytics/top-users').then((r) => r.json()),
    ])
      .then(([t, p, s, u]) => {
        if (t.success) setTrends(t.data);
        if (p.success) setPlatforms(p.data);
        if (s.success) setSubs(s.data);
        if (u.success) setTopUsers(u.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxCount = Math.max(...trends.map((t) => t.count), 1);

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>;
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {/* Trends bar chart */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-medium text-zinc-700">过去 30 天生成趋势</h3>
        <div className="mt-3 flex items-end gap-px" style={{ height: 120 }}>
          {trends.slice(-30).map((t) => (
            <div
              key={t.date}
              className="flex-1 rounded-t bg-zinc-700 transition-all hover:bg-zinc-900"
              style={{
                height: `${(t.count / maxCount) * 100}%`,
                minHeight: t.count > 0 ? 2 : 0,
              }}
              title={`${t.date}: ${t.count}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-zinc-400">
          <span>{trends[0]?.date ?? ''}</span>
          <span>{trends[trends.length - 1]?.date ?? ''}</span>
        </div>
      </div>

      {/* Platform distribution */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-medium text-zinc-700">平台分布</h3>
        <div className="mt-3 space-y-2">
          {platforms.slice(0, 10).map((p) => (
            <div key={p.platform} className="flex items-center gap-2 text-sm">
              <span className="w-20 shrink-0 truncate text-zinc-600">
                {p.platform}
              </span>
              <div className="h-4 flex-1 rounded bg-zinc-100">
                <div
                  className="h-4 rounded bg-zinc-600"
                  style={{ width: `${p.percentage}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-zinc-500">
                {p.count} ({p.percentage}%)
              </span>
            </div>
          ))}
          {platforms.length === 0 && (
            <p className="text-sm text-zinc-400">暂无数据</p>
          )}
        </div>
      </div>

      {/* Top users */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-medium text-zinc-700">本月 Top 10 用户</h3>
        <div className="mt-3">
          {topUsers.length === 0 ? (
            <p className="text-sm text-zinc-400">暂无数据</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500">
                  <th className="pb-2 font-medium">邮箱</th>
                  <th className="pb-2 text-right font-medium">生成数</th>
                  <th className="pb-2 text-right font-medium">计划</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.userId} className="border-b border-zinc-50">
                    <td className="truncate py-1.5 text-zinc-700">{u.email}</td>
                    <td className="py-1.5 text-right text-zinc-600">
                      {u.generationCount}
                    </td>
                    <td className="py-1.5 text-right text-zinc-500">
                      {u.planCode ?? 'free'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Subscription distribution */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-medium text-zinc-700">订阅分布</h3>
        <div className="mt-3 space-y-2">
          {subs.length === 0 ? (
            <p className="text-sm text-zinc-400">暂无数据</p>
          ) : (
            subs.map((s) => (
              <div
                key={s.planCode}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-zinc-700">{s.planName}</span>
                <span className="text-zinc-500">{s.count} 人</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
