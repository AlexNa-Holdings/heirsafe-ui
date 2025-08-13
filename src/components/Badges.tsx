export function SyncBadge() {
  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800/60 text-neutral-200 text-xs"
      title="Waiting for the network time to pass activation"
      aria-label="Synchronizing"
    >
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-400 opacity-30" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-neutral-300" />
      </span>
      Synchronizing…
    </div>
  );
}

export function AvailableBadge() {
  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-700 bg-emerald-900/20 text-emerald-300 text-xs"
      aria-label="Available"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Available
    </div>
  );
}
