import { SystemConfigForm } from '@/components/admin/SystemConfigForm';

export default function AdminSystemConfigPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">系统配置</h1>
      <p className="mt-1 text-sm text-zinc-500">
        管理速率限制、输入长度等系统级参数
      </p>
      <div className="mt-6 max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
        <SystemConfigForm />
      </div>
    </div>
  );
}
