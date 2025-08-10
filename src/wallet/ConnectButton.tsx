import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

export default function ConnectButton() {
  const { connectors, connect, status, error, variables } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { chains, switchChain } = useSwitchChain();

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="opacity-80">Wallet:</span>
        <span className="font-mono">{address}</span>
        <span className="opacity-80">Chain:</span>
        <span>{chains.find(c => c.id === chainId)?.name || chainId}</span>
        <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                onClick={() => switchChain({ chainId: sepolia.id })}>
          Switch to Sepolia
        </button>
        <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {connectors.map((c) => (
        <button key={c.uid}
          className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
          onClick={() => connect({ connector: c })}
          disabled={!c.ready || status === "pending"}>
          {c.name}{!c.ready ? " (unavailable)" : ""}
        </button>
      ))}
      {status === "pending" && <span className="text-xs opacity-70">Connecting… {variables?.connector?.name}</span>}
      {error && <span className="text-xs text-rose-400">{error.message}</span>}
    </div>
  );
}
