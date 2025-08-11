// src/components/NetworkSwitcher.tsx
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useSafeApp } from "../lib/safeApp";
import { CHAINS, SUPPORTED_CHAIN_IDS } from "../config/chains";

export default function NetworkSwitcher() {
  const { isSafeApp, provider: safeEip1193 } = useSafeApp();

  // pick the live provider (Safe iframe or injected wallet)
  const readProvider = useMemo(() => {
    if (safeEip1193) return new ethers.BrowserProvider(safeEip1193 as any);
    const eth = (window as any).ethereum;
    return eth ? new ethers.BrowserProvider(eth) : null;
  }, [safeEip1193]);

  const [chainId, setChainId] = useState<number | null>(null);
  const currentLabel =
    chainId != null && CHAINS[chainId] ? CHAINS[chainId].name : "Unknown";

  // keep chainId in sync
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      if (!readProvider) {
        setChainId(null);
        return;
      }
      const net = await (readProvider as any).getNetwork();
      setChainId(Number(net.chainId));

      // listen to wallet chain changes (only works on injected providers)
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

  async function switchTo(target: number) {
    const eth = (window as any).ethereum;
    if (!eth) return alert("No injected wallet found to switch networks.");

    if (chainId === target) return;

    const targetCfg = CHAINS[target];
    const targetHex = ethers.toBeHex(target);

    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }],
      });
    } catch (err: any) {
      // 4902 = chain not added to wallet
      if (err?.code === 4902 && targetCfg?.addChainParams) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [targetCfg.addChainParams],
          });
        } catch (e: any) {
          console.error("wallet_addEthereumChain failed:", e);
          alert(e?.message || "Failed to add chain to wallet.");
        }
      } else {
        console.error("wallet_switchEthereumChain failed:", err);
        alert(err?.message || "Failed to switch network.");
      }
    }
  }

  // In Safe App: show a read-only pill
  if (isSafeApp) {
    return (
      <div
        className="px-3 h-9 inline-flex items-center rounded bg-neutral-800 text-sm"
        title="Network is controlled by the Safe App host"
      >
        {currentLabel}
      </div>
    );
  }

  // Standalone: dropdown with configured chains
  return (
    <select
      className="h-9 rounded bg-neutral-800 px-3 text-sm"
      value={chainId ?? ""}
      onChange={(e) => switchTo(Number(e.target.value))}
    >
      {chainId == null && <option value="">Select network</option>}
      {SUPPORTED_CHAIN_IDS.map((id) => (
        <option key={id} value={id}>
          {CHAINS[id].name}
        </option>
      ))}
    </select>
  );
}
