import { useAccount, useChainId, useSwitchChain } from "wagmi";

export default function NetworkSwitcher() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { chains, switchChain, status, error } = useSwitchChain();

  // Split into mains vs testnets (wagmi marks testnets with .testnet)
  const mains = chains.filter((c) => !c.testnet);
  const tests = chains.filter((c) => c.testnet);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value);
    if (!Number.isFinite(id)) return;
    switchChain({ chainId: id });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
        value={String(chainId ?? "")}
        onChange={onChange}
        disabled={!isConnected || status === "pending"}
        title={isConnected ? "Switch network" : "Connect a wallet to switch networks"}
      >
        {/* Current selection label when disconnected */}
        {!isConnected && <option value="">Select network</option>}

        <optgroup label="Main networks">
          {mains.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </optgroup>

        <optgroup label="Test networks">
          {tests.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </optgroup>
      </select>

      {status === "pending" && (
        <span className="text-xs opacity-70">Switching…</span>
      )}
      {error && (
        <span className="text-xs text-rose-400" title={error.message}>
          Failed
        </span>
      )}
    </div>
  );
}
