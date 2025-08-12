import { useState } from "react";
import { ethers } from "ethers";
import { useSafeApp } from "../lib/safeApp";
import Address from "./Address";
import { HeirSafeModuleFactoryABI } from "../abi/HeirSafeModuleFactory";

type Props = {
  safeAddr: string;
  factoryAddr: string;
  predictedModule: string;
  readProvider: ethers.Provider;
  isDeployed: boolean;
  isEnabled: boolean;
  onChanged?: () => Promise<void> | void;
};

const SafeABI = [
  "function getThreshold() view returns (uint256)",
  "function isOwner(address) view returns (bool)",
  "function getNonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns (bool)",
];

export default function InstallModule({
  safeAddr,
  factoryAddr,
  predictedModule,
  readProvider,
  isDeployed,
  isEnabled,
  onChanged,
}: Props) {
  const { isSafeApp, sdk } = useSafeApp();
  const [busy, setBusy] = useState(false);
  const [instructions, setInstructions] = useState<string>("");

  const saltHex =
    (import.meta.env.VITE_INSTALL_SALT as string) || "0x" + "00".repeat(32);

  // --------- helpers ---------

  async function getChainPrefix(): Promise<string> {
    try {
      const net = await readProvider.getNetwork();
      const id = Number(net.chainId);
      // minimal mapping (extend as you add chains)
      if (id === 1) return "eth:";
      if (id === 11155111) return "sep:";
      return `${id}:`;
    } catch {
      return "";
    }
  }

  async function openSafe() {
    const pref = await getChainPrefix();
    const url = `https://app.safe.global/home?safe=${pref}${safeAddr}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function readThreshold(): Promise<number> {
    const safe = new ethers.Contract(safeAddr, SafeABI, readProvider as any);
    const t = await safe.getThreshold();
    return Number(t);
  }

  async function signerAndIsOwner(): Promise<{
    signer: ethers.Signer;
    signerAddr: string;
    isOwner: boolean;
  }> {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("No wallet detected");
    const bp = new ethers.BrowserProvider(eth);
    const signer = await bp.getSigner();
    const signerAddr = await signer.getAddress();
    const safe = new ethers.Contract(safeAddr, SafeABI, readProvider as any);
    const yes = await safe.isOwner(signerAddr);
    return { signer, signerAddr, isOwner: yes };
  }

  // --------- SAFE APP (iframe) ---------

  async function installInsideSafe() {
    if (!sdk) return;
    setBusy(true);
    try {
      // Encode the correct factory function from your ABI
      const iface = new ethers.Interface(HeirSafeModuleFactoryABI);
      let data: string;
      try {
        iface.getFunction("deployForSafe");
        data = iface.encodeFunctionData("deployForSafe", [safeAddr, saltHex]);
      } catch {
        iface.getFunction("deploy");
        data = iface.encodeFunctionData("deploy", [safeAddr, saltHex]);
      }

      await sdk.txs.send({
        txs: [
          {
            to: factoryAddr,
            value: "0",
            data,
          },
        ],
      });
      await Promise.resolve(onChanged?.());
    } finally {
      setBusy(false);
    }
  }

  async function enableInsideSafeOnly() {
    if (!sdk) return;
    setBusy(true);
    try {
      const iface = new ethers.Interface(["function enableModule(address)"]);
      const data = iface.encodeFunctionData("enableModule", [predictedModule]);
      await sdk.txs.send({
        txs: [
          {
            to: safeAddr,
            value: "0",
            data,
          },
        ],
      });
      await Promise.resolve(onChanged?.());
    } finally {
      setBusy(false);
    }
  }

  // --------- STANDALONE (normal website) ---------

  // Deploy:
  // - threshold > 1 → instruct to do it from Safe UI (multisig)
  // - threshold == 1 → one-click deploy from wallet (permissionless)
  async function deployStandalone() {
    try {
      if (!ethers.isAddress(factoryAddr)) throw new Error("Bad factory");
      if (!ethers.isAddress(safeAddr)) throw new Error("Bad safe");
      if (!/^0x[0-9a-fA-F]{64}$/.test(saltHex)) {
        throw new Error("VITE_INSTALL_SALT must be 0x + 64 hex chars");
      }

      const t = await readThreshold();
      if (t > 1) {
        const pref = await getChainPrefix();
        setInstructions(
          [
            "Deploy requires a Safe transaction:",
            "1) Open Safe UI → New transaction → Contract interaction.",
            `2) Contract: ${factoryAddr}`,
            "3) Function: deployForSafe(address, bytes32) (or deploy(address, bytes32))",
            `4) Params:\n   - safe = ${safeAddr}\n   - salt = ${saltHex}`,
            `5) Review and submit. Collect required signatures (${t}-of-owners).\n`,
            `Safe link: https://app.safe.global/home?safe=${pref}${safeAddr}`,
          ].join("\n")
        );
        return;
      }

      // don’t try to deploy if code already exists at predicted
      const code = await (readProvider as any).getCode(predictedModule);
      if (code && code !== "0x") {
        alert("Module already deployed at the predicted address.");
        return;
      }

      const { signer } = await signerAndIsOwner();

      // call the factory directly using your ABI
      const factory = new ethers.Contract(
        factoryAddr,
        HeirSafeModuleFactoryABI,
        signer
      );

      let tx;
      try {
        factory.interface.getFunction("deployForSafe");
        tx = await factory.deployForSafe(safeAddr, saltHex);
      } catch {
        factory.interface.getFunction("deploy");
        tx = await factory.deploy(safeAddr, saltHex);
      }

      await tx.wait();
      await onChanged?.();
    } catch (e: any) {
      alert(e?.reason || e?.message || String(e));
    }
  }

  // Enable:
  // - threshold > 1 or not owner → show Safe UI instructions
  // - threshold == 1 and signer is owner → build & execute Safe tx locally
  async function enableStandaloneSmart() {
    setBusy(true);
    try {
      const t = await readThreshold();
      const { signer, signerAddr, isOwner } = await signerAndIsOwner();

      if (t !== 1 || !isOwner) {
        const pref = await getChainPrefix();
        setInstructions(
          [
            "Enable requires a Safe transaction:",
            "1) Open Safe UI → New transaction → Contract interaction.",
            `2) Contract: ${safeAddr}`,
            "3) Function: enableModule(address)",
            `4) Param: module = ${predictedModule}`,
            `5) Review and submit. Collect required signatures (${t}-of-owners).\n`,
            `You are connected as ${signerAddr}${!isOwner ? " (not a Safe owner)" : ""}.`,
            `Safe link: https://app.safe.global/home?safe=${pref}${safeAddr}`,
          ].join("\n")
        );
        return;
      }

      // threshold == 1 and signer is owner → execute Safe tx directly
      const safeRead = new ethers.Contract(safeAddr, SafeABI, readProvider);
      const safeWrite = new ethers.Contract(safeAddr, SafeABI, signer);

      const enableIface = new ethers.Interface([
        "function enableModule(address)",
      ]);
      const data = enableIface.encodeFunctionData("enableModule", [
        predictedModule,
      ]);

      const to = safeAddr;
      const value = 0;
      const operation = 0; // CALL
      const safeTxGas = 0;
      const baseGas = 0;
      const gasPrice = 0;
      const gasToken = ethers.ZeroAddress;
      const refundReceiver = ethers.ZeroAddress;
      const nonce = await safeRead.getNonce();

      // Safe’s on-chain hash (works for v1.3.x)
      const txHash = await safeRead.getTransactionHash(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        nonce
      );

      // ECDSA sign the hash
      const sig = await signer.signMessage(ethers.getBytes(txHash));

      // Execute
      const tx = await safeWrite.execTransaction(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        sig
      );
      await tx.wait();
      await onChanged?.();
    } catch (e: any) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-200 text-sm space-y-3">
      <div className="space-y-1 text-xs text-neutral-300">
        <div className="flex items-center gap-2">
          <span className="opacity-70">Factory:</span>
          <Address addr={factoryAddr} />
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-70">Predicted module:</span>
          <Address addr={predictedModule} />
        </div>
      </div>

      {isSafeApp ? (
        <div className="flex flex-col gap-2">
          {!isDeployed && !isEnabled && (
            <button
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
              onClick={installInsideSafe}
              disabled={busy}
            >
              {busy ? "Submitting…" : "Install module to this Safe"}
            </button>
          )}
          {isDeployed && !isEnabled && (
            <button
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
              onClick={enableInsideSafeOnly}
              disabled={busy}
            >
              {busy ? "Submitting…" : "Enable module"}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {!isDeployed && !isEnabled && (
            <button
              className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
              onClick={deployStandalone}
              disabled={busy}
            >
              {busy ? "Deploying…" : "Deploy module instance"}
            </button>
          )}

          {isDeployed && !isEnabled && (
            <>
              <button
                className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                onClick={enableStandaloneSmart}
                disabled={busy}
              >
                {busy ? "Working…" : "Enable module"}
              </button>

              <div className="flex gap-2 items-center">
                <button
                  className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
                  onClick={openSafe}
                  title="Open your Safe to deploy/enable from the UI."
                >
                  Open Safe UI
                </button>
              </div>

              {!!instructions && (
                <pre className="whitespace-pre-wrap text-amber-200/90 bg-amber-900/30 p-2 rounded">
                  {instructions}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
