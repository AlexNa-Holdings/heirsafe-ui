// src/components/OwnersView.tsx
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import Address from "./Address";
import { useSafeApp } from "../lib/safeApp";
import { HeirSafeModuleABI } from "../abi/HeirSafeModule";
import { getOwners, computePrevOwner } from "../lib/safeHelpers";
import Countdown from "./Countdown";

type Props = {
  safeAddr: string;
  moduleAddr: string;
  readProvider: ethers.Provider | null;
  enabled?: boolean;
  chainId?: number | null;
};

/** Tiny toast system (local to this component) */
type Toast = { id: number; kind: "success" | "error" | "info"; msg: string };
function useToasts() {
  const [list, setList] = useState<Toast[]>([]);
  function push(msg: string, kind: Toast["kind"] = "info", ttl = 4000) {
    const id = Date.now() + Math.random();
    setList((xs) => [...xs, { id, kind, msg }]);
    setTimeout(() => setList((xs) => xs.filter((t) => t.id !== id)), ttl);
  }
  return { toasts: list, push };
}

/** Owners & heirs table with timestamps (Local → Countdown / Syncing… / Available → UTC).
 *  Countdown uses local time only. After local time passes the activation, we poll the chain
 *  every 5s and switch to "Available" once a block timestamp ≥ activation.
 */
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

  // local clock tick (smooth countdown)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Latest chain timestamp we know (for switching to "Available" & enabling Claim)
  const [chainTs, setChainTs] = useState<number>(0);
  async function refreshChainTs() {
    try {
      if (!readProvider) return;
      const latest = await (readProvider as any).getBlock?.("latest");
      const ts = Number(latest?.timestamp || 0);
      if (Number.isFinite(ts) && ts > 0) setChainTs(ts);
    } catch {
      // ignore
    }
  }

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

  // Copy helpers
  const { toasts, push } = useToasts();
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      push(`${label} copied`, "success");
    } catch {
      push(`Can't copy ${label}`, "error");
    }
  }

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

    updateFromWallet();

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

      // 1) Owners
      const owners = await getOwners(readProvider as any, safeAddr);
      let base: Row[] = owners.map((o) => ({
        owner: o,
        beneficiary: ethers.ZeroAddress,
        ts: 0n,
      }));

      // 2) Module configs (only if module has code)
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
              return r;
            }
          })
        );
      }

      setRows(base);
    } catch (err) {
      console.error("[OwnersView] loadRows error:", err);
    }
  }

  // Initial load & when deps change (no block-driven reloads)
  useEffect(() => {
    loadRows();
  }, [safeAddr, moduleAddr, readProvider]);

  // Start/stop chain-time polling only when we need to “synchronize”
  const needsSync = useMemo(
    () =>
      rows.some(
        (r) =>
          r.ts !== 0n &&
          nowSec >= Number(r.ts) &&
          chainTs < Number(r.ts)
      ),
    [rows, nowSec, chainTs]
  );

  useEffect(() => {
    if (!readProvider) return;
    if (!needsSync) return;
    let stop = false;

    // quick kick + slow poll
    (async () => { await refreshChainTs(); })();
    const id = setInterval(() => { if (!stop) refreshChainTs(); }, 5000);

    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [needsSync, readProvider]);

  // UI pref: whether to show UTC line
  const [showUTC, setShowUTC] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("heirsafe:showUTC");
      return v == null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("heirsafe:showUTC", showUTC ? "1" : "0");
    } catch {}
  }, [showUTC]);

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
      push("Beneficiary set — awaiting confirmation…", "info");
      await tx.wait();
      push("Beneficiary set ✅", "success");
      setEditing(null);
      await loadRows();
    } catch (e: any) {
      push(e?.reason || e?.message || "Error setting beneficiary", "error");
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
      push("Activation time updated — awaiting confirmation…", "info");
      await tx.wait();
      push("Activation time updated ✅", "success");
      setEditing(null);
      await loadRows();
    } catch (e: any) {
      push(e?.reason || e?.message || "Error updating activation", "error");
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
      push("Removing beneficiary…", "info");
      await tx.wait();
      push("Beneficiary removed ✅", "success");
      await loadRows();
    } catch (e: any) {
      push(e?.reason || e?.message || "Error removing beneficiary", "error");
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

      // Preflight: revert early if would fail
      try {
        await mod.claimSafe.staticCall(owner, prev);
      } catch (e: any) {
        throw new Error(e?.reason || e?.message || "Claim would revert");
      }

      const tx = await mod.claimSafe(owner, prev);
      push("Claim submitted — awaiting confirmation…", "info");
      await tx.wait();
      push("Claim successful ✅", "success");
      await loadRows();
    } catch (e: any) {
      push(e?.reason || e?.message || "Error claiming Safe", "error");
    } finally {
      setBusyByOwner((m) => ({ ...m, [owner]: false }));
    }
  }

  const moduleInfo = useMemo(() => {
    const hasAddr = ethers.isAddress(moduleAddr);
    return { hasAddr, enabled: Boolean(enabled) };
  }, [moduleAddr, enabled]);

  return (
    <section
      className="relative rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 space-y-3"
      aria-labelledby="owners-title"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="owners-title" className="font-semibold">Owners & Heirs</h2>

        {/* UTC toggle */}
        <label className="flex items-center gap-2 text-xs opacity-80 select-none">
          <input
            type="checkbox"
            className="accent-neutral-400"
            checked={showUTC}
            onChange={(e) => setShowUTC(e.target.checked)}
          />
          Show UTC line
        </label>
      </div>

      {!moduleInfo.hasAddr && (
        <div className="text-sm text-amber-300">
          Predicted module address is empty — select a Safe and refresh.
        </div>
      )}

      {moduleInfo.hasAddr && enabled === false && (
        <div className="text-sm text-amber-300">
          Module is deployed but not enabled on this Safe. Actions are disabled.
        </div>
      )}

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

                const tsNum = Number(r.ts);
                const localFuture = nowSec < tsNum;
                const onChainReady = chainTs >= tsNum;

                const disableRowActions =
                  !canWriteGlobally || !isOwnerSigner || rowBusy;

                const disableClaim =
                  !canWriteGlobally || !signerIsBeneficiary || !onChainReady || rowBusy;

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
                            <button
                              type="button"
                              className="text-left text-xs opacity-80 hover:opacity-100 hover:underline underline-offset-2"
                              onClick={() => copy(fmtLocal(r.ts), "Local time")}
                            >
                              {fmtLocal(r.ts)}
                            </button>

                            {/* 2) Countdown (local) OR Synchronizing… OR Available */}
                            <div className="mt-1">
                              {localFuture ? (
                                <Countdown target={r.ts} refSec={nowSec} />
                              ) : onChainReady ? (
                                <AvailableBadge />
                              ) : (
                                <SyncBadge />
                              )}
                            </div>

                            {/* 3) UTC at the bottom (toggleable) */}
                            {showUTC && (
                              <button
                                type="button"
                                className="text-left text-[11px] opacity-70 mt-1 hover:opacity-100 hover:underline underline-offset-2"
                                onClick={() => copy(fmtUTC(r.ts), "UTC")}
                              >
                                <span className="opacity-60">UTC:</span>{" "}
                                {fmtUTC(r.ts)}
                              </button>
                            )}
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
                                  : !onChainReady
                                  ? "Waiting for network time"
                                  : undefined
                              }
                            >
                              {rowBusy ? "…" : onChainReady ? "Claim" : "Claim (not yet)"}
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

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "px-3 py-2 rounded-md shadow border text-sm",
              t.kind === "success" && "bg-emerald-900/30 border-emerald-700 text-emerald-200",
              t.kind === "error" && "bg-rose-900/30 border-rose-700 text-rose-200",
              t.kind === "info" && "bg-neutral-900/70 border-neutral-700 text-neutral-200",
            ].filter(Boolean).join(" ")}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Badges */

function SyncBadge() {
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

function AvailableBadge() {
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
