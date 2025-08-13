// src/App.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ethers } from "ethers";
import "./index.css";

// UI
import InstallModule from "./components/InstallModule";
import AppHeader from "./components/AppHeader";
import AppFooter from "./components/AppFooter";
import ModuleIntro from "./components/ModuleIntro";
import StatusBar from "./components/StatusBar";
import Address from "./components/Address";
import OwnersView from "./components/OwnersView";

// Validation
import { validateSafeOnChain, type SafeValidationResult } from "./lib/safeValidation";

// Helpers & config
import { useSafeApp } from "./lib/safeApp";
import { CHAINS, getFactoryAddress } from "./config/chains";
import {
  predictModuleForSafe,
  isDeployed as codeExists,
  isModuleEnabled as checkEnabled,
} from "./lib/moduleInstall";

// ───────────────────────────────────────────────────────────────────────────────
// Env & RPC fallback
// ───────────────────────────────────────────────────────────────────────────────
const DEFAULT_SAFE = (import.meta.env.VITE_DEFAULT_SAFE || "").trim();
const LS_SAFE_KEY = "heirsafe:lastSafe";
const ENV_FALLBACK = (import.meta.env.VITE_FALLBACK_RPC || "").trim();
const DEFAULT_CHAIN_ID = 11155111; // Sepolia (for fallback public reads)

function pickFallbackRpc(defaultChainId: number): string | null {
  if (ENV_FALLBACK) return ENV_FALLBACK;
  const c = (CHAINS as any)?.[defaultChainId];
  if (!c) return null;

  if (c.rpcUrls?.default?.http?.length) return c.rpcUrls.default.http[0];
  if (c.rpcUrls?.public?.http?.length) return c.rpcUrls.public.http[0];

  if (Array.isArray(c.rpcUrls) && c.rpcUrls.length) return c.rpcUrls[0];
  if (typeof c.rpcUrls === "string" && c.rpcUrls) return c.rpcUrls;
  if (typeof c.rpcUrl === "string" && c.rpcUrl) return c.rpcUrl;
  if (typeof c.rpc === "string" && c.rpc) return c.rpc;

  return null;
}

const FALLBACK_RPC = pickFallbackRpc(DEFAULT_CHAIN_ID);

// ───────────────────────────────────────────────────────────────────────────────
// Network-change stability helpers
// ───────────────────────────────────────────────────────────────────────────────
function isNetworkChangedError(e: any) {
  return e?.code === "NETWORK_ERROR" && e?.event === "changed";
}

type SafeCheck =
  | { status: "idle" | "checking" }
  | { status: "ok"; owners: string[]; threshold: number; version?: string }
  | { status: "invalid"; label: string; help?: string };

export default function App() {
  // Stable “scope” guard to drop late async results after a chain switch.
  const scopeRef = useRef(0);
  const bumpScope = useCallback(() => ++scopeRef.current, []);
  const getScope = useCallback(() => scopeRef.current, []);

  // Safe App context (iframe)
  const { isSafeApp, safe, provider: safeEip1193 } = useSafeApp();

  // Injected wallet provider (EOA)
  const [injected, setInjected] = useState<ethers.BrowserProvider | null>(null);
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (eth) setInjected(new ethers.BrowserProvider(eth, "any")); // tolerate chain switching
  }, []);

  // Unified read provider: Safe iframe → injected → public fallback
  const readProvider = useMemo(() => {
    if (safeEip1193) return new ethers.BrowserProvider(safeEip1193 as any, "any");
    if (injected) return injected;
    return FALLBACK_RPC ? new ethers.JsonRpcProvider(FALLBACK_RPC) : null;
  }, [safeEip1193, injected]);

  // Track current chainId of readProvider
  const [chainId, setChainId] = useState<number | null>(null);
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      if (!readProvider) {
        setChainId(null);
        return;
      }
      const net = await (readProvider as any).getNetwork();
      setChainId(Number(net.chainId));

      // Listen to wallet chain changes (only when not inside Safe)
      const eth = (window as any).ethereum;
      if (eth && !safeEip1193) {
        const handler = (cidHex: string) => {
          try {
            const cid = parseInt(cidHex, 16);
            setChainId(cid);
            // Invalidate pending async work from the previous network
            bumpScope();
            // Clear derived state quickly to avoid stale UI
            setPredicted("");
            setDeployed(null);
            setEnabled(null);
            setStatus("Switched network");
            setSafeCheck({ status: "checking" });
          } catch {}
        };
        eth.on?.("chainChanged", handler);
        cleanup = () => eth.removeListener?.("chainChanged", handler);
      }
    })();
    return cleanup;
  }, [readProvider, safeEip1193, bumpScope]); // keep deps stable

  // Also clear on any chainId change (covers Safe iframe & fallback)
  useEffect(() => {
    if (chainId == null) return;
    bumpScope();
    setPredicted("");
    setDeployed(null);
    setEnabled(null);
    setStatus("Checking…");
    setSafeCheck({ status: "checking" });
  }, [chainId, bumpScope]);

  // Safe address (prefill from env / localStorage / Safe App)
  const [safeAddr, setSafeAddr] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_SAFE_KEY) || DEFAULT_SAFE || "";
    } catch {
      return DEFAULT_SAFE || "";
    }
  });

  // In Safe iframe: lock to current Safe and persist
  useEffect(() => {
    if (isSafeApp && safe?.safeAddress) {
      setSafeAddr(safe.safeAddress);
      try {
        localStorage.setItem(LS_SAFE_KEY, safe.safeAddress);
      } catch {}
    }
  }, [isSafeApp, safe]);

  // Persist last used safe (when not in Safe App)
  useEffect(() => {
    try {
      if (ethers.isAddress(safeAddr)) {
        localStorage.setItem(LS_SAFE_KEY, ethers.getAddress(safeAddr));
      }
    } catch {}
  }, [safeAddr]);

  // Factory for current chain
  const factoryFromChain = chainId != null ? getFactoryAddress(chainId) : undefined;
  const normalizedFactory =
    factoryFromChain && ethers.isAddress(factoryFromChain)
      ? ethers.getAddress(factoryFromChain)
      : null;
  const readyForChain = !!normalizedFactory;

  // Validation + module install state
  const [safeCheck, setSafeCheck] = useState<SafeCheck>({ status: "idle" });
  const [predicted, setPredicted] = useState<string>("");
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string>("");

  // Core refresh — scope-guarded against chain switches
  async function refreshInstallState() {
    const myScope = getScope();
    const ifCurrent =
      <T extends any[]>(fn: (...args: T) => void) =>
      (...args: T) => {
        if (getScope() === myScope) fn(...args);
      };

    try {
      if (!readProvider) throw new Error("No provider");

      // Address format first
      if (!ethers.isAddress(safeAddr)) {
        ifCurrent(setSafeCheck)({ status: "invalid", label: "Invalid address" });
        ifCurrent(setPredicted)("");
        ifCurrent(setDeployed)(null);
        ifCurrent(setEnabled)(null);
        ifCurrent(setStatus)("Enter a valid Safe address");
        return;
      }

      // Factory availability
      if (!normalizedFactory) {
        ifCurrent(setSafeCheck)({
          status: "invalid",
          label: "Factory not configured for this network",
        });
        ifCurrent(setPredicted)("");
        ifCurrent(setDeployed)(null);
        ifCurrent(setEnabled)(null);
        ifCurrent(setStatus)("Factory not configured for this network");
        return;
      }

      // 1) Validate Safe on current network
      ifCurrent(setSafeCheck)({ status: "checking" });
      const v: SafeValidationResult = await validateSafeOnChain(
        readProvider as any,
        safeAddr
      );
      if (getScope() !== myScope) return;

      if (!v.ok) {
        const label =
          v.reason === "invalid_address"
            ? "Invalid address"
            : v.reason === "no_code"
            ? "Address is not a contract on this network"
            : v.reason === "not_safe"
            ? "This address is not a Gnosis Safe on this network"
            : `Validation failed${v.detail ? ` · ${v.detail}` : ""}`;
        ifCurrent(setSafeCheck)({ status: "invalid", label, help: v.detail });
        ifCurrent(setPredicted)("");
        ifCurrent(setDeployed)(null);
        ifCurrent(setEnabled)(null);
        ifCurrent(setStatus)(label);
        return; // stop — do not show Deploy UI / predicted addr
      }

      ifCurrent(setSafeCheck)({
        status: "ok",
        owners: v.owners,
        threshold: v.threshold,
        version: v.version,
      });

      // 2) Ensure factory code exists
      const code = await (readProvider as any).getCode(normalizedFactory);
      if (getScope() !== myScope) return;
      if (!code || code === "0x")
        throw new Error("Factory not deployed on this network");

      // 3) Predict module addr and check deployed/enabled
      const saltHex =
        (import.meta.env.VITE_INSTALL_SALT as string) || "0x" + "00".repeat(32);
      if (!/^0x[0-9a-fA-F]{64}$/.test(saltHex)) {
        throw new Error("VITE_INSTALL_SALT must be 0x + 64 hex chars");
      }

      const addr = await predictModuleForSafe(
        readProvider as any,
        normalizedFactory,
        safeAddr,
        saltHex
      );
      if (getScope() !== myScope) return;
      ifCurrent(setPredicted)(addr);

      const hasCode = await codeExists(readProvider as any, addr);
      if (getScope() !== myScope) return;
      ifCurrent(setDeployed)(Boolean(hasCode));

      const en = hasCode
        ? await checkEnabled(readProvider as any, safeAddr, addr)
        : false;
      if (getScope() !== myScope) return;
      ifCurrent(setEnabled)(en);

      ifCurrent(setStatus)(
        en
          ? "Module installed"
          : hasCode
          ? "Module deployed, not enabled"
          : "Module not deployed"
      );
    } catch (e: any) {
      if (isNetworkChangedError(e)) return; // wallet switching noise
      if (getScope() !== myScope) return; // stale result

      setSafeCheck((s) =>
        s.status === "checking"
          ? { status: "invalid", label: "Validation failed", help: e?.message }
          : s
      );
      setPredicted("");
      setDeployed(null);
      setEnabled(null);
      setStatus(`Error: ${e?.message || String(e)}`);
      console.error("refreshInstallState error:", e);
    }
  }

  // Re-run validation whenever deps change (including chainId)
  useEffect(() => {
    if (!readProvider || !readyForChain) return;
    (async () => {
      await refreshInstallState();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAddr, readProvider, readyForChain, chainId]);

  const isInSafe = isSafeApp && !!safe?.safeAddress;

  return (
    <div className="relative min-h-screen text-neutral-100 bg-neutral-950">
      {/* Background: heart-on-shield */}
      <div className="hs-backdrop" aria-hidden="true">
        <img src="/logo-heirsafe.svg" alt="" className="hs-backdrop__logo" />
        <div className="hs-noise" />
      </div>

      <AppHeader safeAddr={safeAddr} />

      <main className="relative z-10 max-w-5xl mx-auto px-4 pt-6 pb-12 space-y-6">
        <ModuleIntro />

        {/* Configuration / prediction */}
        <section
          className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 space-y-3"
          aria-labelledby="install-title"
        >
          <h2 id="install-title" className="font-semibold">
            Module & Install
          </h2>

          {/* Safe address input (read-only in Safe iframe) */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 flex items-center gap-2">
              <input
                className={`w-full sm:max-w-xl px-3 py-2 rounded bg-neutral-800 ${
                  isInSafe ? "opacity-70 cursor-not-allowed" : ""
                }`}
                placeholder="0x… Safe address"
                value={safeAddr}
                onChange={(e) => setSafeAddr(e.target.value.trim())}
                readOnly={isInSafe}
                title={
                  isInSafe
                    ? "Using Safe selected in the Safe app"
                    : "Enter a Safe address"
                }
              />
              {isInSafe && (
                <span className="text-xs text-neutral-300 hidden sm:inline">
                  from Safe context
                </span>
              )}
            </div>
            <button
              className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
              onClick={() => {
                bumpScope(); // cancel any in-flight work
                refreshInstallState();
              }}
            >
              Refresh
            </button>
          </div>

          <div className="text-sm opacity-80 flex flex-wrap items-center gap-2">
            {chainId != null && CHAINS[chainId] ? (
              <span>Network: {CHAINS[chainId].name}</span>
            ) : (
              <span>Network: Unknown</span>
            )}
            {safeCheck.status === "ok" && (
              <span className="text-xs px-2 py-1 rounded bg-emerald-900/30 border border-emerald-800 text-emerald-200">
                Safe verified{safeCheck.version ? ` · v${safeCheck.version}` : ""} ·{" "}
                {safeCheck.owners.length} owner
                {safeCheck.owners.length !== 1 ? "s" : ""} · threshold{" "}
                {safeCheck.threshold}
              </span>
            )}
            {safeCheck.status === "checking" && (
              <span className="text-xs px-2 py-1 rounded bg-neutral-900/60 border border-neutral-700 text-neutral-200">
                Validating address…
              </span>
            )}
          </div>

          {safeCheck.status === "invalid" && (
            <div className="text-xs px-2 py-1 rounded bg-rose-900/30 border border-rose-800 text-rose-200 inline-block">
              {safeCheck.label}
              {safeCheck.help ? (
                <span className="opacity-80"> · {safeCheck.help}</span>
              ) : null}
            </div>
          )}

          {/* Install UI only if Safe is valid AND check finished AND not enabled */}
          {safeCheck.status === "ok" &&
            enabled === false &&               // ← precise false, not null
            deployed !== null &&               // ← wait until status known
            readProvider &&
            ethers.isAddress(safeAddr) &&
            normalizedFactory &&
            predicted && (
              <InstallModule
                safeAddr={safeAddr}
                factoryAddr={normalizedFactory!}
                predictedModule={predicted}
                readProvider={readProvider as any}
                isDeployed={Boolean(deployed)}
                isEnabled={Boolean(enabled)}
                onChanged={async () => {
                  // After a deploy/enable tx, re-check with a new scope
                  bumpScope();
                  await refreshInstallState();
                }}
              />
            )}

          {/* Only show predicted line after status is known to avoid flicker */}
          {safeCheck.status === "ok" && deployed !== null && predicted && (
            <div className="text-xs opacity-70 break-all flex items-center gap-2">
              <span>Predicted module:</span>
              <Address addr={predicted} />
            </div>
          )}

          {safeCheck.status !== "ok" && (
            <div className="text-sm text-neutral-400">
              Enter a valid Safe address on this network to deploy or manage the
              module.
            </div>
          )}
        </section>

        {/* Owners & Heirs — render only when Safe is validated */}
        {safeCheck.status === "ok" && (
          <OwnersView
            key={`${safeAddr}:${predicted}:${chainId ?? "x"}`}
            safeAddr={safeAddr}
            moduleAddr={predicted}
            readProvider={readProvider as any}
            enabled={Boolean(enabled)}
            chainId={chainId}
          />
        )}

        <StatusBar text={status} />
      </main>

      <AppFooter showAiCredit={true} />
    </div>
  );
}
