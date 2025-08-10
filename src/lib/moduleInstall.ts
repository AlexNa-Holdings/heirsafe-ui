import { ethers } from "ethers";
import { HeirSafeModuleFactoryABI } from "../abi/HeirSafeModuleFactory";
import { SafeABI } from "../abi/Safe";
import { SENTINEL } from "../abi/Safe";

export async function predictModuleForSafe(
  provider: ethers.Provider,
  factory: string,
  safe: string,
  saltHex: string
) {
  const f = new ethers.Contract(factory, HeirSafeModuleFactoryABI, provider);
  return (await f.predict(safe, saltHex)) as string;
}

export async function isDeployed(provider: ethers.Provider, addr: string) {
  const code = await provider.getCode(addr);
  return code && code !== "0x";
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

export function encodeEnableModule(module: string) {
  const iface = new ethers.Interface(SafeABI);
  return iface.encodeFunctionData("enableModule", [module]);
}

export function encodeFactoryDeploy(factory: string, safe: string, saltHex: string) {
  const iface = new ethers.Interface(HeirSafeModuleFactoryABI);
  return iface.encodeFunctionData("deploy", [safe, saltHex]);
}
