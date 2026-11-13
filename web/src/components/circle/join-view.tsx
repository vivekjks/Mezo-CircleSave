"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { Lock } from "lucide-react";
import { Model, Status, ZERO } from "@/lib/contracts";
import { MODEL_INFO, plannedRounds, targetAmount } from "@/lib/circle-logic";
import { bpsToPercent, durationLabel, periodLabel, relativeTime, toMusd } from "@/lib/format";
import { useCircle, useInviteKey, useMembers, useMounted, useMusdBalance, useNow, usePosition } from "@/lib/hooks";
import { inviteSignerOf } from "@/lib/invite";
import { CircleRing } from "@/components/ring";
import { AddressLink } from "@/components/identity";
import { ConnectButton } from "@/components/wallet";
import { Button, Empty, Panel, Skeleton } from "@/components/ui";
import { useJoin } from "./use-join";

export function JoinView({ address }: { address: Address }) {
  const router = useRouter();
  const mounted = useMounted();
  const t = useNow();
  const { address: user } = useAccount();
  const summary = useCircle(address);
  const members = useMembers(address);
  const position = usePosition(address, user);
  const balance = useMusdBalance(user);
  const key = useInviteKey(address);
  const [agreed, setAgreed] = useState(false);
  const s = summary.data;
  const { join, joining } = useJoin(s, key);

  if (summary.isLoading)
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Skeleton className="h-[520px] w-full rounded-[22px]" />
      </div>
    );
  if (!s)
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Empty title="This invite link doesn't lead to a circle">Check that you copied the whole link, or ask for a new one.</Empty>
      </div>
    );

  const isPrivate = s.params.inviteSigner !== ZERO;
  const keyOk = !isPrivate || (key && inviteSignerOf(key).toLowerCase() === s.params.inviteSigner.toLowerCase());
  const isCreator = !!user && user.toLowerCase() === s.creator.toLowerCase();
  const rounds = plannedRounds(s);
  const rotating = s.params.model === Model.Rotating;
  const views = members.data?.[0] ?? [];
  const deposit = s.params.collateralAmount;
  const short = deposit > 0n && balance.data !== undefined && balance.data < deposit;

  let blocker: React.ReactNode = null;
  if (position.data?.isMember)
    blocker = (
      <>
        You&apos;re already a member.{" "}
        <Link className="link-quiet font-semibold" href={`/circle/${s.circle}`}>
          Open the circle
        </Link>
      </>
    );
  else if (s.status !== Status.Open)
    blocker = (
      <>
        This circle {s.status === Status.Active ? "has already started" : s.status === Status.Cancelled ? "was cancelled" : "has finished"}, so it isn&apos;t taking new members.{" "}
        <Link className="link-quiet font-semibold" href={`/circle/${s.circle}`}>
          View it anyway
        </Link>
      </>
    );
  else if (s.memberCount >= s.params.maxMembers) blocker = "This circle is full.";
  else if (t > Number(s.params.joinDeadline)) blocker = "Joining for this circle has closed.";
  else if (!keyOk && !isCreator) blocker = "This invite link is missing its key or belongs to another circle. Ask for the full link again.";

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Panel className="overflow-hidden">
        <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[1fr_260px]">
          <div>
            <p className="text-[15px] text-ink-soft">
              <AddressLink address={s.creator} /> invited you to save together
            </p>
            <h1 className="mt-2 font-display text-[38px] leading-tight text-ink">{s.meta.name}</h1>
            {s.meta.description && <p className="mt-3 text-[16px] text-ink-soft">{s.meta.description}</p>}
            <div className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
              <span>{MODEL_INFO[s.params.model].name}</span>
              {isPrivate && (
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" /> Invite only
                </span>
              )}
            </div>

            <h2 className="mt-8 text-sm font-semibold text-ink">What you&apos;re agreeing to</h2>
            <ul className="mt-3 space-y-2.5 text-[15px] text-ink">
              <li>
                Pay <strong className="tabular">{toMusd(s.params.contributionAmount)} MUSD</strong> {periodLabel(s.params.periodDuration)} for {rounds} rounds
                ({toMusd(s.params.contributionAmount * BigInt(rounds))} MUSD in total, over {durationLabel(rounds * s.params.periodDuration)}).
              </li>
              {rotating && (
                <li>
                  Take the whole pot of about <strong className="tabular">{toMusd(s.params.contributionAmount * BigInt(s.params.maxMembers))} MUSD</strong> once, in your turn
                  ({["by join order", "drawn at random when the circle starts", "set by the creator"][s.params.payoutOrder]}).
                </li>
              )}
              {deposit > 0n && (
                <li>
                  Leave a <strong className="tabular">{toMusd(deposit)} MUSD</strong> deposit, returned at the end. It covers a round if you ever miss one.
                </li>
              )}
              {s.params.model === Model.Goal && <li>Save toward a goal of {toMusd(targetAmount(s))} MUSD.</li>}
              {s.params.model === Model.FixedTerm && <li>Keep the money in until the end. Leaving early costs {bpsToPercent(s.params.earlyExitPenaltyBps)}.</li>}
              {s.params.model === Model.Emergency && <li>Vote on members&apos; requests for help. {bpsToPercent(s.params.approvalBps)} must approve.</li>}
              <li className="text-ink-soft">A {bpsToPercent(s.feeBps)} fee applies to payouts. Refunds are free.</li>
            </ul>

            {s.meta.rules && (
              <div className="mt-6 rounded-[12px] border border-rule p-4">
                <div className="text-[13px] font-semibold text-ink-soft">Group rules</div>
                <p className="mt-1.5 text-[15px] whitespace-pre-line text-ink">{s.meta.rules}</p>
              </div>
            )}
          </div>

          <div>
            <CircleRing
              nodes={views.map((m) => ({ id: m.account, label: m.account.slice(2, 4).toUpperCase(), state: "idle" as const }))}
              potLabel="Members joined"
              potValue={`${s.memberCount} of ${s.params.maxMembers}`}
              potUnit="seats filled"
              emptySeats={Math.max(0, s.params.maxMembers - s.memberCount)}
            />
            <p className="mt-2 text-center text-[13px] text-ink-soft">Joining closes {relativeTime(Number(s.params.joinDeadline), t)}</p>
          </div>
        </div>

        <div className="border-t border-rule px-6 py-6 sm:px-10">
          {!mounted ? null : blocker ? (
            <p className="text-[15px] text-ink">{blocker}</p>
          ) : !user ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[15px] text-ink">Connect the wallet you&apos;ll save with.</p>
              <ConnectButton variant="primary" size="lg" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-5">
              <label className="flex max-w-md items-start gap-3 text-[15px] text-ink">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-4 accent-[#000000]" />
                I&apos;ve read the rules and understand the contract enforces them. Nobody can change them later.
              </label>
              <div className="text-right">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!agreed || short}
                  loading={joining}
                  onClick={async () => {
                    if (await join()) router.push(`/circle/${s.circle}`);
                  }}
                >
                  {deposit > 0n ? `Join and leave ${toMusd(deposit)} MUSD deposit` : "Join circle"}
                </Button>
                {short && (
                  <p className="mt-2 text-sm text-ink">
                    You need {toMusd(deposit)} MUSD for the deposit.{" "}
                    <Link href="/get-musd" className="link-quiet font-semibold">
                      Get test MUSD
                    </Link>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
