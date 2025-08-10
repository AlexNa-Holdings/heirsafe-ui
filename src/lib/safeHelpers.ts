import { ethers } from "ethers";
import { SafeABI, SENTINEL } from "../abi/Safe";

export async function getOwners(provider: ethers.Provider, safe: string) {
  const c = new ethers.Contract(safe, SafeABI, provider);
  return (await c.getOwners()) as string[];
}

export async function computePrevOwner(provider: ethers.Provider, safe: string, owner: string) {
  const owners = await getOwners(provider, safe);
  const i = owners.findIndex(o => o.toLowerCase() === owner.toLowerCase());
  if (i < 0) throw new Error("Owner not in Safe");
  return i === 0 ? ethers.ZeroAddress : owners[i - 1];
}

export async function isModuleEnabled(provider: ethers.Provider, safe: string, module: string) {
  const c = new ethers.Contract(safe, SafeABI, provider);
  let cursor = SENTINEL;
  const PAGE = 50n;
  while (true) {
    const [mods, next] = await c.getModulesPaginated(cursor, PAGE);
    if (mods.some((m: string) => m.toLowerCase() === module.toLowerCase())) return true;
    if (next === SENTINEL || mods.length === 0) return false;
    cursor = next;
  }
}

/** Encoded calldata to enable a module on the Safe (to paste into Safe’s Contract Interaction). */
export function buildEnableModuleCalldata(module: string) {
  const iface = new ethers.Interface(SafeABI);
  return iface.encodeFunctionData("enableModule", [module]);
}
