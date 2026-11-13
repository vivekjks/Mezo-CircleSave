import type { Address } from "viem";
import { ADDR } from "./contracts";

/**
 * Mezo Pools (Aerodrome-style basic pools) on Mezo Testnet.
 * Source: https://mezo.org/docs/developers/features/mezo-pools (Testnet — Basic Pool Contracts).
 * BTC trades as an ERC-20 through Mezo's BTC precompile; MEZO is the network token.
 */
export const DEX = {
  router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as Address,
  poolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as Address,
  btcMusdPool: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9" as Address,
};

export const SWAP_TOKENS = {
  BTC: { symbol: "BTC", name: "Bitcoin", address: "0x7b7C000000000000000000000000000000000000" as Address, native: true },
  MEZO: { symbol: "MEZO", name: "Mezo", address: "0x7B7c000000000000000000000000000000000001" as Address, native: false },
} as const;
export type SwapToken = keyof typeof SWAP_TOKENS;

/** Slippage applied to the quoted output (1%). */
export const SLIPPAGE_BPS = 100n;

export const routerAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

/** Single-hop volatile route from `token` into MUSD. */
export function routeToMusd(token: SwapToken) {
  return [{ from: SWAP_TOKENS[token].address, to: ADDR.musd, stable: false, factory: DEX.poolFactory }] as const;
}

export const withSlippage = (amountOut: bigint) => (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
