'use client';

import { useState } from 'react';
import { useTemplates } from '@/hooks/useTemplates';
import { useTeamContext } from '@/contexts/TeamContext';
import { TemplateForm } from '@/components/dashboard/TemplateForm';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { UserTemplate, ToneValue, LengthValue } from '@/types';
import type { TemplateFormValues } from '@/lib/validations/template';

const TONE_LABELS: Record<ToneValue, string> = {
  professional: '专业',
  casual: '轻松',
  humorous: '幽默',
  authoritative: '权威',
  empathetic: '共情',
};

type ViewMode = 'list' | 'create' | 'edit';

export function TemplateManager() {
  const { currentTeamId } = useTeamContext();
  const { templates, loading, create, update, remove } = useTemplates(currentTeamId);
  const [view, setView] = useState<ViewMode>('list');
  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserTemplate | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  async function handleCreate(values: TemplateFormValues) {
    setFormLoading(true);
    const ok = await create(values);
    setFormLoading(false);
    if (ok) setView('list');
  }

  async function handleUpdate(values: TemplateFormValues) {
    if (!editingTemplate) return;
    setFormLoading(true);
    const ok = await update(editingTemplate.id, values);
    setFormLoading(false);
    if (ok) { setView('list'); setEditingTemplate(null); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  if (view === 'create') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h2 className="mb-6 text-lg font-semibold text-zinc-900">新建模板</h2>
        <TemplateForm onSubmit={handleCreate} onCancel={() => setView('list')} loading={formLoading} />
      </div>
    );
  }

  if (view === 'edit' && editingTemplate) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h2 className="mb-6 text-lg font-semibold text-zinc-900">编辑模板</h2>
        <TemplateForm
          initialValues={{
            name: editingTemplate.name,
            tone: editingTemplate.tone,
            length: editingTemplate.length,
            customInstructions: editingTemplate.customInstructions,
          }}
          onSubmit={handleUpdate}
          onCancel={() => { setView('list'); setEditingTemplate(null); }}
          loading={formLoading}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">我的模板</h1>
        <button
          type="button"
          onClick={() => setView('create')}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
        >
          新建模板
        </button>
      </div>

      {loading ? (
        <Skeleton rows={3} widths={['100%', '80%', '60%']} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="还没有模板"
          description="创建自定义模板，保持品牌风格一致"
          action={{ label: '创建第一个模板', onClick: () => setView('create') }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="mb-2 flex items-start justify-between">
                <h3 className="text-sm font-medium text-zinc-900">{t.name}</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingTemplate(t); setView('edit'); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    删除
                  </button>
                </div>
              </div>
              <div className="mb-2 flex gap-2 text-xs text-zinc-500">
                <span>语气：{TONE_LABELS[t.tone]}</span>
                <span>·</span>
                <span>长度：{t.length === 'short' ? '短' : t.length === 'medium' ? '中' : '长'}</span>
              </div>
              {t.customInstructions && (
                <p className="mb-2 text-xs text-zinc-400 line-clamp-2">
                  {t.customInstructions.slice(0, 80)}{t.customInstructions.length > 80 ? '…' : ''}
                </p>
              )}
              <p className="text-xs text-zinc-400">
                更新于 {new Date(t.updatedAt).toLocaleDateString('zh-CN')}
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除模板"
        message={`确定要删除模板「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </div>
  );
}
