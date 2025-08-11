export default function StatusBar({ text }: { text: string }) {
  if (!text) return null;

  const t = text.toLowerCase();

  // naive classification by message
  const variant = /error|revert|fail|denied/.test(t)
    ? "error"
    : /not deployed|not enabled|unknown/.test(t)
    ? "warn"
    : /installed|confirmed|enabled|success/.test(t)
    ? "success"
    : "info";

  const styles =
    variant === "error"
      ? {
          dot: "bg-rose-400",
          label: "bg-rose-500/10 text-rose-300",
          ring: "ring-rose-800/40",
        }
      : variant === "warn"
      ? {
          dot: "bg-amber-400",
          label: "bg-amber-500/10 text-amber-300",
          ring: "ring-amber-800/40",
        }
      : variant === "success"
      ? {
          dot: "bg-emerald-400",
          label: "bg-emerald-500/10 text-emerald-300",
          ring: "ring-emerald-800/40",
        }
      : {
          dot: "bg-sky-400",
          label: "bg-sky-500/10 text-sky-300",
          ring: "ring-sky-800/40",
        };

  return (
    <div
      className={`mt-2 rounded-xl px-3 py-2 text-sm flex items-center gap-3 bg-neutral-900/70 border border-neutral-800 ring-1 ${styles.ring}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${styles.label}`}>
        Status
      </span>
      <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
      <span className="text-neutral-200/90">{text}</span>
    </div>
  );
}
