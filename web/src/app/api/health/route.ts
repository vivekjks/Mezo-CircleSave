import { createPublicClient, http } from "viem";
import { mezoTestnet } from "viem/chains";
import { ADDR, circleFactoryAbi } from "@/lib/contracts";
import { DEX } from "@/lib/mezo-dex";

export const dynamic = "force-dynamic";

const client = createPublicClient({
  chain: mezoTestnet,
  transport: http(process.env.NEXT_PUBLIC_MEZO_RPC_URL || "https://rpc.test.mezo.org", { timeout: 6_000 }),
});

/** Live check of the chain, the CircleSave contracts and the Mezo Pools router. */
export async function GET() {
  const started = Date.now();
  try {
    const [chainId, block, factoryCode, routerCode, paused, circles] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getCode({ address: ADDR.factory }),
      client.getCode({ address: DEX.router }),
      client.readContract({ address: ADDR.factory, abi: circleFactoryAbi, functionName: "paused" }),
      client.readContract({ address: ADDR.factory, abi: circleFactoryAbi, functionName: "circleCount" }),
    ]);
    const ok = chainId === 31611 && !!factoryCode && factoryCode !== "0x" && !!routerCode && routerCode !== "0x";
    return Response.json(
      {
        ok,
        chainId,
        block: block.toString(),
        factory: ADDR.factory,
        paused,
        circles: circles.toString(),
        mezoPoolsRouter: DEX.router,
        latencyMs: Date.now() - started,
      },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
