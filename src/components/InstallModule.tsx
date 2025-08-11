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

  const safeUrl = `https://app.safe.global/home?safe=${safeAddr}`;

  // ---------------- SAFE APP (iframe) ----------------

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

  // ---------------- STANDALONE (normal website) ----------------

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
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }

  // If threshold==1 and signer is an owner -> execute directly with pre-validated signature (no “Sign Text”).
  // Else -> show instructions (and keep Open Safe UI button visible).
  async function enableStandaloneSmart() {
    try {
      setInstructions("");
      setBusy(true);

      const browser = readProvider as ethers.BrowserProvider;
      const signer = await browser.getSigner();
      const signerAddr = (await signer.getAddress()).toLowerCase();

      const SAFE_ABI = [
        "function getOwners() view returns (address[])",
        "function getThreshold() view returns (uint256)",
        "function nonce() view returns (uint256)",
        "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)",
      ];
      const safe = new ethers.Contract(safeAddr, SAFE_ABI, signer);

      const [owners, thresholdBn] = await Promise.all([
        safe.getOwners(),
        safe.getThreshold(),
      ]);
      const isOwner = owners.map((o: string) => o.toLowerCase()).includes(signerAddr);
      const threshold = BigInt(thresholdBn.toString());

      if (threshold === 1n && isOwner) {
        const MM_IFACE = new ethers.Interface(["function enableModule(address)"]);
        const to = safeAddr;
        const value = 0;
        const data = MM_IFACE.encodeFunctionData("enableModule", [predictedModule]);
        const operation = 0; // CALL
        const safeTxGas = 0;
        const baseGas = 0;
        const gasPrice = 0;
        const gasToken = ethers.ZeroAddress;
        const refundReceiver = ethers.ZeroAddress;

        // Pre-validated signature: r(owner) || s(0) || v(1)
        const rOwner = ethers.zeroPadValue(await signer.getAddress(), 32);
        const sZero = ethers.ZeroHash;
        const vOne = ethers.toBeHex(1, 1);
        const preValidatedSig = ethers.concat([rOwner, sZero, vOne]);

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
          preValidatedSig
        );
        await tx.wait();
        await Promise.resolve(onChanged?.());
        return;
      }

      // Multisig or non-owner: show instructions (and keep the Open Safe UI button)
      setInstructions(
        [
          "Enable requires a Safe transaction:",
          "1) Click “Open Safe UI”.",
          "2) New transaction → Contract interaction.",
          `3) Contract: ${safeAddr}`,
          "4) Function: enableModule(address)",
          `5) Parameter: ${predictedModule}`,
          "6) Review and submit. Collect required owner signatures.",
          "",
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

              {/* Keep Open Safe visible even when instructions are shown */}
              <div className="flex gap-2 items-center">
                <button
                  className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
                  onClick={openSafe}
                  title="Open your Safe to enable from the UI."
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
