import { TemplateEditor } from '@/components/admin/TemplateEditor';

export default function AdminTemplatesPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900">系统模板管理</h1>
      <p className="mt-1 text-sm text-zinc-500">
        编辑各平台的 AI 生成提示词和参数
      </p>
      <div className="mt-6">
        <TemplateEditor />
      </div>
    </div>
  );
}
