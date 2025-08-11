// src/config/chains.ts
export type AddEthereumChainParameter = {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
};

export type ChainConfig = {
  id: number;
  name: string;
  factory: string; // your HeirSafe factory per chain
  txService?: string; // Safe Tx Service base URL (optional)
  addChainParams?: AddEthereumChainParameter; // for wallet_addEthereumChain
};

export const CHAINS: Record<number, ChainConfig> = {
  11155111: {
    id: 11155111,
    name: "Sepolia",
    factory: "0xC20bB5836A8ef3f8b7b39211a4521C6D89EbAd78",
    txService: "https://safe-transaction-sepolia.safe.global",
    addChainParams: {
      chainId: "0xaa36a7",
      chainName: "Sepolia",
      nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.sepolia.org", "https://sepolia.drpc.org"],
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
  },
  // Add more networks as you deploy:
  // 1: { ... }, 8453: { ... }, 42161: { ... }, etc.
};

export function getFactoryAddress(chainId: number): string | null {
  const a = CHAINS[chainId]?.factory;
  return a ? a.trim() : null;
}

export function getTxServiceUrl(chainId: number): string | null {
  return CHAINS[chainId]?.txService ?? null;
}
export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map((x) => Number(x));
