// src/components/OwnersView.tsx
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import Address from "./Address";
import { useSafeApp } from "../lib/safeApp";
import { HeirSafeModuleABI } from "../abi/HeirSafeModule";
import { getOwners, computePrevOwner } from "../lib/safeHelpers";

type Props = {
  safeAddr: string;
  moduleAddr: string;
  readProvider: ethers.Provider | null;
  enabled?: boolean;
  chainId?: number | null;
};

/** Small, pretty countdown chips (units outside, no 00h when <1h). If past -> “Available”. */
function Countdown({
  target,
  refSec,
}: {
  target: bigint;
  refSec: number;
}) {
  if (target === 0n) return null;

  const diff = Number(target) - refSec;
  const future = diff > 0;

  // Past -> show "Available" badge instead of ticking
  if (!future) {
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

  // Future -> show countdown
  let d = diff;
  const days = Math.floor(d / 86400);
  d -= days * 86400;
  const hours = Math.floor(d / 3600);
  d -= hours * 3600;
  const mins = Math.floor(d / 60);
  d -= mins * 60;
  const secs = d;

  const showDays = days > 0;
  const showHours = showDays || hours > 0; // hide 00h if <1h and no days

  const box =
    "px-2 py-1 rounded-md border font-mono tabular-nums text-xs leading-none";
  const tone = "border-neutral-700 bg-neutral-800/70 text-neutral-200";

  const Unit = ({
    value,
    label,
    pad = 2,
  }: {
    value: number | string;
    label: string;
    pad?: number;
  }) => (
    <div className="flex items-baseline">
      <div className={`${box} ${tone}`}>{String(value).padStart(pad, "0")}</div>
      <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </span>
    </div>
  );

  return (
    <div
      className="flex items-center gap-1"
      title="Activation countdown"
      aria-live="polite"
      aria-label={`in ${days} days ${hours} hours ${mins} minutes ${secs} seconds`}
    >
      {showDays && <Unit value={days} label="d" pad={1} />}
      {showHours && <Unit value={hours} label="h" />}
      <Unit value={mins} label="m" />
      <Unit value={secs} label="s" />
    </div>
  );
}

/** Owners & heirs table with timestamps (Local → Countdown/Available → UTC) */
export default function OwnersView({
  safeAddr,
  moduleAddr,
  readProvider,
  enabled,
}: Props) {
  const { isSafeApp } = useSafeApp();

  type Row = { owner: string; beneficiary: string; ts: bigint };
  const [rows, setRows] = useState<Row[]>([]);
  const [signerAddr, setSignerAddr] = useState<string>("");
  const [busyByOwner, setBusyByOwner] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<null | {
    mode: "set" | "prolong";
    owner: string;
    beneficiary: string; // only for "set"
    dtLocal: string; // YYYY-MM-DDTHH:mm
  }>(null);

  // ticks every second so the UI re-renders and countdown updates
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // keep small offset = (chain latest block time) - (local time)
  const [chainOffset, setChainOffset] = useState(0);
  useEffect(() => {
    if (!readProvider) return;
    let stop = false;

    const refreshOffset = async () => {
      try {
        const latest = await (readProvider as any).getBlock("latest");
        const chainTs = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));
        const localTs = Math.floor(Date.now() / 1000);
        if (!stop) setChainOffset(chainTs - localTs);
      } catch {
        // ignore; try again later
      }
    };

    refreshOffset();
    const id1 = setInterval(refreshOffset, 30000);
    return () => {
      stop = true;
      clearInterval(id1);
    };
  }, [readProvider]);

  // Helpers
  const fmtUTC = (ts: bigint) =>
    ts === 0n ? "—" : new Date(Number(ts) * 1000).toISOString();

  const fmtLocal = (ts: bigint) => {
    if (ts === 0n) return "—";
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }).format(new Date(Number(ts) * 1000));
    } catch {
      const d = new Date(Number(ts) * 1000);
      return d.toLocaleString();
    }
  };

  const toLocalInputValue = (ts: bigint) => {
    if (ts === 0n) return "";
    const d = new Date(Number(ts) * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  };

  const localInputToUtcSeconds = (v: string) => {
    const ms = Date.parse(v); // local time parsed as local
    if (!Number.isFinite(ms)) throw new Error("Enter a valid date & time.");
    return Math.floor(ms / 1000);
  };

  // Capture connected EOA (for actions) + react to wallet events
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) {
      setSignerAddr("");
      return;
    }

    let cancelled = false;

    const updateFromWallet = async () => {
      try {
        const bp = new ethers.BrowserProvider(eth);
        const s = await bp.getSigner().catch(() => null);
        const addr = s ? await s.getAddress() : "";
        if (!cancelled) setSignerAddr(addr);
      } catch {
        if (!cancelled) setSignerAddr("");
      }
    };

    // initial read
    updateFromWallet();

    // react to account / chain changes
    const onAccountsChanged = (_accs: string[]) => updateFromWallet();
    const onChainChanged = (_chainId: string) => updateFromWallet();

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);

    return () => {
      cancelled = true;
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  // Load rows — owners first, enrich with module configs if code exists
  async function loadRows() {
    try {
      if (!readProvider || !ethers.isAddress(safeAddr)) {
        setRows([]);
        return;
      }

      // 1) Always fetch owners first
      const owners = await getOwners(readProvider as any, safeAddr);
      let base: Row[] = owners.map((o) => ({
        owner: o,
        beneficiary: ethers.ZeroAddress,
        ts: 0n,
      }));

      // 2) Only attempt heirConfigs if module address has code
      let hasModuleCode = false;
      if (ethers.isAddress(moduleAddr)) {
        const code = await (readProvider as any).getCode(moduleAddr);
        hasModuleCode = !!code && code !== "0x";
      }

      if (hasModuleCode) {
        const mod = new ethers.Contract(
          moduleAddr,
          HeirSafeModuleABI,
          readProvider as any
        );
        base = await Promise.all(
          base.map(async (r) => {
            try {
              const cfg = await mod.heirConfigs(r.owner);
              return {
                owner: r.owner,
                beneficiary: (cfg.beneficiary as string) || ethers.ZeroAddress,
                ts: BigInt(cfg.activationTime),
              };
            } catch (e) {
              console.debug("heirConfigs failed for", r.owner, e);
              return r; // keep owner row even if this call fails
            }
          })
        );
      }

      setRows(base);
    } catch (err) {
      console.error("[OwnersView] loadRows error:", err);
      // Keep last good rows if something transient fails
    }
  }

  // Fire load on mount and when deps change, plus poll every 30s
  useEffect(() => {
    loadRows();
    const t = setInterval(loadRows, 30000);
    return () => clearInterval(t);
  }, [safeAddr, moduleAddr, readProvider]);

  const canWriteGlobally =
    !!readProvider && ethers.isAddress(moduleAddr) && (enabled ?? true) && !isSafeApp;

  // Actions
  async function doSet(owner: string, beneficiary: string, whenLocal: string) {
    try {
      setBusyByOwner((m) => ({ ...m, [owner]: true }));
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase())
        throw new Error(`Connect as owner ${owner}`);
      if (!ethers.isAddress(beneficiary)) throw new Error("Invalid beneficiary");

      const ts = localInputToUtcSeconds(whenLocal);
      if (ts <= Math.floor(Date.now() / 1000))
        throw new Error("Activation must be in the future");

      const mod = new ethers.Contract(moduleAddr, HeirSafeModuleABI, signer);
      const tx = await mod.setBeneficiary(beneficiary, ts);
      await tx.wait();
      setEditing(null);
      await loadRows();
    } catch (e: any) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setBusyByOwner((m) => ({ ...m, [owner]: false }));
    }
  }

  async function doProlong(owner: string, whenLocal: string) {
    try {
      setBusyByOwner((m) => ({ ...m, [owner]: true }));
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase())
        throw new Error(`Connect as owner ${owner}`);

      const ts = localInputToUtcSeconds(whenLocal);
      if (ts <= Math.floor(Date.now() / 1000))
        throw new Error("Activation must be in the future");

      const mod = new ethers.Contract(moduleAddr, HeirSafeModuleABI, signer);
      const tx = await mod.setActivationTime(ts);
      await tx.wait();
      setEditing(null);
      await loadRows();
    } catch (e: any) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setBusyByOwner((m) => ({ ...m, [owner]: false }));
    }
  }

  async function doRemove(owner: string) {
    try {
      if (!confirm("Remove beneficiary and activation time?")) return;
      setBusyByOwner((m) => ({ ...m, [owner]: true }));
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase())
        throw new Error(`Connect as owner ${owner}`);

      const mod = new ethers.Contract(moduleAddr, HeirSafeModuleABI, signer);

      // Prefer new removeBeneficiary(), fallback to setBeneficiary(0,0)
      let tx;
      try {
        mod.interface.getFunction("removeBeneficiary");
        tx = await mod.removeBeneficiary();
      } catch {
        tx = await mod.setBeneficiary(ethers.ZeroAddress, 0);
      }
      await tx.wait();
      await loadRows();
    } catch (e: any) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setBusyByOwner((m) => ({ ...m, [owner]: false }));
    }
  }

  async function doClaim(owner: string) {
    try {
      setBusyByOwner((m) => ({ ...m, [owner]: true }));
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();

      const prev = await computePrevOwner(readProvider as any, safeAddr, owner);
      const mod = new ethers.Contract(moduleAddr, HeirSafeModuleABI, signer);
      const tx = await mod.claimSafe(owner, prev);
      await tx.wait();
      await loadRows();
    } catch (e: any) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setBusyByOwner((m) => ({ ...m, [owner]: false }));
    }
  }

  const refSec = nowSec + chainOffset;

  return (
    <section
      className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 space-y-3"
      aria-labelledby="owners-title"
    >
      <h2 id="owners-title" className="font-semibold">Owners & Heirs</h2>

      <div className="overflow-x-auto -mx-2 md:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-neutral-300">
            <tr className="border-b border-neutral-800">
              <th className="text-left font-medium py-2 pr-4">Owner</th>
              <th className="text-left font-medium py-2 pr-4">Beneficiary</th>
              <th className="text-left font-medium py-2 pr-4">Activation</th>
              <th className="text-left font-medium py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-neutral-400">
                  {ethers.isAddress(safeAddr)
                    ? "Loading owners…"
                    : "Enter a valid Safe address to load owners."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const rowBusy = !!busyByOwner[r.owner?.toLowerCase?.() ?? r.owner];

                const isOwnerSigner =
                  signerAddr &&
                  signerAddr.toLowerCase() === r.owner.toLowerCase();

                const signerIsBeneficiary =
                  signerAddr &&
                  r.beneficiary !== ethers.ZeroAddress &&
                  signerAddr.toLowerCase() === r.beneficiary.toLowerCase();

                const cdFuture = Number(r.ts) > refSec;

                const disableRowActions =
                  !canWriteGlobally || !isOwnerSigner || rowBusy;

                const disableClaim =
                  !canWriteGlobally || !signerIsBeneficiary || cdFuture || rowBusy;

                const showSet = r.beneficiary === ethers.ZeroAddress;
                const showProlong = r.beneficiary !== ethers.ZeroAddress;
                const showRemove = r.beneficiary !== ethers.ZeroAddress;

                const isEditingRow = editing && editing.owner === r.owner;

                return (
                  <>
                    <tr key={r.owner} className="border-t border-neutral-800 align-top">
                      <td className="py-2 pr-4 break-all">
                        <Address addr={r.owner} variant="ghost" />
                      </td>
                      <td className="py-2 pr-4 break-all">
                        <Address addr={r.beneficiary} />
                      </td>
                      <td className="py-2 pr-4">
                        {r.ts !== 0n && (
                          <div className="flex flex-col" title={fmtUTC(r.ts)}>
                            {/* 1) Local first */}
                            <div className="text-xs opacity-80">
                              {fmtLocal(r.ts)}
                            </div>

                            {/* 2) Countdown or Available */}
                            <div className="mt-1">
                              <Countdown target={r.ts} refSec={refSec} />
                            </div>

                            {/* 3) UTC at the bottom */}
                            <div className="text-[11px] opacity-70 mt-1">
                              <span className="opacity-60">UTC:</span>{" "}
                              {fmtUTC(r.ts)}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {showSet && (
                            <button
                              className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                              onClick={() =>
                                setEditing({
                                  mode: "set",
                                  owner: r.owner,
                                  beneficiary: "",
                                  dtLocal: "",
                                })
                              }
                              disabled={disableRowActions}
                              title={
                                !enabled
                                  ? "Module must be enabled"
                                  : isSafeApp
                                  ? "Disabled in Safe App"
                                  : !isOwnerSigner
                                  ? "Connect the owner’s wallet"
                                  : undefined
                              }
                            >
                              {rowBusy ? "…" : "Set"}
                            </button>
                          )}
                          {showProlong && (
                            <button
                              className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50"
                              onClick={() =>
                                setEditing({
                                  mode: "prolong",
                                  owner: r.owner,
                                  beneficiary: r.beneficiary,
                                  dtLocal: toLocalInputValue(r.ts) || "",
                                })
                              }
                              disabled={disableRowActions}
                            >
                              {rowBusy ? "…" : "Prolong"}
                            </button>
                          )}
                          {showRemove && (
                            <button
                              className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-50"
                              onClick={() => doRemove(r.owner)}
                              disabled={disableRowActions}
                            >
                              {rowBusy ? "…" : "Remove"}
                            </button>
                          )}
                          {signerIsBeneficiary && (
                            <button
                              className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50"
                              onClick={() => doClaim(r.owner)}
                              disabled={disableClaim}
                              title={
                                !enabled
                                  ? "Module must be enabled"
                                  : isSafeApp
                                  ? "Disabled in Safe App"
                                  : cdFuture
                                  ? `Activation at ${fmtUTC(r.ts)}`
                                  : undefined
                              }
                            >
                              {rowBusy ? "…" : cdFuture ? "Claim (not yet)" : "Claim"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isEditingRow && (
                      <tr key={`${r.owner}:edit`} className="border-t border-neutral-800">
                        <td colSpan={4} className="py-3">
                          <div className="flex flex-wrap gap-3 items-end">
                            {editing.mode === "set" && (
                              <div className="flex flex-col gap-1">
                                <label className="text-xs opacity-70">Beneficiary</label>
                                <input
                                  className="px-3 py-2 rounded bg-neutral-800 min-w-[24rem]"
                                  placeholder="0x… beneficiary"
                                  value={editing.beneficiary}
                                  onChange={(e) =>
                                    setEditing((st) => st && { ...st, beneficiary: e.target.value })
                                  }
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-1">
                              <label className="text-xs opacity-70">Activation (local)</label>
                              <input
                                type="datetime-local"
                                className="px-3 py-2 rounded bg-neutral-800"
                                value={editing.dtLocal}
                                onChange={(e) =>
                                  setEditing((st) => st && { ...st, dtLocal: e.target.value })
                                }
                              />
                            </div>
                            <div className="flex gap-2">
                              {editing.mode === "set" ? (
                                <button
                                  className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                                  onClick={() =>
                                    doSet(editing.owner, editing.beneficiary, editing.dtLocal)
                                  }
                                  disabled={
                                    !canWriteGlobally ||
                                    !signerAddr ||
                                    signerAddr.toLowerCase() !== editing.owner.toLowerCase() ||
                                    !editing.dtLocal ||
                                    (editing.mode === "set" &&
                                      !ethers.isAddress(editing.beneficiary))
                                  }
                                >
                                  Save
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-2 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50"
                                  onClick={() => doProlong(editing.owner, editing.dtLocal)}
                                  disabled={
                                    !canWriteGlobally ||
                                    !signerAddr ||
                                    signerAddr.toLowerCase() !== editing.owner.toLowerCase() ||
                                    !editing.dtLocal
                                  }
                                >
                                  Save
                                </button>
                              )}
                              <button
                                className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
                                onClick={() => setEditing(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
