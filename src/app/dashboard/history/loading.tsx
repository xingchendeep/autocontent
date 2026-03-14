export default function HistoryLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 h-6 w-24 animate-pulse rounded bg-zinc-200" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-2 flex justify-between">
              <div className="h-3 w-28 rounded bg-zinc-200" />
              <div className="h-3 w-12 rounded bg-zinc-100" />
            </div>
            <div className="mb-2 flex gap-1">
              <div className="h-4 w-14 rounded bg-zinc-100" />
              <div className="h-4 w-14 rounded bg-zinc-100" />
            </div>
            <div className="h-3 w-16 rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
