import { useEffect, useState } from "react";

export default function ModuleIntro() {
  const LS_KEY = "heirsafe:intro:closed";
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) !== "1"; // open by default
    } catch {
      return true;
    }
  });

  // keep localStorage in sync when user toggles
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, open ? "0" : "1");
    } catch {}
  }, [open]);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-2xl bg-neutral-900/70 border border-neutral-800"
    >
      <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center justify-between">
        <span className="font-medium">What is the HeirSafe module?</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </summary>

      <div className="px-4 pb-4 text-sm text-neutral-200 space-y-3">
        <p>
          HeirSafe is a Safe <em>module</em> that lets each Safe owner define a{" "}
          <strong>beneficiary</strong> and an <strong>activation time</strong>.
          After the activation time passes, that beneficiary can{" "}
          <strong>claim</strong> and replace the owner’s address in the Safe.
        </p>

        <ul className="list-disc pl-5 space-y-1 text-neutral-300">
          <li>Works per owner: each owner manages their own heir &amp; time.</li>
          <li>No funds move. Only the owner address is replaced on claim.</li>
          <li>
            Threshold isn’t changed by the module; Safe’s policy stays intact.
          </li>
          <li>
            Owners can set, prolong, or remove their configuration anytime
            (until it’s claimed).
          </li>
          <li>
            The module must be <strong>enabled</strong> on the Safe. If the
            threshold is 1 and you’re an owner, this app can send the enable
            tx directly; otherwise follow the Safe UI instructions.
          </li>
        </ul>

        <p className="text-neutral-400">
          Tip: All times you enter are in your local timezone and stored
          on-chain as UTC seconds. The table shows Local, UTC, and a live
          countdown.
        </p>
      </div>
    </details>
  );
}
