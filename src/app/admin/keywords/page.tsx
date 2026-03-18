import { KeywordManager } from '@/components/admin/KeywordManager';

export default function AdminKeywordsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">关键词管理</h1>
      <p className="mt-1 text-sm text-zinc-500">
        管理内容审核屏蔽关键词
      </p>
      <div className="mt-6">
        <KeywordManager />
      </div>
    </div>
  );
}
