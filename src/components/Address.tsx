import { useState } from "react";

export default function Address({
  addr,
  className = "",
  start = 6,           // show "0x1234" (0x + 4 hex)
  end = 4,             // show "5678"
  variant = "pill",    // "pill" (bg) or "ghost" (minimal)
}: {
  addr: string;
  className?: string;
  start?: number;
  end?: number;
  variant?: "pill" | "ghost";
}) {
  const [copied, setCopied] = useState(false);

  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    return <span className={className}>—</span>;
  }

  const short = (() => {
    const s = addr.trim();
    if (s.length <= start + end) return s;
    return `${s.slice(0, start)}…${s.slice(-end)}`;
  })();

  async function copy() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      /* ignore */
    }
  }

  const baseBtn =
    "inline-flex items-center gap-1 rounded px-2 py-1 text-xs break-all transition-colors";
  const styles =
    variant === "pill"
      ? "bg-neutral-800 hover:bg-neutral-700"
      : "hover:bg-neutral-800/40";

  // container is relative so the "(copied)" bubble can be absolutely positioned on top
  return (
    <span className={`relative inline-block ${className}`} title={addr}>
      <button
        type="button"
        onClick={copy}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && copy()}
        aria-label={`Copy ${addr}`}
        className={`${baseBtn} ${styles}`}
      >
        <span>{short}</span>
        <span className="opacity-70">⧉</span>
      </button>

      {/* Floating copied bubble (no layout shift) */}
      {copied && (
        <span
          className="
            pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2
            rounded bg-neutral-800 border border-neutral-700 px-2 py-1
            text-[11px] text-neutral-100 shadow-lg
          "
        >
          Copied
          <span
            className="
              absolute left-1/2 top-full -translate-x-1/2
              w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-neutral-800
            "
          />
        </span>
      )}
    </span>
  );
}
