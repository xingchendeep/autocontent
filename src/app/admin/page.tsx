import { AnalyticsSummary } from '@/components/admin/AnalyticsSummary';
import { AnalyticsCharts } from '@/components/admin/AnalyticsCharts';

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">运营概览</h1>
      <div className="mt-4">
        <AnalyticsSummary />
      </div>
      <AnalyticsCharts />
    </div>
  );
}
