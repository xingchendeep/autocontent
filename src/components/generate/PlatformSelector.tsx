'use client';

import { SUPPORTED_PLATFORMS, PLATFORM_TEMPLATES } from '@/lib/ai/templates';
import type { PlatformCode } from '@/types';

interface PlatformSelectorProps {
  selected: PlatformCode[];
  onChange: (selected: PlatformCode[]) => void;
  disabled?: boolean;
}

export default function PlatformSelector({
  selected,
  onChange,
  disabled = false,
}: PlatformSelectorProps) {
  const allSelected = selected.length === SUPPORTED_PLATFORMS.length;

  function toggle(platform: PlatformCode) {
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  }

  function toggleAll() {
    onChange(allSelected ? [] : [...SUPPORTED_PLATFORMS]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">选择目标平台</span>
        <button
          type="button"
          onClick={toggleAll}
          disabled={disabled}
          className="text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SUPPORTED_PLATFORMS.map((platform) => {
          const isSelected = selected.includes(platform);
          return (
            <button
              key={platform}
              type="button"
              data-platform={platform}
              onClick={() => toggle(platform)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={[
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-blue-300',
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
            >
              {PLATFORM_TEMPLATES[platform].displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
