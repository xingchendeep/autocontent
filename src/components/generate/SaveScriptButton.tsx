'use client';

import { useState } from 'react';

interface SaveScriptButtonProps {
  content: string;
  source: 'manual' | 'extract';
  sourceUrl?: string;
  onSave: (title: string, content: string, source: 'manual' | 'extract', sourceUrl?: string) => Promise<boolean>;
  disabled?: boolean;
  saving?: boolean;
}

export default function SaveScriptButton({
  content,
  source,
  sourceUrl,
  onSave,
  disabled = false,
  saving = false,
}: SaveScriptButtonProps) {
  const [showInput, setShowInput] = useState(false);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(false);

  const canSave = content.trim().length > 0 && !disabled && !saving;

  async function handleSave() {
    if (!showInput) {
      // Auto-generate a default title from content
      const defaultTitle = content.trim().slice(0, 50).replace(/\n/g, ' ');
      setTitle(defaultTitle);
      setShowInput(true);
      return;
    }

    const finalTitle = title.trim() || content.trim().slice(0, 50);
    const ok = await onSave(finalTitle, content, source, sourceUrl);
    if (ok) {
      setSaved(true);
      setShowInput(false);
      setTitle('');
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (!canSave && !showInput) return null;

  return (
    <div className="flex items-center gap-2">
      {showInput && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入脚本标题..."
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          aria-label="脚本标题"
        />
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={[
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-300',
          saved
            ? 'bg-green-100 text-green-700'
            : saving
              ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
        ].join(' ')}
      >
        {saved ? '✅ 已保存' : saving ? '保存中...' : showInput ? '确认保存' : '💾 保存脚本'}
      </button>
      {showInput && (
        <button
          type="button"
          onClick={() => { setShowInput(false); setTitle(''); }}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          取消
        </button>
      )}
    </div>
  );
}
