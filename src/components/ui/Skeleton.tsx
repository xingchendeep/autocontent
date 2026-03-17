export function Skeleton({
  rows = 3,
  widths,
}: {
  rows?: number;
  widths?: string[];
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-zinc-200"
          style={{ width: widths?.[i] ?? '100%' }}
        />
      ))}
    </div>
  );
}
