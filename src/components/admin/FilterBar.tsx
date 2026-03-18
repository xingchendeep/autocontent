'use client';

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function FilterBar({
  fields,
  values,
  onChange,
  onSearch,
}: {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSearch?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {fields.map((f) => {
        if (f.type === 'select') {
          return (
            <select
              key={f.key}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              aria-label={f.label}
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          );
        }
        if (f.type === 'date') {
          return (
            <input
              key={f.key}
              type="date"
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              aria-label={f.label}
            />
          );
        }
        return (
          <input
            key={f.key}
            type="text"
            placeholder={f.placeholder ?? f.label}
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && onSearch) onSearch(); }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        );
      })}
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
        >
          搜索
        </button>
      )}
    </div>
  );
}
