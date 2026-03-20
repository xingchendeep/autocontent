'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface PlanItem {
  id: string;
  code: string;
  displayName: string;
  priceCents: number;
  currency: string;
  monthlyGenerationLimit: number | null;
  platformLimit: number | null;
  speedTier: string;
  hasHistory: boolean;
  hasApiAccess: boolean;
  hasTeamAccess: boolean;
  hasBatchAccess: boolean;
  isActive: boolean;
  features: string[];
  updatedAt: string;
}

const SPEED_TIERS = ['standard', 'fast', 'priority', 'dedicated'];
const SPEED_TIER_LABELS: Record<string, string> = {
  standard: '标准',
  fast: '快速',
  priority: '优先',
  dedicated: '专属',
};

export function PlanManager() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<PlanItem>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/plans');
      const json = await res.json();
      if (json.success) setPlans(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  function startEdit(plan: PlanItem) {
    setEditingId(plan.id);
    setForm({ ...plan });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({});
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/plans/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName,
          priceCents: form.priceCents,
          monthlyGenerationLimit: form.monthlyGenerationLimit,
          platformLimit: form.platformLimit,
          speedTier: form.speedTier,
          hasApiAccess: form.hasApiAccess,
          hasTeamAccess: form.hasTeamAccess,
          hasBatchAccess: form.hasBatchAccess,
          isActive: form.isActive,
          features: form.features,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: '套餐已更新' });
        setEditingId(null);
        fetchPlans();
      } else {
        toast({ type: 'error', message: json.error?.message ?? '更新失败' });
      }
    } finally {
      setSaving(false);
    }
  }

  function formatPrice(cents: number) {
    return cents === 0 ? '免费' : `¥${(cents / 100).toFixed(0)}/月`;
  }

  if (loading) return <p className="text-sm text-zinc-500">加载中...</p>;

  return (
    <div className="space-y-4">
      {plans.map((plan) => {
        const isEditing = editingId === plan.id;
        return (
          <div key={plan.id} className="rounded-lg border border-zinc-200 bg-white p-5">
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">套餐代码</label>
                    <input value={plan.code} disabled className="w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">显示名称</label>
                    <input
                      value={form.displayName ?? ''}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">价格（分）</label>
                    <input
                      type="number"
                      min={0}
                      value={form.priceCents ?? 0}
                      onChange={(e) => setForm({ ...form, priceCents: parseInt(e.target.value) || 0 })}
                      className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    />
                    <p className="mt-0.5 text-xs text-zinc-400">
                      = {formatPrice(form.priceCents ?? 0)}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">速度等级</label>
                    <select
                      value={form.speedTier ?? 'standard'}
                      onChange={(e) => setForm({ ...form, speedTier: e.target.value })}
                      className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    >
                      {SPEED_TIERS.map((t) => (
                        <option key={t} value={t}>{SPEED_TIER_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">月生成上限（空=无限）</label>
                    <input
                      type="number"
                      min={1}
                      value={form.monthlyGenerationLimit ?? ''}
                      onChange={(e) => setForm({ ...form, monthlyGenerationLimit: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="无限"
                      className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">平台数上限（空=无限）</label>
                    <input
                      type="number"
                      min={1}
                      value={form.platformLimit ?? ''}
                      onChange={(e) => setForm({ ...form, platformLimit: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="无限"
                      className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {[
                    { key: 'hasApiAccess' as const, label: 'API 访问' },
                    { key: 'hasTeamAccess' as const, label: '团队功能' },
                    { key: 'hasBatchAccess' as const, label: '批量处理' },
                    { key: 'isActive' as const, label: '启用' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={!!form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">自定义特性描述（每行一条，显示在前台定价卡片）</label>
                  <textarea
                    value={(form.features ?? []).join('\n')}
                    onChange={(e) => setForm({ ...form, features: e.target.value.split('\n').filter(Boolean) })}
                    placeholder="例如：&#10;专属客服支持&#10;优先处理队列&#10;自定义模板"
                    rows={4}
                    className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button onClick={cancelEdit} className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{plan.displayName}</span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">{plan.code}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${plan.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {plan.isActive ? '启用' : '停用'}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-zinc-500">
                    <span>{formatPrice(plan.priceCents)}</span>
                    <span>生成: {plan.monthlyGenerationLimit ?? '无限'}/月</span>
                    <span>平台: {plan.platformLimit ?? '全部'}</span>
                    <span>速度: {SPEED_TIER_LABELS[plan.speedTier] ?? plan.speedTier}</span>
                    {plan.hasApiAccess && <span>API ✓</span>}
                    {plan.hasTeamAccess && <span>团队 ✓</span>}
                    {plan.hasBatchAccess && <span>批量 ✓</span>}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(plan)}
                  className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  编辑
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
