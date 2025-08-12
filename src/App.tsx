// src/App.tsx
import { useEffect, useMemo, useState } from "react";
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

// ABIs & helpers
import { useSafeApp } from "./lib/safeApp";
import { CHAINS, getFactoryAddress } from "./config/chains";
import {
  predictModuleForSafe,
  isDeployed as codeExists,
  isModuleEnabled as checkEnabled,
} from "./lib/moduleInstall";

// env
const DEFAULT_SAFE = (import.meta.env.VITE_DEFAULT_SAFE || "").trim();
const LS_SAFE_KEY = "heirsafe:lastSafe";
const ENV_FALLBACK = (import.meta.env.VITE_FALLBACK_RPC || "").trim();

/** Robust RPC picker from CHAINS shape (+ env override). */
function pickFallbackRpc(defaultChainId: number): string | null {
  if (ENV_FALLBACK) return ENV_FALLBACK;

  const c = CHAINS?.[defaultChainId] as any;
  if (!c) return null;

  // viem-like shape
  if (c.rpcUrls?.default?.http?.length) return c.rpcUrls.default.http[0];
  if (c.rpcUrls?.public?.http?.length) return c.rpcUrls.public.http[0];

  // array or string variants
  if (Array.isArray(c.rpcUrls) && c.rpcUrls.length) return c.rpcUrls[0];
  if (typeof c.rpcUrls === "string" && c.rpcUrls) return c.rpcUrls;
  if (typeof c.rpcUrl === "string" && c.rpcUrl) return c.rpcUrl;
  if (typeof c.rpc === "string" && c.rpc) return c.rpc;

  return null;
}

export default function App() {
  // Safe App context (iframe)
  const { isSafeApp, safe, provider: safeEip1193 } = useSafeApp();

  // in-page providers: Safe App provider (iframe) or injected wallet (EOA)
  const [injected, setInjected] = useState<ethers.BrowserProvider | null>(null);
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (eth) setInjected(new ethers.BrowserProvider(eth));
  }, []);

  // pick a default chain for public read (use the one you host on)
  const DEFAULT_CHAIN_ID = 11155111; // Sepolia
  const FALLBACK_RPC = pickFallbackRpc(DEFAULT_CHAIN_ID);

  // a read provider for *reads only*
  const readProvider = useMemo(() => {
    if (safeEip1193) return new ethers.BrowserProvider(safeEip1193 as any);
    if (injected) return injected;
    return FALLBACK_RPC ? new ethers.JsonRpcProvider(FALLBACK_RPC) : null;
  }, [safeEip1193, injected]);

  // Safe address (prefill from env / localStorage / Safe App)
  const [safeAddr, setSafeAddr] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_SAFE_KEY) || DEFAULT_SAFE || "";
    } catch {
      return DEFAULT_SAFE || "";
    }
  });

  // keep Safe App safe address in sync (auto-fill + persist)
  useEffect(() => {
    if (isSafeApp && safe?.safeAddress) {
      setSafeAddr(safe.safeAddress);
      try {
        localStorage.setItem(LS_SAFE_KEY, safe.safeAddress);
      } catch {}
    }
  }, [isSafeApp, safe]);

  // persist last used safe (when not in Safe App too)
  useEffect(() => {
    try {
      if (ethers.isAddress(safeAddr)) {
        localStorage.setItem(LS_SAFE_KEY, ethers.getAddress(safeAddr));
      }
    } catch {}
  }, [safeAddr]);

  // network tracking
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

      // listen to wallet chain changes (only on injected providers)
      const eth = (window as any).ethereum;
      if (eth && !safeEip1193) {
        const handler = (cidHex: string) => {
          try {
            setChainId(parseInt(cidHex, 16));
          } catch {}
        };
        eth.on?.("chainChanged", handler);
        cleanup = () => eth.removeListener?.("chainChanged", handler);
      }
    })();
    return cleanup;
  }, [readProvider, safeEip1193]);

  // factory & readiness for this chain
  const factoryFromChain = chainId != null ? getFactoryAddress(chainId) : undefined;
  const normalizedFactory =
    factoryFromChain && ethers.isAddress(factoryFromChain)
      ? ethers.getAddress(factoryFromChain)
      : null;
  const readyForChain = !!normalizedFactory;

  // install state
  const [predicted, setPredicted] = useState<string>("");
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string>("");

  async function refreshInstallState() {
    try {
      if (!readProvider) throw new Error("No provider");
      if (!ethers.isAddress(safeAddr)) throw new Error("Enter a valid Safe address");
      if (!normalizedFactory) throw new Error("Factory not configured for this chain");

      const saltHex =
        (import.meta.env.VITE_INSTALL_SALT as string) || "0x" + "00".repeat(32);
      if (!/^0x[0-9a-fA-F]{64}$/.test(saltHex)) {
        throw new Error("VITE_INSTALL_SALT must be 0x + 64 hex chars");
      }

      // ensure the factory exists on this chain
      const code = await (readProvider as any).getCode(normalizedFactory);
      if (!code || code === "0x") throw new Error("Factory not deployed on this network");

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

  // initial refresh & whenever deps change
  useEffect(() => {
    if (!readProvider || !readyForChain) return;
    (async () => {
      await refreshInstallState();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAddr, readProvider, readyForChain]);

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
          <h2 id="install-title" className="font-semibold">Module & Install</h2>

          {/* Safe address control: auto-filled & read-only inside Safe */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 flex items-center gap-2">
              <input
                className={`w-full sm:max-w-xl px-3 py-2 rounded bg-neutral-800 ${isInSafe ? "opacity-70 cursor-not-allowed" : ""}`}
                placeholder="0x… Safe address"
                value={safeAddr}
                onChange={(e) => setSafeAddr(e.target.value.trim())}
                readOnly={isInSafe}
                title={isInSafe ? "Using Safe selected in the Safe app" : "Enter a Safe address"}
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
                refreshInstallState();
              }}
            >
              Refresh
            </button>
          </div>

          <div className="text-sm opacity-80">
            {chainId != null && CHAINS[chainId] ? (
              <span>Network: {CHAINS[chainId].name}</span>
            ) : (
              <span>Network: Unknown</span>
            )}
            {enabled === false ? (
              <span className="ml-2 text-amber-300">· Module deployed but not enabled</span>
            ) : null}
          </div>

          {!enabled &&
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
                  await refreshInstallState();
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

        {/* Owners table */}
        <OwnersView
          key={`${safeAddr}:${predicted}:${chainId ?? "x"}`}
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
