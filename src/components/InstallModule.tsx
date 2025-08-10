import { useState } from "react";
import { ethers } from "ethers";
import { useSafeApp } from "../lib/safeApp";

type Props = {
  safeAddr: string;
  factoryAddr: string;
  predictedModule: string;
  readProvider: ethers.Provider;
  isDeployed: boolean;
  isEnabled: boolean;
  onChanged?: () => Promise<void> | void;
};

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

  // ---------------- SAFE APP paths (inside app.safe.global iframe) ----------------

  async function installInsideSafe() {
    if (!sdk) return;
    setBusy(true);
    try {
      const iface = new ethers.Interface([
        "function deployModule(address,address,bytes32) external",
      ]);
      await sdk.txs.send({
        txs: [
          {
            to: factoryAddr,
            value: "0",
            data: iface.encodeFunctionData("deployModule", [
              safeAddr,
              predictedModule,
              saltHex,
            ]),
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
      const iface = new ethers.Interface([
        "function enableModule(address) external",
      ]);
      await sdk.txs.send({
        txs: [
          {
            to: safeAddr,
            value: "0",
            data: iface.encodeFunctionData("enableModule", [predictedModule]),
          },
        ],
      });
      await Promise.resolve(onChanged?.());
    } finally {
      setBusy(false);
    }
  }

  // ---------------- STANDALONE paths (normal website, EOA connected) ----------------

  async function deployStandalone() {
    setBusy(true);
    try {
      const signer = await (readProvider as ethers.BrowserProvider).getSigner();
      const iface = new ethers.Interface([
        "function deployModule(address,address,bytes32) external",
      ]);
      const tx = await signer.sendTransaction({
        to: factoryAddr,
        data: iface.encodeFunctionData("deployModule", [
          safeAddr,
          predictedModule,
          saltHex,
        ]),
      });
      await tx.wait();
      await Promise.resolve(onChanged?.());
    } finally {
      setBusy(false);
    }
  }

  function openSafe() {
    window.open(`https://app.safe.global/home?safe=${safeAddr}`, "_blank");
  }

  // Enable in Standalone:
  // If threshold==1 and signer is an owner -> build & execute Safe tx directly.
  // Otherwise show instructions (with link to open Safe UI).
  async function enableStandaloneSmart() {
    try {
      setInstructions("");
      setBusy(true);

      const browser = readProvider as ethers.BrowserProvider;
      const signer = await browser.getSigner();
      const signerAddr = (await signer.getAddress()).toLowerCase();

      // Minimal Safe ABI we need
      const SAFE_ABI = [
        "function getOwners() view returns (address[])",
        "function getThreshold() view returns (uint256)",
        "function nonce() view returns (uint256)",
        "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
        "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) returns (bool)",
      ];
      const safe = new ethers.Contract(safeAddr, SAFE_ABI, signer);

      const [owners, thresholdBn] = await Promise.all([
        safe.getOwners(),
        safe.getThreshold(),
      ]);
      const ownersLc = owners.map((o: string) => o.toLowerCase());
      const isOwner = ownersLc.includes(signerAddr);
      const threshold = BigInt(thresholdBn.toString());

      if (threshold === 1n && isOwner) {
        // Build inner call data: Safe.enableModule(predictedModule)
        const MM_IFACE = new ethers.Interface([
          "function enableModule(address)",
        ]);
        const to = safeAddr;
        const value = 0;
        const data = MM_IFACE.encodeFunctionData("enableModule", [
          predictedModule,
        ]);
        const operation = 0; // CALL
        const safeTxGas = 0;
        const baseGas = 0;
        const gasPrice = 0;
        const gasToken = ethers.ZeroAddress;
        const refundReceiver = ethers.ZeroAddress;
        const nonce = await safe.nonce();

        // Get tx hash and sign
        const txHash: string = await safe.getTransactionHash(
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

        // Sign the hash (eth_sign/personal_sign over bytes32)
        const sigHex = await signer.signMessage(ethers.getBytes(txHash));
        const sigObj = ethers.Signature.from(sigHex);
        // Pack as r(32) + s(32) + v(1) expected by Safe
        const packedSig = ethers.concat([
          sigObj.r,
          sigObj.s,
          ethers.toBeHex(sigObj.v, 1),
        ]);

        const tx = await safe.execTransaction(
          to,
          value,
          data,
          operation,
          safeTxGas,
          baseGas,
          gasPrice,
          gasToken,
          refundReceiver,
          packedSig
        );
        await tx.wait();
        await Promise.resolve(onChanged?.());
        return;
      }

      // Fallback: show instructions
      setInstructions(
        [
          "Enable requires a Safe transaction:",
          "1) Click “Open Safe UI”.",
          "2) New transaction → Contract interaction.",
          `3) Contract: ${safeAddr}`,
          "4) Function: enableModule(address)",
          `5) Parameter: ${predictedModule}`,
          "6) Review and submit. Collect required owner signatures.",
        ].join("\n")
      );
    } catch (e: any) {
      setInstructions(e?.reason || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-200 text-sm space-y-3">
      <div className="break-all">Predicted module: {predictedModule}</div>

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
              {!!instructions && (
                <pre className="whitespace-pre-wrap text-amber-200/90 bg-amber-900/30 p-2 rounded">
                  {instructions}
                </pre>
              )}
              {!instructions && (
                <button
                  className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
                  onClick={openSafe}
                  title="Open your Safe if you prefer to enable from the UI."
                >
                  Open Safe UI
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
