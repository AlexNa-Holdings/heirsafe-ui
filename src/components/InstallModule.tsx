// src/components/InstallModule.tsx
import { useMemo, useState } from "react";
import { ethers } from "ethers";
import Address from "./Address";

import { CHAINS } from "../config/chains";
import { validateSafeOnChain } from "../lib/safeValidation";

// ABIs from your repo
import { SafeABI } from "../abi/Safe";
import { HeirSafeModuleFactoryABI } from "../abi/HeirSafeModuleFactory";

type Props = {
  safeAddr: string;
  factoryAddr: string;
  predictedModule: string;
  readProvider: ethers.Provider;
  isDeployed: boolean;
  isEnabled: boolean;
  onChanged?: () => void | Promise<void>;
};

function short(n?: number | null) {
  if (n == null) return "";
  const c = CHAINS[n];
  return c ? c.name : `Chain ${n}`;
}

function isCallExceptionMissingData(e: any) {
  return e?.code === "CALL_EXCEPTION" && (e?.reason == null || e?.reason === "missing revert data");
}

/** Prevalidated signature for 1/1 Safe:
 *  bytes32(r=owner), bytes32(s=0), bytes1(v=0x01)
 */
function prevalidatedSigFor(owner: string) {
  const r = ethers.zeroPadValue(ethers.getAddress(owner), 32);
  return ethers.solidityPacked(["bytes32", "bytes32", "uint8"], [r, ethers.ZeroHash, 0x01]);
}

/** Merge user ABI with minimal fallback fragments in case execTransaction is missing. */
function makeSafeInterface() {
  const base: any[] = Array.isArray(SafeABI)
    ? SafeABI
    : (SafeABI as any)?.abi
    ? (SafeABI as any).abi
    : [];

  const needsExec =
    !base.some((f) => typeof f?.name === "string" && f.name === "execTransaction") &&
    !base.some((f) => typeof f === "string" && f.includes("execTransaction("));

  const needsEnable =
    !base.some((f) => typeof f?.name === "string" && f.name === "enableModule") &&
    !base.some((f) => typeof f === "string" && f.includes("enableModule("));

  const fallback: string[] = [];
  if (needsExec) {
    fallback.push(
      "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)"
    );
  }
  if (needsEnable) {
    fallback.push("function enableModule(address module)");
  }
  return new ethers.Interface([...base, ...fallback]);
}

export default function InstallModule({
  safeAddr,
  factoryAddr,
  predictedModule,
  readProvider,
  isDeployed,
  isEnabled,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<"deploy" | "enable" | null>(null);
  const [note, setNote] = useState<string>("");

  const chainIdLabel = useMemo(() => {
    // best-effort label for debugging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _p = readProvider as any;
    return short(_p?._network?.chainId ?? _p?.network?.chainId ?? null);
  }, [readProvider]);

  async function deploy() {
    try {
      setBusy("deploy");
      setNote("");
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();

      const factory = new ethers.Contract(factoryAddr, HeirSafeModuleFactoryABI, signer);

      // Try common create/deploy shapes
      let tx;
      try {
        factory.interface.getFunction("deployFor");
        tx = await factory.deployFor(safeAddr);
      } catch {
        try {
          factory.interface.getFunction("createFor");
          tx = await factory.createFor(safeAddr);
        } catch {
          try {
            factory.interface.getFunction("deploy");
            tx = await factory.deploy(safeAddr);
          } catch {
            throw new Error("Factory does not expose a known deploy method");
          }
        }
      }

      setNote("Deploying module…");
      await tx.wait();
      setNote("Module deployed");
      await onChanged?.();
    } catch (e: any) {
      console.error("[InstallModule] deploy error:", e);
      setNote(e?.reason || e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function enable() {
    try {
      setBusy("enable");
      setNote("");

      // Validate Safe and require threshold 1 for prevalidated signature path
      const v = await validateSafeOnChain(readProvider, safeAddr);
      if (!v.ok) throw new Error("Not a Safe on this network");
      if (v.threshold !== 1) {
        throw new Error("Enable requires threshold = 1 (use Safe UI for multisig).");
      }

      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No wallet detected");
      const bp = new ethers.BrowserProvider(eth);
      const signer = await bp.getSigner();
      const owner = await signer.getAddress();

      if (!v.owners.some((o) => o.toLowerCase() === owner.toLowerCase())) {
        throw new Error("Connect an owner wallet to enable the module.");
      }

      // Build Safe self-call: enableModule(predictedModule)
      const safeIface = makeSafeInterface();
      const dataEnable = safeIface.encodeFunctionData("enableModule", [predictedModule]);

      // execTransaction(to=this, data=enableModule(...), prevalidated signature)
      const to = safeAddr;
      const value = 0;
      const data = dataEnable;
      const operation = 0; // CALL
      const safeTxGas = 0;
      const baseGas = 0;
      const gasPrice = 0;
      const gasToken = ethers.ZeroAddress;
      const refundReceiver = ethers.ZeroAddress;
      const signatures = prevalidatedSigFor(owner);

      const execData = safeIface.encodeFunctionData("execTransaction", [
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signatures,
      ]);

      // Preflight: set from=owner so prevalidated signature path sees msg.sender == owner.
      try {
        await (signer.provider as ethers.Provider).call({
          to: safeAddr,
          data: execData,
          from: owner, // ← IMPORTANT: fixes GS025 on eth_call
        });
      } catch (err: any) {
        // Some RPCs (e.g., PulseChain) drop revert data; tolerate that specific quirk.
        if (!isCallExceptionMissingData(err)) {
          // If we *do* get a clear Safe code, surface a helpful note.
          const code = err?.reason || err?.revert?.args?.[0];
          if (code === "GS025") {
            throw new Error(
              "GS025: Prevalidated signature requires the sender to be the owner. " +
                "Make sure the connected wallet is this Safe owner on the current network."
            );
          }
          if (code === "GS026") {
            throw new Error(
              "GS026: Hash not approved by owner. If this persists, try using the Safe UI."
            );
          }
          throw err;
        }
      }

      setNote("Enabling module…");
      // Send raw tx so we don't depend on method wrappers
      const tx = await signer.sendTransaction({
        to: safeAddr,
        data: execData,
        value: 0,
      });

      await tx.wait();
      setNote("Module enabled");
      await onChanged?.();
    } catch (e: any) {
      console.error("[InstallModule] enable error:", e);
      setNote(e?.reason || e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 space-y-3">
      <div className="text-xs opacity-70">Factory:</div>
      <div className="text-xs -mt-1 mb-1">
        <Address addr={factoryAddr} />
      </div>

      <div className="text-xs opacity-70">Predicted module:</div>
      <div className="text-xs -mt-1 mb-2">
        <Address addr={predictedModule} />
      </div>

      <button
        className="w-full px-3 py-3 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60"
        onClick={isDeployed ? enable : deploy}
        disabled={busy !== null}
      >
        {busy
          ? "Working..."
          : isDeployed
          ? isEnabled
            ? "Module already enabled"
            : "Enable module in Safe"
          : "Deploy module instance"}
      </button>

      {/* Helper: open Safe UI (network label is best-effort) */}
      <div className="flex items-center gap-2">
        <a
          className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm inline-block"
          href={`https://app.safe.global/home?safe=eth:${safeAddr}`}
          target="_blank"
          rel="noreferrer"
        >
          Open Safe UI
        </a>
        <span className="text-xs opacity-60">(network: {chainIdLabel || "?"})</span>
      </div>

      {!!note && (
        <div className="text-xs px-2 py-1 rounded bg-neutral-900/60 border border-neutral-800">
          {note}
        </div>
      )}
    </div>
  );
}
