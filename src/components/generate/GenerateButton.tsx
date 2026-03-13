'use client';

interface GenerateButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}

export default function GenerateButton({ onClick, loading, disabled }: GenerateButtonProps) {
  const isDisabled = loading || disabled;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        aria-busy={loading}
        title={disabled && !loading ? '请至少选择一个平台' : undefined}
        className={[
          'flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-300',
          isDisabled
            ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        ].join(' ')}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
        {loading ? '生成中…' : '一键生成'}
      </button>
    </div>
  );
}
