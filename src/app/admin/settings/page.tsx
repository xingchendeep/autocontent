import { SiteSettingsForm } from '@/components/admin/SiteSettingsForm';

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">站点设置</h1>
      <p className="mt-1 text-sm text-zinc-500">
        管理站点标题、描述、Hero 区域等内容
      </p>
      <div className="mt-6 max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
        <SiteSettingsForm />
      </div>
    </div>
  );
}
