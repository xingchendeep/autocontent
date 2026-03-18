'use client';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render?: (item: T) => React.ReactNode;
}

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  loading,
  rowKey,
}: {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  rowKey: (item: T) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-zinc-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2 font-medium ${col.align === 'right' ? 'text-right' : ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-zinc-400">
                加载中…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-zinc-400">
                暂无数据
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={rowKey(item)} className="border-b border-zinc-50 hover:bg-zinc-50">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : ''} text-zinc-700`}
                  >
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
