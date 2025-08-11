import NetworkSwitcher from "./NetworkSwitcher";
import { ConnectButton } from "./ConnectButton";
import Address from "./Address";
import Logo from "./Logo";

export default function AppHeader({
  safeAddr,
  walletAddr,
}: {
  safeAddr: string;
  walletAddr?: string;
}) {
  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/70 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
      <div className="max-w-5xl mx-auto h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <img
            src="/logo-heirsafe.svg"
            alt="HeirSafe"
            className="h-7 w-7 md:h-8 md:w-8 drop-shadow-sm"
          />
          <span className="font-semibold tracking-tight">HeirSafe</span>
          {safeAddr && <Address addr={safeAddr} />}
        </div>
        <div className="flex items-center gap-3">
          <NetworkSwitcher />
          {/* wallet address pill (hide if unknown) */}
          {walletAddr ? <Address addr={walletAddr} /> : null}
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
