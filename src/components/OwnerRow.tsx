// src/components/OwnerRow.tsx
import Address from "./Address";
import Countdown from "./Countdown";
import { SyncBadge, AvailableBadge } from "./Badges";
import { fmtLocal, fmtUTC } from "../lib/time";

export type OwnerRowData = {
  owner: string;
  heir?: string | null;
  activationTs: bigint; // UTC seconds from chain
};

type Props = {
  row: OwnerRowData;
  nowSec: number;   // Math.floor(Date.now()/1000) from parent
  chainTs: number;  // last known chain timestamp from parent
  disabled?: boolean;

  /** Show the UTC line under the status (if your UI has a “Show UTC” toggle, pass it down) */
  showUTC?: boolean;

  /** Actions: wire these to your existing handlers in OwnersView */
  onSet?: (owner: string) => void | Promise<void>;
  onProlong?: (owner: string) => void | Promise<void>;
  onRemoveOwner?: (owner: string) => void | Promise<void>;

  /** Optional copy helper from parent (will fall back to navigator.clipboard) */
  onCopy?: (text: string, label: string) => void | Promise<void>;
};

function isAddr(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export default function OwnerRow({
  row,
  nowSec,
  chainTs,
  disabled = false,
  showUTC = false,
  onSet,
  onProlong,
  onRemoveOwner,
  onCopy,
}: Props) {
  const actSec = Number(row.activationTs || 0n);

  const isFutureLocal = actSec > 0 && nowSec < actSec;
  const isAvailable   = actSec > 0 && chainTs >= actSec;
  const showSync      = actSec > 0 && !isFutureLocal && !isAvailable;

  async function copy(text: string, label: string) {
    try {
      if (onCopy) await onCopy(text, label);
      else await navigator.clipboard.writeText(text);
    } catch {
      // no-op
    }
  }

  const hasConfig = isAddr(row.heir || "") || actSec > 0;

  return (
    <tr className="border-b border-neutral-800">
      {/* Owner */}
      <td className="py-3 pr-4 align-top">
        <div className="flex items-center gap-2">
          <Address addr={row.owner} short />
          <button
            className="text-xs opacity-70 hover:opacity-100 underline"
            onClick={() => copy(row.owner, "Owner address")}
            disabled={disabled}
            title="Copy"
          >
            Copy
          </button>
        </div>
      </td>

      {/* Beneficiary (heir) */}
      <td className="py-3 pr-4 align-top">
        {row.heir ? (
          <div className="inline-flex items-center gap-2">
            <Address addr={row.heir} short />
            <button
              className="text-xs opacity-70 hover:opacity-100 underline"
              onClick={() => copy(row.heir!, "Beneficiary address")}
              disabled={disabled}
              title="Copy"
            >
              Copy
            </button>
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>

      {/* Activation */}
      <td className="py-3 pr-4 align-top">
        {row.activationTs === 0n ? (
          <span className="text-neutral-400">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-sm">{fmtLocal(row.activationTs)}</span>
            {isFutureLocal && <Countdown ts={actSec} />}
            {showSync && <SyncBadge />}
            {isAvailable && <AvailableBadge />}
            {showUTC && (
              <div className="text-xs text-neutral-400">
                UTC: {fmtUTC(row.activationTs)}
              </div>
            )}
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 align-top">
        {!hasConfig ? (
          <div className="flex gap-2">
            <button
              className="px-3 py-1 text-sm rounded bg-emerald-800 hover:bg-emerald-700 disabled:opacity-60"
              onClick={() => onSet?.(row.owner)}
              disabled={disabled || !onSet}
              title="Set beneficiary and activation"
            >
              Set
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              className="px-3 py-1 text-sm rounded bg-sky-800 hover:bg-sky-700 disabled:opacity-60"
              onClick={() => onProlong?.(row.owner)}
              disabled={disabled || !onProlong}
              title="Prolong activation"
            >
              Prolong
            </button>
            <button
              className="px-3 py-1 text-sm rounded bg-rose-900/70 hover:bg-rose-800 disabled:opacity-60"
              onClick={() => onRemoveOwner?.(row.owner)}
              disabled={disabled || !onRemoveOwner}
              title="Remove owner"
            >
              Remove
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
