export const SafeABI = [
  "function getOwners() view returns (address[])",
  // Safe v1.3+: pagination over module list
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
  "function isOwner(address) view returns (bool)",
  // shown only for calldata building (owners will execute via Safe UI)
  "function enableModule(address module)"
] as const;

export const SENTINEL = "0x0000000000000000000000000000000000000001";
