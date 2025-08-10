import { PropsWithChildren, useMemo } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia, polygon, arbitrum, optimism, base, bsc } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "@wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function WalletRoot({ children }: PropsWithChildren) {
  const config = useMemo(() => createConfig({
    chains: [mainnet, sepolia, polygon, arbitrum, optimism, base, bsc],
    transports: {
      [mainnet.id]:  http(),
      [sepolia.id]:  http(import.meta.env.VITE_PUBLIC_RPC || "https://rpc.sepolia.org"),
      [polygon.id]:  http(),
      [arbitrum.id]: http(),
      [optimism.id]: http(),
      [base.id]:     http(),
      [bsc.id]:      http(),
    },
    connectors: [
      injected({ shimDisconnect: true }),                           // MetaMask/Rabby/Brave/etc.
      coinbaseWallet({ appName: "HeirSafeUI" }),                    // Coinbase Wallet
      walletConnect({ projectId: "b17c1d7d5e1c4d5c8e0d3b9b8a3e7f52" }) // replace with your WC projectId later
    ],
    multiInjectedProviderDiscovery: true,
    ssr: false,
  }), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
