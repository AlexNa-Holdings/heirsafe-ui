export const HeirSafeModuleABI = [
  "function avatar() view returns (address)",
  "function heirConfigs(address) view returns (address beneficiary, uint256 activationTime)",
  "function setBeneficiary(address beneficiary, uint256 activationTime)",
  "function setActivationTime(uint256 newActivationTime)",
  "function claimSafe(address owner, address prevOwner)",
  "function removeBeneficiary()", 
  "event BeneficiarySet(address indexed owner, address indexed beneficiary)",
  "event ActivationTimeSet(address indexed owner, uint256 activationTime)"
] as const;
