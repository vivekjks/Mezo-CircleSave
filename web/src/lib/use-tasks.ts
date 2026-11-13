"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { ADDR, circleGovernorAbi, circleLensAbi, Model, Status, type Position, type ProposalView } from "./contracts";
import { deriveTasks, sortTasks, type Task } from "./circle-logic";
import { useNow, useUserCircles } from "./hooks";

/** Everything that needs the user's attention across all their circles. */
export function useTasks(user?: Address) {
  const circles = useUserCircles(user);
  const list = useMemo(() => circles.data ?? [], [circles.data]);
  const t = useNow();

  const positions = useReadContracts({
    contracts: list.map((s) => ({
      address: ADDR.lens,
      abi: circleLensAbi,
      functionName: "getPosition" as const,
      args: [s.circle, user!] as const,
    })),
    query: { enabled: !!user && list.length > 0, refetchInterval: 20_000 },
  });

  const pooled = list.filter((s) => s.params.model !== Model.Rotating && s.status === Status.Active);
  const proposals = useReadContracts({
    contracts: pooled.map((s) => ({
      address: ADDR.governor,
      abi: circleGovernorAbi,
      functionName: "getProposals" as const,
      args: [s.circle, user!] as const,
    })),
    query: { enabled: !!user && pooled.length > 0, refetchInterval: 20_000 },
  });

  const tasks: Task[] = useMemo(() => {
    if (!user || !t) return [];
    const propMap = new Map<string, readonly ProposalView[]>();
    pooled.forEach((s, i) => {
      const r = proposals.data?.[i];
      if (r?.status === "success") propMap.set(s.circle, r.result as readonly ProposalView[]);
    });
    const all: Task[] = [];
    list.forEach((s, i) => {
      const r = positions.data?.[i];
      const pos = r?.status === "success" ? (r.result as Position) : undefined;
      all.push(...deriveTasks(s, pos, propMap.get(s.circle), user, t));
    });
    return sortTasks(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, positions.data, proposals.data, user, Math.floor(t / 30)]);

  const positionMap = useMemo(() => {
    const m = new Map<string, Position>();
    list.forEach((s, i) => {
      const r = positions.data?.[i];
      if (r?.status === "success") m.set(s.circle, r.result as Position);
    });
    return m;
  }, [list, positions.data]);

  return { tasks, circles: list, positions: positionMap, isLoading: circles.isLoading };
}
