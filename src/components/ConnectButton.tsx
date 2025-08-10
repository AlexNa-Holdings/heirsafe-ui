import { useAccount, useConnect, useDisconnect } from "wagmi";

function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, status } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="px-2 py-1 rounded bg-neutral-800">{short(address)}</span>
        <button
          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Choose a preferred connector (Injected > WalletConnect > Coinbase)
  const injected = connectors.find(c => c.name.toLowerCase().includes("injected") || c.name.toLowerCase().includes("metamask") || c.name.toLowerCase().includes("rabby"));
  const walletConnect = connectors.find(c => c.name.toLowerCase().includes("walletconnect"));
  const coinbase = connectors.find(c => c.name.toLowerCase().includes("coinbase"));

  function handleConnect() {
    const preferred = injected ?? walletConnect ?? coinbase ?? connectors[0];
    if (!preferred) return;
    connect({ connector: preferred });
  }

  return (
    <button
      className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
      onClick={handleConnect}
      disabled={status === "pending" || connectors.length === 0}
    >
      {status === "pending" ? "Connecting…" : "Connect"}
    </button>
  );
}
