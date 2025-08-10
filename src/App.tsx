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
import {
  predictModuleForSafe,
  isDeployed as codeExists,
  isModuleEnabled as checkEnabled,
} from "./lib/moduleInstall";

// env
const FACTORY = (import.meta.env.VITE_FACTORY || "").trim();
const DEFAULT_SAFE = (import.meta.env.VITE_DEFAULT_SAFE || "").trim();

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
  const [safeAddr, setSafeAddr] = useState<string>(DEFAULT_SAFE);

  // predicted module + state
  const [predicted, setPredicted] = useState<string>("");
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // owners list + status messages
  const [owners, setOwners] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");

  // owner actions (EOA)
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [activation, setActivation] = useState<string>("");

  // beneficiary claim
  const [ownerForClaim, setOwnerForClaim] = useState<string>("");

  // default Safe from Safe App context
  useEffect(() => {
    if (isSafeApp && safe?.safeAddress) setSafeAddr(safe.safeAddress);
  }, [isSafeApp, safe]);

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
    try {
      if (!ethers.isAddress(safeAddr))
        throw new Error("Enter a valid Safe address");
      if (!ethers.isAddress(FACTORY))
        throw new Error("Factory not set (VITE_FACTORY)");
      if (!readProvider)
        throw new Error("Connect a wallet or open inside Safe to continue");

      const saltHex =
        (import.meta.env.VITE_INSTALL_SALT as string) || "0x" + "00".repeat(32);
      if (!/^0x[0-9a-fA-F]{64}$/.test(saltHex)) {
        throw new Error("VITE_INSTALL_SALT must be 0x + 64 hex chars");
      }

      // make sure factory exists on this chain
      const code = await (readProvider as any).getCode(FACTORY);
      if (!code || code === "0x")
        throw new Error("Factory not deployed on this network");

      const addr = await predictModuleForSafe(
        readProvider as any,
        FACTORY,
        safeAddr,
        saltHex
      );
      setPredicted(addr);
      const hasCode = await codeExists(readProvider as any, addr);
      setDeployed(hasCode);
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
      setStatus(e?.message || String(e));
      console.error("refreshInstallState error:", e);
    }
  }

  useEffect(() => {
    (async () => {
      await refreshInstallState();
      await refreshOwners();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeAddr, readProvider]);

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
      setStatus(e?.reason || e?.message || String(e));
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
      setStatus(e?.reason || e?.message || String(e));
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
      setStatus(e?.reason || e?.message || String(e));
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">HeirSafe UI</h1>
          <NetworkSwitcher />
          <ConnectButton />
        </header>

        {/* Configuration */}
        <section className="p-4 rounded-2xl bg-neutral-900 space-y-3">
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
            <input
              className="px-3 py-2 rounded bg-neutral-800"
              value={FACTORY}
              readOnly
              placeholder="Factory address"
              title="Factory address (from env)"
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
            ethers.isAddress(FACTORY) &&
            predicted && (
              <InstallModule
                safeAddr={safeAddr}
                factoryAddr={FACTORY}
                predictedModule={predicted}
                readProvider={readProvider as any}
                /* NEW: pass state so InstallModule can flip Deploy → Enable */
                isDeployed={Boolean(deployed)}
                isEnabled={Boolean(enabled)}
                onChanged={async () => {
                  // after deploy/enable, re-evaluate state
                  await refreshInstallState();
                  await refreshOwners();
                }}
              />
            )}

          {predicted && (
            <div className="text-xs opacity-70 break-all">
              Predicted module: {predicted}
            </div>
          )}
        </section>

        {/* Owners + configs */}
        <OwnersView
          safeAddr={safeAddr}
          moduleAddr={predicted}
          readProvider={readProvider as any}
        />

        {/* Owner actions */}
        <section className="p-4 rounded-2xl bg-neutral-900 space-y-3">
          <h2 className="font-medium">Owner actions (EOA)</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="px-3 py-2 rounded bg-neutral-800"
              placeholder="Beneficiary address"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
            />
            <input
              className="px-3 py-2 rounded bg-neutral-800"
              placeholder="Activation unix time (s)"
              value={activation}
              onChange={(e) => setActivation(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600"
              onClick={doSetBeneficiary}
              disabled={!enabled || isSafeApp}
            >
              Set beneficiary
            </button>
            <button
              className="px-3 py-2 rounded bg-sky-700 hover:bg-sky-600"
              onClick={doSetTime}
              disabled={!enabled || isSafeApp}
            >
              Update time
            </button>
          </div>
          <p className="text-xs opacity-70">
            Call from the owner’s wallet (must be a Safe owner). In Safe App, tx
            buttons are disabled.
          </p>
        </section>

        {/* Beneficiary claim */}
        <section className="p-4 rounded-2xl bg-neutral-900 space-y-3">
          <h2 className="font-medium">Beneficiary claim</h2>
          <input
            className="px-3 py-2 rounded bg-neutral-800 w-full"
            placeholder="Owner to replace"
            value={ownerForClaim}
            onChange={(e) => setOwnerForClaim(e.target.value)}
          />
          <button
            className="px-3 py-2 rounded bg-rose-700 hover:bg-rose-600"
            onClick={doClaim}
            disabled={!enabled || isSafeApp}
          >
            Claim ownership
          </button>
          <p className="text-xs opacity-70">
            We auto-compute <code>prevOwner</code> from the Safe owner list.
          </p>
        </section>

        <div className="text-sm text-amber-200">{status}</div>
      </div>
    </div>
  );
}

/** Owners & heirs table */
function OwnersView({
  safeAddr,
  moduleAddr,
  readProvider,
}: {
  safeAddr: string;
  moduleAddr: string;
  readProvider: ethers.Provider | null;
}) {
  const [rows, setRows] = useState<
    Array<{ owner: string; beneficiary: string; ts: bigint }>
  >([]);

  useEffect(() => {
    (async () => {
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
            beneficiary: cfg.beneficiary as string,
            ts: BigInt(cfg.activationTime),
          };
        })
      );
      setRows(data);
    })();
  }, [safeAddr, moduleAddr, readProvider]);

  return (
    <section className="p-4 rounded-2xl bg-neutral-900 space-y-3">
      <h2 className="font-medium">Owners & heirs</h2>
      {!readProvider && (
        <p className="text-xs opacity-70">Connect a wallet to load owners.</p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left opacity-70">
            <tr>
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2 pr-4">Beneficiary</th>
              <th className="py-2">Activation (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.owner} className="border-t border-neutral-800">
                <td className="py-2 pr-4 break-all">{r.owner}</td>
                <td className="py-2 pr-4 break-all">
                  {r.beneficiary === ethers.ZeroAddress ? "—" : r.beneficiary}
                </td>
                <td className="py-2">
                  {r.ts === 0n
                    ? "—"
                    : new Date(Number(r.ts) * 1000).toISOString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
