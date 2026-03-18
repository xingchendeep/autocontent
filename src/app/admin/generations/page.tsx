import { GenerationTable } from '@/components/admin/GenerationTable';

export default function AdminGenerationsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">生成记录</h1>
      <p className="mt-1 text-sm text-zinc-500">
        查看所有用户的 AI 生成记录
      </p>
      <div className="mt-6">
        <GenerationTable />
      </div>
    </div>
  );
}
