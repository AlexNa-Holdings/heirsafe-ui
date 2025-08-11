import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import "./index.css";

// UI
import { ConnectButton } from "./components/ConnectButton";
import InstallModule from "./components/InstallModule";

// ABIs & helpers
import { HeirSafeModuleABI } from "./abi/HeirSafeModule";
import { useSafeApp } from "./lib/safeApp";
import { getOwners, computePrevOwner } from "./lib/safeHelpers";
import NetworkSwitcher from "./components/NetworkSwitcher";
import { CHAINS, getFactoryAddress } from "./config/chains";
import Address from "./components/Address";
import AppHeader from "./components/AppHeader";
import AppFooter from "./components/AppFooter";
import ModuleIntro from "./components/ModuleIntro";
import BackgroundArt from "./components/BackgroundArt";
import StatusBar from "./components/StatusBar";

import {
  predictModuleForSafe,
  isDeployed as codeExists,
  isModuleEnabled as checkEnabled,
} from "./lib/moduleInstall";

// env
const DEFAULT_SAFE = (import.meta.env.VITE_DEFAULT_SAFE || "").trim();
const LS_SAFE_KEY = "heirsafe:lastSafe";

export default function App() {
  // Safe App context (iframe)
  const { isSafeApp, safe, provider: safeEip1193 } = useSafeApp();

  // build a read provider ONLY from in-page providers:
  // 1) Safe App provider (always available when embedded)
  // 2) injected wallet (after the user connects)
  const [injected, setInjected] = useState<ethers.BrowserProvider | null>(null);
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (eth) setInjected(new ethers.BrowserProvider(eth));
  }, []);
  const readProvider = useMemo(() => {
    if (safeEip1193) return new ethers.BrowserProvider(safeEip1193 as any);
    if (injected) return injected;
    return null; // no provider yet
  }, [safeEip1193, injected]);

  // Safe address (autofill if embedded)
  const [safeAddr, setSafeAddr] = useState<string>(() => {
    try {
      const fromLS = localStorage.getItem(LS_SAFE_KEY)?.trim() || "";
      return (fromLS || DEFAULT_SAFE).trim();
    } catch {
      return DEFAULT_SAFE;
    }
  });

  // predicted module + state
  const [predicted, setPredicted] = useState<string>("");
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // owners list + status messages
  const [owners, setOwners] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");

  // owner actions (EOA)
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [activation, setActivation] = useState<string>("");

  // beneficiary claim
  const [ownerForClaim, setOwnerForClaim] = useState<string>("");

  // derive chainId from the active readProvider
  useEffect(() => {
    (async () => {
      if (!readProvider) {
        setChainId(null);
        return;
      }
      const net = await (readProvider as any).getNetwork();
      setChainId(Number(net.chainId));
    })();
  }, [readProvider]);

  const factoryFromChain = chainId != null ? getFactoryAddress(chainId) : null;
  const normalizedFactory = factoryFromChain?.trim() || null; // 👈 add this
  const readyForChain = chainId !== null && !!normalizedFactory; // 👈 use this

  // default Safe from Safe App context
  useEffect(() => {
    if (isSafeApp && safe?.safeAddress) {
      setSafeAddr(safe.safeAddress);
      try {
        localStorage.setItem(LS_SAFE_KEY, safe.safeAddress);
      } catch {}
    }
  }, [isSafeApp, safe]);

  useEffect(() => {
    try {
      if (ethers.isAddress(safeAddr)) {
        localStorage.setItem(LS_SAFE_KEY, safeAddr);
      }
    } catch {}
  }, [safeAddr]);

  async function refreshOwners() {
    if (!ethers.isAddress(safeAddr) || !readProvider) {
      setOwners([]);
      return;
    }
    const list = await getOwners(readProvider as any, safeAddr);
    setOwners(list);
  }

  async function refreshInstallState() {
    setStatus("Checking module…");
    if (!ethers.isAddress(safeAddr))
      throw new Error("Enter a valid Safe address");
    if (!readProvider)
      throw new Error("Connect a wallet or open inside Safe to continue");
    if (chainId == null) throw new Error("Unknown network");
    if (!normalizedFactory || !ethers.isAddress(normalizedFactory)) {
      throw new Error(`Factory not configured for chain ${chainId}`);
    }
    try {
      if (!ethers.isAddress(safeAddr))
        throw new Error("Enter a valid Safe address");
      if (!readProvider)
        throw new Error("Connect a wallet or open inside Safe to continue");

      const saltHex =
        (import.meta.env.VITE_INSTALL_SALT as string) || "0x" + "00".repeat(32);
      if (!/^0x[0-9a-fA-F]{64}$/.test(saltHex)) {
        throw new Error("VITE_INSTALL_SALT must be 0x + 64 hex chars");
      }

      // ensure the factory exists on this chain
      const code = await (readProvider as any).getCode(normalizedFactory);
      if (!code || code === "0x")
        throw new Error("Factory not deployed on this network");

      const addr = await predictModuleForSafe(
        readProvider as any,
        normalizedFactory,
        safeAddr,
        saltHex
      );
      setPredicted(addr);
      const hasCode = await codeExists(readProvider as any, addr);
      setDeployed(Boolean(hasCode));
      const en = hasCode
        ? await checkEnabled(readProvider as any, safeAddr, addr)
        : false;
      setEnabled(en);
      setStatus(
        en
          ? "Module installed"
          : hasCode
          ? "Module deployed, not enabled"
          : "Module not deployed"
      );
    } catch (e: any) {
      setPredicted("");
      setDeployed(null);
      setEnabled(null);
      setStatus(`Error: ${e?.message || String(e)}`);
      console.error("refreshInstallState error:", e);
    }
  }

  useEffect(() => {
    if (!readProvider || !readyForChain) return;
    (async () => {
      await refreshInstallState();
      await refreshOwners();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAddr, readProvider, readyForChain]);

  // ---------------- owner actions (sign with injected wallet; disabled in Safe App) ----------------
  async function doSetBeneficiary() {
    try {
      if (!ethers.isAddress(predicted)) throw new Error("Module not ready");
      if (isSafeApp)
        throw new Error("Open standalone site to sign with wallet");
      if (!ethers.isAddress(beneficiary))
        throw new Error("Invalid beneficiary");
      const ts = Number(activation);
      if (!ts || ts <= Math.floor(Date.now() / 1000))
        throw new Error("Activation must be a future unix timestamp");

      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      const mod = new ethers.Contract(predicted, HeirSafeModuleABI, signer);
      const tx = await mod.setBeneficiary(beneficiary, ts);
      setStatus("setBeneficiary sent…");
      await tx.wait();
      setStatus("setBeneficiary confirmed");
    } catch (e: any) {
      setStatus(`Error: ${e?.reason || e?.message || String(e)}`);
    }
  }

  async function doSetTime() {
    try {
      if (!ethers.isAddress(predicted)) throw new Error("Module not ready");
      if (isSafeApp)
        throw new Error("Open standalone site to sign with wallet");
      const ts = Number(activation);
      if (!ts || ts <= Math.floor(Date.now() / 1000))
        throw new Error("Activation must be a future unix timestamp");

      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      const mod = new ethers.Contract(predicted, HeirSafeModuleABI, signer);
      const tx = await mod.setActivationTime(ts);
      setStatus("setActivationTime sent…");
      await tx.wait();
      setStatus("setActivationTime confirmed");
    } catch (e: any) {
      setStatus(`Error: ${e?.reason || e?.message || String(e)}`);
    }
  }

  async function doClaim() {
    try {
      if (!ethers.isAddress(predicted)) throw new Error("Module not ready");
      if (isSafeApp)
        throw new Error("Open standalone site to sign with wallet");
      if (!ethers.isAddress(ownerForClaim))
        throw new Error("Invalid owner address");

      const prev = await computePrevOwner(
        readProvider as any,
        safeAddr,
        ownerForClaim
      );
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      const mod = new ethers.Contract(predicted, HeirSafeModuleABI, signer);
      const tx = await mod.claimSafe(ownerForClaim, prev);
      setStatus("claimSafe sent…");
      await tx.wait();
      setStatus("claimSafe confirmed");
      await refreshOwners();
    } catch (e: any) {
      setStatus(`Error: ${e?.reason || e?.message || String(e)}`);
    }
  }

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100">
      {/* Background: heart-on-shield */}
      <div className="hs-backdrop" aria-hidden="true">
        <img src="/logo-heirsafe.svg" alt="" className="hs-backdrop__logo" />
        <div className="hs-noise" />
      </div>
      <main className="relative z-10 max-w-5xl mx-auto p-6 space-y-6">
        <AppHeader safeAddr={safeAddr} />
        <ModuleIntro />

        {/* Configuration */}
        <section className="p-5 rounded-2xl bg-neutral-900/70 border border-neutral-800 space-y-3">
          <h2 className="font-medium">Configuration</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="px-3 py-2 rounded bg-neutral-800"
              placeholder="Safe address"
              value={safeAddr}
              onChange={(e) =>
                setSafeAddr(e.target.value.trim().replace(/\s+/g, ""))
              }
            />
          </div>
          {!readProvider && (
            <p className="text-xs opacity-70">
              Connect a wallet (or open this app inside your Safe) to load
              on-chain data.
            </p>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={async () => {
                await refreshInstallState();
                await refreshOwners();
              }}
              className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
            >
              Refresh
            </button>
            {enabled ? (
              <span className="text-emerald-300 text-sm">
                Module installed ✅
              </span>
            ) : deployed === false ? (
              <span className="text-amber-300 text-sm">
                Module not deployed
              </span>
            ) : enabled === false ? (
              <span className="text-amber-300 text-sm">
                Module deployed but not enabled
              </span>
            ) : null}
          </div>

          {!enabled &&
            readProvider &&
            ethers.isAddress(safeAddr) &&
            normalizedFactory &&
            predicted && (
              <InstallModule
                safeAddr={safeAddr}
                factoryAddr={normalizedFactory!} // non-null because of the guard above
                predictedModule={predicted}
                readProvider={readProvider as any}
                isDeployed={Boolean(deployed)}
                isEnabled={Boolean(enabled)}
                onChanged={async () => {
                  await refreshInstallState();
                  await refreshOwners();
                }}
              />
            )}

          {predicted && (
            <div className="text-xs opacity-70 break-all flex items-center gap-2">
              <span>Predicted module:</span>
              <Address addr={predicted} />
            </div>
          )}
        </section>

        <OwnersView
          safeAddr={safeAddr}
          moduleAddr={predicted}
          readProvider={readProvider as any}
          enabled={Boolean(enabled)}
          chainId={chainId}
        />

        <StatusBar text={status} />
      </main>
      <AppFooter showAiCredit={true} />
    </div>
  );
}

/** Owners & heirs table with inline editor and local datetime picker */
function OwnersView({
  safeAddr,
  moduleAddr,
  readProvider,
  enabled,
  chainId,
}: {
  safeAddr: string;
  moduleAddr: string;
  readProvider: ethers.Provider | null;
  enabled?: boolean;
  chainId: number | null;
}) {
  const { isSafeApp } = useSafeApp();

  type Row = { owner: string; beneficiary: string; ts: bigint };
  const [rows, setRows] = useState<Row[]>([]);
  const [signerAddr, setSignerAddr] = useState<string>("");
  const [busyByOwner, setBusyByOwner] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<null | {
    mode: "set" | "prolong";
    owner: string;
    beneficiary: string; // only used for "set"
    dtLocal: string; // YYYY-MM-DDTHH:mm
  }>(null);
  const [nowSec, setNowSec] = useState<number>(Math.floor(Date.now() / 1000));

  // Helpers
  const fmtUTC = (ts: bigint) =>
    ts === 0n ? "—" : new Date(Number(ts) * 1000).toISOString();
  const fmtLocal = (ts: bigint) =>
    ts === 0n ? "—" : new Date(Number(ts) * 1000).toLocaleString();
  const toLocalInputValue = (ts: bigint) => {
    if (ts === 0n) return "";
    const d = new Date(Number(ts) * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const localInputToUtcSeconds = (v: string) => {
    // v like "2025-08-20T14:30" (local time). JS Date treats it as local.
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) throw new Error("Enter a valid date & time.");
    return Math.floor(ms / 1000);
  };

  // tick every second so countdown updates live
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // signer
  useEffect(() => {
    (async () => {
      try {
        const eth = (window as any).ethereum;
        if (!eth) return setSignerAddr("");
        const bp = new ethers.BrowserProvider(eth);
        const s = await bp.getSigner().catch(() => null);
        setSignerAddr(s ? await s.getAddress() : "");
      } catch {
        setSignerAddr("");
      }
    })();
  }, []);

  // load rows
  async function loadRows() {
    if (
      !readProvider ||
      !ethers.isAddress(safeAddr) ||
      !ethers.isAddress(moduleAddr)
    ) {
      setRows([]);
      return;
    }
    const owners = await getOwners(readProvider as any, safeAddr);
    const mod = new ethers.Contract(
      moduleAddr,
      HeirSafeModuleABI,
      readProvider as any
    );
    const data = await Promise.all(
      owners.map(async (o) => {
        const cfg = await mod.heirConfigs(o);
        return {
          owner: o,
          beneficiary: (cfg.beneficiary as string) || ethers.ZeroAddress,
          ts: BigInt(cfg.activationTime),
        };
      })
    );
    setRows(data);
  }
  useEffect(() => {
    loadRows();
    const t = setInterval(loadRows, 30000);
    return () => clearInterval(t);
  }, [safeAddr, moduleAddr, readProvider]);

  const canWriteGlobally =
    !!readProvider &&
    ethers.isAddress(moduleAddr) &&
    (enabled ?? true) &&
    !isSafeApp;

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

      if (!ethers.isAddress(beneficiary))
        throw new Error("Invalid beneficiary");
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

  // helper to build "in 2d 3h 4m 5s" or "ready (since 1d 2h 3m)"
  function fmtCountdown(ts: bigint): { label: string; isFuture: boolean } {
    if (ts === 0n) return { label: "—", isFuture: true };
    const target = Number(ts);
    const diff = target - nowSec; // seconds
    const future = diff > 0;
    let d = Math.abs(diff);

    const days = Math.floor(d / 86400);
    d -= days * 86400;
    const hours = Math.floor(d / 3600);
    d -= hours * 3600;
    const mins = Math.floor(d / 60);
    d -= mins * 60;
    const secs = d;

    const parts = [
      days ? `${days}d` : null,
      hours ? `${hours}h` : null,
      mins ? `${mins}m` : null,
      `${secs}s`,
    ]
      .filter(Boolean)
      .join(" ");

    return future
      ? { label: `in ${parts}`, isFuture: true }
      : { label: `ready (since ${parts})`, isFuture: false };
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
      const tx = await mod.setBeneficiary(ethers.ZeroAddress, 0);
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

  return (
    <section className="p-4 rounded-2xl bg-neutral-900 space-y-3">
      <h2 className="font-medium">Owners & heirs</h2>
      {!readProvider && (
        <p className="text-xs opacity-70">
          {chainId == null
            ? "Network: unknown"
            : CHAINS[chainId]
            ? `Network: ${CHAINS[chainId].name}`
            : `Network ${chainId} not supported`}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-neutral-300">
            <tr className="border-t border-neutral-800/70">
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2 pr-4">Beneficiary</th>
              <th className="py-2 pr-4">Activation</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowBusy = !!busyByOwner[r.owner];
              const nowSec = BigInt(Math.floor(Date.now() / 1000));

              const isOwnerSigner =
                signerAddr &&
                signerAddr.toLowerCase() === r.owner.toLowerCase();

              const signerIsBeneficiary =
                signerAddr &&
                r.beneficiary !== ethers.ZeroAddress &&
                signerAddr.toLowerCase() === r.beneficiary.toLowerCase();

              const claimReady = r.ts !== 0n && nowSec >= r.ts;

              const disableRowActions =
                !canWriteGlobally || !isOwnerSigner || rowBusy;

              const disableClaim =
                !canWriteGlobally ||
                !signerIsBeneficiary ||
                !claimReady ||
                rowBusy;

              const showSet = r.beneficiary === ethers.ZeroAddress;
              const showProlong = r.beneficiary !== ethers.ZeroAddress;
              const showRemove = r.beneficiary !== ethers.ZeroAddress;

              const isEditingRow = editing && editing.owner === r.owner;

              return (
                <>
                  <tr
                    key={r.owner}
                    className="border-t border-neutral-800 align-top"
                  >
                    <td className="py-2 pr-4 break-all">
                      <Address addr={r.owner} />
                    </td>
                    <td className="py-2 pr-4 break-all">
                      <Address addr={r.beneficiary} />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col">
                        <span className="text-neutral-200">
                          {fmtLocal(r.ts)}
                        </span>
                        <span className="text-xs opacity-70">
                          UTC: {fmtUTC(r.ts)}
                        </span>
                        {r.ts !== 0n && (
                          <span
                            className={`text-xs mt-1 ${
                              fmtCountdown(r.ts).isFuture
                                ? "text-neutral-300"
                                : "text-emerald-300"
                            }`}
                          >
                            {fmtCountdown(r.ts).label}
                          </span>
                        )}
                      </div>
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
                                : !claimReady
                                ? `Activation at ${fmtUTC(r.ts)}`
                                : undefined
                            }
                          >
                            {rowBusy
                              ? "…"
                              : claimReady
                              ? "Claim"
                              : "Claim (not yet)"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isEditingRow && (
                    <tr className="border-t border-neutral-800">
                      <td colSpan={4} className="py-3">
                        <div className="flex flex-wrap gap-3 items-end">
                          {editing.mode === "set" && (
                            <div className="flex flex-col gap-1">
                              <label className="text-xs opacity-70">
                                Beneficiary
                              </label>
                              <input
                                className="px-3 py-2 rounded bg-neutral-800 min-w-[24rem]"
                                placeholder="0x… beneficiary"
                                value={editing.beneficiary}
                                onChange={(e) =>
                                  setEditing(
                                    (st) =>
                                      st && {
                                        ...st,
                                        beneficiary: e.target.value,
                                      }
                                  )
                                }
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70">
                              Activation (local)
                            </label>
                            <input
                              type="datetime-local"
                              className="px-3 py-2 rounded bg-neutral-800"
                              value={editing.dtLocal}
                              onChange={(e) =>
                                setEditing(
                                  (st) =>
                                    st && { ...st, dtLocal: e.target.value }
                                )
                              }
                            />
                          </div>
                          <div className="flex gap-2">
                            {editing.mode === "set" ? (
                              <button
                                className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                                onClick={() =>
                                  doSet(
                                    editing.owner,
                                    editing.beneficiary,
                                    editing.dtLocal
                                  )
                                }
                                disabled={
                                  !canWriteGlobally ||
                                  !signerAddr ||
                                  signerAddr.toLowerCase() !==
                                    editing.owner.toLowerCase() ||
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
                                onClick={() =>
                                  doProlong(editing.owner, editing.dtLocal)
                                }
                                disabled={
                                  !canWriteGlobally ||
                                  !signerAddr ||
                                  signerAddr.toLowerCase() !==
                                    editing.owner.toLowerCase() ||
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
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
