// src/lib/safeValidation.ts
import { ethers } from "ethers";

export type SafeValidationResult =
  | { ok: true; owners: string[]; threshold: number; version?: string }
  | { ok: false; reason: "invalid_address" | "no_code" | "not_safe" | "unknown"; detail?: string };

const SAFE_MIN_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function VERSION() view returns (string)",
];

export async function validateSafeOnChain(
  provider: ethers.Provider,
  addr: string
): Promise<SafeValidationResult> {
  try {
    if (!ethers.isAddress(addr)) return { ok: false, reason: "invalid_address" };
    const code = await provider.getCode(addr);
    if (!code || code === "0x") return { ok: false, reason: "no_code" };

    const c = new ethers.Contract(addr, SAFE_MIN_ABI, provider);
    const [owners, th] = await Promise.all([c.getOwners(), c.getThreshold()]);
    let version: string | undefined;
    try { version = await c.VERSION(); } catch {}

    if (Array.isArray(owners) && owners.length >= 1 && typeof th === "bigint" && th > 0n) {
      return { ok: true, owners, threshold: Number(th), version };
    }
    return { ok: false, reason: "not_safe", detail: "unexpected owners/threshold" };
  } catch (e: any) {
    return { ok: false, reason: "not_safe", detail: e?.code || e?.message || "probe failed" };
  }
}
