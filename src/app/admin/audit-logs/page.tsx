import { AuditLogTable } from '@/components/admin/AuditLogTable';

export default function AdminAuditLogsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">审计日志</h1>
      <p className="mt-1 text-sm text-zinc-500">
        查看所有管理操作的审计记录
      </p>
      <div className="mt-6">
        <AuditLogTable />
      </div>
    </div>
  );
}
