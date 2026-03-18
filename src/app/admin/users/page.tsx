import { UserTable } from '@/components/admin/UserTable';

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">用户管理</h1>
      <p className="mt-1 text-sm text-zinc-500">
        查看和管理所有用户的状态、角色和订阅
      </p>
      <div className="mt-6">
        <UserTable />
      </div>
    </div>
  );
}
