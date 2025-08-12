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
  // ────────────────────────────────
  // Ethereum mainnet
  // ────────────────────────────────
  1: {
    id: 1,
    name: "Ethereum",
    factory: "0xe1fad32178053fF29E68b21D965D482d94Bb0394", 
    txService: "https://safe-transaction-mainnet.safe.global",
    addChainParams: {
      chainId: "0x1",
      chainName: "Ethereum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
      blockExplorerUrls: ["https://etherscan.io"],
    },
  },

  // ────────────────────────────────
  // PulseChain mainnet
  // ────────────────────────────────
  369: {
    id: 369,
    name: "PulseChain",
    factory: "0xe1fad32178053fF29E68b21D965D482d94Bb0394", 
    addChainParams: {
      chainId: "0x171",
      chainName: "PulseChain",
      nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
      rpcUrls: [
        "https://rpc.pulsechain.com",
        "https://pulsechain.publicnode.com",
      ],
      blockExplorerUrls: ["https://scan.pulsechain.com"],
    },
  },
  // ────────────────────────────────
  // Sepolia (test)
  // ────────────────────────────────
  11155111: {
    id: 11155111,
    name: "Sepolia (test)",
    factory: "0xE83e2d2abE267741c261f7749A97BA4CE2A63603",
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
  // 8453: { ... }, 42161: { ... }, etc.
};

export function getFactoryAddress(chainId: number): string | null {
  const a = CHAINS[chainId]?.factory;
  return a ? a.trim() : null;
}

export function getTxServiceUrl(chainId: number): string | null {
  return CHAINS[chainId]?.txService ?? null;
}
export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map((x) => Number(x));
