'use client';

const MAX_LENGTH = 100000;

interface ContentInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export default function ContentInput({
  value,
  onChange,
  disabled = false,
  error,
}: ContentInputProps) {
  const overLimit = value.length > MAX_LENGTH;
  const visibleError = error ?? (overLimit ? `内容超出最大长度 ${MAX_LENGTH} 字符` : undefined);

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={[
          'w-full min-h-[160px] resize-y rounded-lg border px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2',
          overLimit || visibleError
            ? 'border-red-500 focus:ring-red-300'
            : 'border-zinc-300 focus:ring-blue-300',
          disabled ? 'cursor-not-allowed bg-zinc-100 text-zinc-400' : 'bg-white text-zinc-900',
        ].join(' ')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="请粘贴您的视频脚本或描述内容…"
        aria-label="内容输入"
        aria-describedby={visibleError ? 'content-error' : undefined}
      />
      <div className="flex items-center justify-between text-xs">
        {visibleError ? (
          <span id="content-error" className="text-red-500" role="alert">
            {visibleError}
          </span>
        ) : (
          <span />
        )}
        <span className={overLimit ? 'text-red-500' : 'text-zinc-400'}>
          {value.length} / {MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
