'use client';

import { useState } from 'react';
import type { ApiKeyItem } from '@/lib/api-keys';

interface NewKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  createdAt: string;
}

export default function ApiKeysPanel({ initialKeys }: { initialKeys: ApiKeyItem[] }) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<NewKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? '创建失败');
        return;
      }
      const created: NewKey = json.data;
      setRevealed(created);
      setKeys((prev) => [
        { id: created.id, name: created.name, prefix: created.prefix, createdAt: created.createdAt, lastUsedAt: null },
        ...prev,
      ]);
      setNewKeyName('');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('确认撤销该 API Key？此操作不可恢复。')) return;
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? '撤销失败');
        return;
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (revealed?.id === id) setRevealed(null);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="Key 名称（如：生产环境）"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          maxLength={100}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <button
          type="submit"
          disabled={creating || !newKeyName.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {creating ? '创建中…' : '创建 Key'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Newly created key reveal */}
      {revealed && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4">
          <p className="mb-1 text-sm font-medium text-green-800">Key 已创建，请立即复制保存，之后将无法再次查看：</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs font-mono text-green-900 border border-green-200">
              {revealed.key}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(revealed.key)}
              className="shrink-0 rounded border border-green-300 bg-white px-3 py-1 text-xs text-green-800 hover:bg-green-100"
            >
              复制
            </button>
          </div>
          <button
            onClick={() => setRevealed(null)}
            className="mt-2 text-xs text-green-700 underline"
          >
            我已保存，关闭
          </button>
        </div>
      )}

      {/* Keys list */}
      {keys.length === 0 ? (
        <p className="text-sm text-zinc-400">暂无 API Key，创建一个开始使用。</p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{k.name}</p>
                <p className="text-xs text-zinc-400">
                  前缀：<code className="font-mono">{k.prefix}…</code>
                  {' · '}
                  创建于 {new Date(k.createdAt).toLocaleDateString('zh-CN')}
                  {k.lastUsedAt && (
                    <> · 最近使用 {new Date(k.lastUsedAt).toLocaleDateString('zh-CN')}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                disabled={revokingId === k.id}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {revokingId === k.id ? '撤销中…' : '撤销'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
