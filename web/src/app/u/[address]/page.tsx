"use client";

import { use } from "react";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { useReputation, useUserCircles } from "@/lib/hooks";
import { CircleList } from "@/components/circle-row";
import { ReputationCard } from "@/components/reputation";
import { CopyButton, ExplorerLink, MemberMark } from "@/components/identity";
import { Empty, Panel, Skeleton } from "@/components/ui";

export default function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = use(params);
  const { address: me } = useAccount();
  const valid = isAddress(raw);
  const address = (valid ? raw : undefined) as Address | undefined;
  const rep = useReputation(address);
  const circles = useUserCircles(address);

  if (!valid) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Empty title="That isn't a wallet address">Check the link and try again.</Empty>
      </div>
    );
  }
  const isMe = me?.toLowerCase() === raw.toLowerCase();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-center gap-5">
        <MemberMark address={raw} size={64} />
        <div>
          <h1 className="font-display text-[34px] leading-tight text-ink">{isMe ? "Your savings record" : "Savings record"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-ink-soft">
            <span className="tabular break-all">{raw}</span>
            <CopyButton value={raw} />
            <ExplorerLink address={raw}>Explorer</ExplorerLink>
          </div>
        </div>
      </div>

      <Panel className="mt-8 p-6 sm:p-8">
        {rep.isLoading ? <Skeleton className="h-40 w-full" /> : <ReputationCard rep={rep.data} />}
        <p className="mt-6 text-[13px] text-ink-faint">
          Every number here is kept by the CircleSave contracts on Mezo: written when payments land, never edited by a
          person.
        </p>
      </Panel>

      <h2 className="mt-12 mb-4 text-lg font-semibold text-ink">Circles</h2>
      {circles.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (circles.data?.length ?? 0) === 0 ? (
        <Empty title="No circles yet">{isMe ? "Join or start a circle to build your record." : "This wallet hasn't joined a circle."}</Empty>
      ) : (
        <CircleList items={circles.data!} />
      )}
    </div>
  );
}
