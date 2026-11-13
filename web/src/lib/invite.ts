import { keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDR } from "./contracts";

/**
 * Private circles store only the address of an "invite key" on-chain. The key itself is
 * derived from a signature by the creator's wallet, so the creator can re-create the same
 * link on any device without it ever touching a server. Joiners receive the key in the URL
 * fragment (never sent over the network) and use it to sign their own address.
 */
export function inviteKeyMessage(creator: Address, nonce: number): string {
  return [
    "CircleSave private invite key",
    "",
    "Signing creates the invite link for one of your circles.",
    "It does not move funds and costs no gas.",
    "",
    `Creator: ${creator}`,
    `Factory: ${ADDR.factory}`,
    `Circle number: ${nonce}`,
  ].join("\n");
}

export function inviteKeyFromSignature(signature: Hex): Hex {
  return keccak256(signature);
}

export function inviteSignerOf(key: Hex): Address {
  return privateKeyToAccount(key).address;
}

export async function signInvite(key: Hex, digest: Hex): Promise<Hex> {
  return privateKeyToAccount(key).signMessage({ message: { raw: digest } });
}

export function inviteUrl(origin: string, circle: Address, key?: Hex | null): string {
  return `${origin}/join/${circle}${key ? `#k=${key}` : ""}`;
}

const storeKey = (circle: Address) => `circlesave:invite:${circle.toLowerCase()}`;

export function rememberInviteKey(circle: Address, key: Hex) {
  try {
    localStorage.setItem(storeKey(circle), key);
  } catch {}
}

export function recallInviteKey(circle: Address): Hex | null {
  try {
    const v = localStorage.getItem(storeKey(circle));
    return v && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as Hex) : null;
  } catch {
    return null;
  }
}

export function readKeyFromHash(hash: string): Hex | null {
  const m = hash.match(/k=(0x[0-9a-fA-F]{64})/);
  return m ? (m[1] as Hex) : null;
}
