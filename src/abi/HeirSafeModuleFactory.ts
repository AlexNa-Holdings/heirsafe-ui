export const HeirSafeModuleFactoryABI = [
  "function implementation() view returns (address)",
  "function predict(address safe, bytes32 extraSalt) view returns (address)",
  "function deploy(address safe, bytes32 extraSalt) returns (address)",
  "event ModuleDeployed(address indexed safe, address indexed module, bytes32 salt)"
] as const;
