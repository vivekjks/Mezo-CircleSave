"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAbiItem, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { toast } from "sonner";

import {
  ADDR,
  circleFactoryAbi,
  circleGovernorAbi,
  circleLensAbi,
  erc20Abi,
  musdFaucetAbi,
  savingsCircleAbi,
} from "./contracts";
import { chain, explorerTx } from "./wagmi";
import { humanizeError } from "./errors";
import { readKeyFromHash, recallInviteKey } from "./invite";

const LIVE = { refetchInterval: 15_000 } as const;

/**
 * Mezo's public RPC is load-balanced and a node can lag the chain, which makes
 * eth_estimateGas occasionally under-report by a wide margin. Gas on Mezo costs almost
 * nothing and unused gas is never charged, so every action gets headroom plus a minimum
 * sized from its real worst case (50 members).
 */
const GAS_FLOOR: Record<string, bigint> = {
  createCircle: 1_800_000n,
  start: 2_500_000n,
  settleRound: 2_200_000n,
  finalize: 1_800_000n,
  execute: 1_800_000n,
  dissolve: 1_800_000n,
  setPayoutOrder: 2_000_000n,
  removeMember: 900_000n,
  leave: 900_000n,
  join: 600_000n,
};

export function withHeadroom(estimate: bigint, functionName = ""): bigint {
  const padded = (estimate * 15n) / 10n + 50_000n;
  const floor = GAS_FLOOR[functionName] ?? 500_000n;
  return padded > floor ? padded : floor;
}

// ───────────────────────────────────────────── time

let tick = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      tick = Math.floor(Date.now() / 1000);
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
/** Current unix time in seconds, ticking every second. */
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => tick,
    () => 0,
  );
}

const noopSubscribe = () => () => {};

/** True once rendering on the client (false during SSR and hydration). */
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** window.location.origin on the client, "" on the server. */
export function useOrigin() {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

/** Whether the current URL has `?name` in its query string. */
export function useSearchFlag(name: string) {
  return useSyncExternalStore(noopSubscribe, () => new URLSearchParams(window.location.search).has(name), () => false);
}

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Private invite key from the link fragment (#k=…), or the copy saved in this browser. */
export function useInviteKey(circle: Address): Hex | null {
  return useSyncExternalStore(
    subscribeHash,
    () => readKeyFromHash(window.location.hash) ?? recallInviteKey(circle),
    () => null,
  );
}

// ───────────────────────────────────────────── reads

export function useCircle(circle?: Address) {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getSummary",
    args: circle ? [circle] : undefined,
    query: { enabled: !!circle, ...LIVE },
  });
}

export function useMembers(circle?: Address) {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getMembers",
    args: circle ? [circle] : undefined,
    query: { enabled: !!circle, ...LIVE },
  });
}

export function usePosition(circle?: Address, user?: Address) {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getPosition",
    args: circle && user ? [circle, user] : undefined,
    query: { enabled: !!circle && !!user, ...LIVE },
  });
}

export function useProposals(circle?: Address, viewer?: Address) {
  return useReadContract({
    address: ADDR.governor,
    abi: circleGovernorAbi,
    functionName: "getProposals",
    args: circle ? [circle, viewer ?? "0x0000000000000000000000000000000000000000"] : undefined,
    query: { enabled: !!circle, ...LIVE },
  });
}

export function useActivities(circle: Address | undefined, limit: number) {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getActivities",
    args: circle ? [circle, 0n, BigInt(limit)] : undefined,
    query: { enabled: !!circle, ...LIVE },
  });
}

export function useUserCircles(user?: Address) {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getUserCircles",
    args: user ? [ADDR.factory, user] : undefined,
    query: { enabled: !!user, ...LIVE },
  });
}

export function useRecentCircles(limit = 60) {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getRecentCircles",
    args: [ADDR.factory, 0n, BigInt(limit)],
    query: LIVE,
  });
}

export function useProtocolStats() {
  return useReadContract({
    address: ADDR.lens,
    abi: circleLensAbi,
    functionName: "getProtocolStats",
    args: [ADDR.factory],
    query: { refetchInterval: 30_000 },
  });
}

export function useReputation(user?: Address) {
  return useReadContract({
    address: ADDR.factory,
    abi: circleFactoryAbi,
    functionName: "reputationOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user },
  });
}

export function useCreatedBy(user?: Address) {
  return useReadContract({
    address: ADDR.factory,
    abi: circleFactoryAbi,
    functionName: "createdBy",
    args: user ? [user] : undefined,
    query: { enabled: !!user },
  });
}

export function useMusdBalance(user?: Address) {
  return useReadContract({
    address: ADDR.musd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user, ...LIVE },
  });
}

export function useAllowance(user?: Address) {
  return useReadContract({
    address: ADDR.musd,
    abi: erc20Abi,
    functionName: "allowance",
    args: user ? [user, ADDR.factory] : undefined,
    query: { enabled: !!user },
  });
}

export function useFaucet(user?: Address) {
  const drip = useReadContract({ address: ADDR.faucet, abi: musdFaucetAbi, functionName: "dripAmount" });
  const available = useReadContract({ address: ADDR.faucet, abi: musdFaucetAbi, functionName: "available", query: LIVE });
  const next = useReadContract({
    address: ADDR.faucet,
    abi: musdFaucetAbi,
    functionName: "nextClaimAt",
    args: user ? [user] : undefined,
    query: { enabled: !!user },
  });
  return { drip: drip.data, available: available.data, nextClaimAt: next.data };
}

const activityEvent = getAbiItem({ abi: savingsCircleAbi, name: "ActivityLogged" });

/** Finds the transaction hash for each on-chain activity entry using the block it was logged in. */
export function useActivityTxs(circle: Address | undefined, entries: { index: bigint; block: bigint }[]) {
  const client = usePublicClient({ chainId: chain.id });
  const blocks = [...new Set(entries.map((e) => e.block.toString()))];
  return useQuery({
    queryKey: ["activity-tx", circle, blocks.join(",")],
    enabled: !!circle && !!client && blocks.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const map: Record<string, `0x${string}`> = {};
      const results = await Promise.all(
        blocks.map((b) =>
          client!
            .getLogs({ address: circle, event: activityEvent, fromBlock: BigInt(b), toBlock: BigInt(b) })
            .catch(() => []),
        ),
      );
      for (const logs of results) {
        for (const log of logs) {
          if (log.args.index !== undefined && log.transactionHash) map[log.args.index.toString()] = log.transactionHash;
        }
      }
      return map;
    },
  });
}

// ───────────────────────────────────────────── writes

export type TxRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

/** Sends a transaction with Mezo-friendly gas headroom, live toasts and a full data refresh. */
export function useTx() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: chain.id });
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const send = useCallback(
    async (
      key: string,
      label: string,
      request: TxRequest,
      opts?: { success?: string; quiet?: boolean },
    ): Promise<TransactionReceipt | null> => {
      if (!address || !client) {
        toast.error("Connect your wallet first.");
        return null;
      }
      setBusy(key);
      const id = toast.loading(label, { description: "Confirm in your wallet" });
      try {
        if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req = request as any;
        const gas = await client.estimateContractGas({ ...req, account: address });
        const hash = await writeContractAsync({ ...req, gas: withHeadroom(gas, request.functionName), chainId: chain.id });
        toast.loading(label, { id, description: "Waiting for Mezo to confirm" });
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
        if (receipt.status !== "success") throw new Error("The transaction was reverted on-chain.");
        toast.success(opts?.success ?? label, {
          id,
          description: (
            <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="link-quiet">
              View on Mezo explorer
            </a>
          ),
          duration: opts?.quiet ? 3000 : 6000,
        });
        await qc.invalidateQueries();
        return receipt;
      } catch (e) {
        toast.error(humanizeError(e), { id, description: undefined });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [address, chainId, client, qc, switchChainAsync, writeContractAsync],
  );

  return { send, busy, address };
}

/** Two-step MUSD spend: approves the factory (the single spender for every circle) when needed. */
export function useMusdSpend() {
  const { address } = useAccount();
  const allowance = useAllowance(address);
  const balance = useMusdBalance(address);
  const { send, busy } = useTx();

  const needsApproval = (amount: bigint) => amount > 0n && (allowance.data ?? 0n) < amount;
  const hasBalance = (amount: bigint) => (balance.data ?? 0n) >= amount;

  const approve = async (amount: bigint) => {
    const r = await send(
      "approve",
      "Allow CircleSave to use MUSD",
      { address: ADDR.musd, abi: erc20Abi, functionName: "approve", args: [ADDR.factory, amount] },
      { success: "MUSD allowance set", quiet: true },
    );
    await allowance.refetch();
    return !!r;
  };

  return { needsApproval, hasBalance, approve, approving: busy === "approve", balance: balance.data, allowance: allowance.data };
}
