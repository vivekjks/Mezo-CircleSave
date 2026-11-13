import "server-only";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { mezoTestnet } from "viem/chains";
import { ADDR, circleLensAbi, type Summary } from "./contracts";

const client = createPublicClient({
  chain: mezoTestnet,
  transport: http(process.env.NEXT_PUBLIC_MEZO_RPC_URL || "https://rpc.test.mezo.org", { timeout: 6_000 }),
});

/** Reads a circle summary on the server for page metadata; returns null on any failure. */
export async function fetchSummary(address: string): Promise<Summary | null> {
  if (!isAddress(address)) return null;
  try {
    return await client.readContract({
      address: ADDR.lens,
      abi: circleLensAbi,
      functionName: "getSummary",
      args: [address as Address],
    });
  } catch {
    return null;
  }
}
