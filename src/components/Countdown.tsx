// src/components/Countdown.tsx
import { AnimatePresence, motion } from "framer-motion";

type Props = { target: bigint; refSec: number };

/** Pure per-card rolling countdown. If time is up, renders nothing (parent decides sync/available). */
export default function Countdown({ target, refSec }: Props) {
  if (target === 0n) return null;

  let total = Math.floor(Number(target) - refSec);
  if (total <= 0) return null; // parent will show "Synchronizing…" or "Available"

  const days = Math.floor(total / 86400);
  total -= days * 86400;
  const hours = Math.floor(total / 3600);
  total -= hours * 3600;
  const mins = Math.floor(total / 60);
  total -= mins * 60;
  const secs = total; // 0..59

  const showDays = days > 0;
  const showHours = showDays || hours > 0; // hide 00h when <1h and no days
  const tone = "border-neutral-700 bg-neutral-800/70 text-neutral-200";

  return (
    <div
      className="flex items-center gap-1"
      title="Activation countdown"
      aria-live="polite"
      aria-label={`in ${days} days ${hours} hours ${mins} minutes ${secs} seconds`}
    >
      {showDays && <Unit value={days} pad={String(days).length} label="d" toneClass={tone} />}
      {showHours && <Unit value={hours} label="h" toneClass={tone} />}
      <Unit value={mins} label="m" toneClass={tone} />
      <Unit value={secs} label="s" toneClass={tone} />
    </div>
  );
}

/** One rolling card (e.g., “12”, “50”, “07”). Rolls UP for countdown. */
function Unit({
  value,
  pad = 2,
  label,
  toneClass,
}: {
  value: number;
  pad?: number;
  label: string;
  toneClass: string;
}) {
  const text = String(Math.max(0, value)).padStart(pad, "0");

  return (
    <div className="flex items-baseline">
      {/* positioned & clipped so exits don’t leak */}
      <div
        className={`relative overflow-hidden px-2 py-1 rounded-md border font-mono tabular-nums text-xs leading-none min-w-[2.25rem] h-6 flex items-center justify-center text-center ${toneClass}`}
        style={{ lineHeight: 1.1 }}
        aria-hidden="true"
      >
        <AnimatePresence initial={false}>
          <motion.span
            key={text} // new value ⇒ new element ⇒ triggers roll
            // ↓ Reverse direction: new value comes from BELOW, old rolls UP
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{
              y: "-100%",
              opacity: 0,
              position: "absolute",
              left: 0,
              right: 0,
            }}
            transition={{
              duration: 0.6, // slow & smooth
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-block"
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </span>
    </div>
  );
}
