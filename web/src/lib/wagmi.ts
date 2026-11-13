import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mezoTestnet } from "viem/chains";

export const chain = mezoTestnet;
export const EXPLORER = "https://explorer.test.mezo.org";
export const RPC_URL = process.env.NEXT_PUBLIC_MEZO_RPC_URL || "https://rpc.test.mezo.org";

export const wagmiConfig = createConfig({
  chains: [mezoTestnet],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  transports: {
    [mezoTestnet.id]: fallback([http(RPC_URL, { batch: { wait: 16 } }), http("https://rpc.test.mezo.org")]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;
