"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";
import { ExternalLink, Lock, PartyPopper, Share2 } from "lucide-react";

import { Model, ProposalKind, ProposalState, Status, ZERO, type Summary } from "@/lib/contracts";
import { elapsedRounds, hasBit, maturity, MODEL_INFO, plannedRounds, roundDeadline, statusInfo, targetAmount } from "@/lib/circle-logic";
import { bpsToPercent, durationLabel, formatDate, pct, periodLabel, relativeTime, toMusd } from "@/lib/format";
import { useCircle, useMembers, useNow, usePosition, useProposals } from "@/lib/hooks";
import { readKeyFromHash, recallInviteKey } from "@/lib/invite";
import { CircleRing, type RingNode } from "@/components/ring";
import { Ledger } from "@/components/ledger";
import { markColor, AddressLink, MemberMark } from "@/components/identity";
import { ModelIcon } from "@/components/model-art";
import { explorerAddress } from "@/lib/wagmi";
import { Button, Chip, Empty, Panel, Progress, Skeleton, cx } from "@/components/ui";
import { ActionPanel } from "./action-panel";
import { ActivityTab, MembersTab, RulesTab, ScheduleTab, VotesTab } from "./tabs";
import { InviteDialog } from "./invite";
import { useJoin } from "./use-join";

type Tab = "ledger" | "members" | "schedule" | "votes" | "activity" | "rules";

export function CircleView({ address }: { address: Address }) {
  const { address: user } = useAccount();
  const t = useNow();
  const summary = useCircle(address);
  const members = useMembers(address);
  const position = usePosition(address, user);
  const proposals = useProposals(address, user);

  const [tab, setTab] = useState<Tab>("ledger");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState<Hex | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    const k = readKeyFromHash(window.location.hash) ?? recallInviteKey(address);
    if (k) setInviteKey(k);
    if (new URLSearchParams(window.location.search).get("created")) {
      setJustCreated(true);
      window.history.replaceState(null, "", `/circle/${address}`);
    }
  }, [address]);

  const s = summary.data;
  const { join, joining } = useJoin(s, inviteKey);
  const views = useMemo(() => members.data?.[0] ?? [], [members.data]);
  const bits = useMemo(() => {
    const paid = new Map<string, bigint>();
    const late = new Map<string, bigint>();
    const missed = new Map<string, bigint>();
    views.forEach((m, i) => {
      paid.set(m.account, members.data![1][i]);
      late.set(m.account, members.data![2][i]);
      missed.set(m.account, members.data![3][i]);
    });
    return { paid, late, missed };
  }, [views, members.data]);

  if (summary.isLoading) return <LoadingView />;
  if (!s || summary.error)
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Empty title="We couldn't find this circle" action={<Link href="/circles" className="link-quiet font-semibold">Browse circles</Link>}>
          The address isn&apos;t a CircleSave circle on Mezo Testnet, or the network didn&apos;t respond. Check the link and refresh.
        </Empty>
      </div>
    );

  const rotating = s.params.model === Model.Rotating;
  const status = statusInfo(s);
  const isPrivate = s.params.inviteSigner !== ZERO;
  const started = s.status !== Status.Open && s.startTime > 0n;
  const ringRound = rotating ? s.roundsSettled : s.currentRound;
  const openUpTo = elapsedRounds(s, t);
  const roundOpen = ringRound <= openUpTo;

  // ring nodes follow the payout order once a rotating circle starts, so the pot travels clockwise
  const ordered = rotating && started ? [...views].sort((a, b) => a.data.payoutRound - b.data.payoutRound) : views;
  const nodes: RingNode[] = ordered.map((m) => {
    const paid = bits.paid.get(m.account) ?? 0n;
    const missed = bits.missed.get(m.account) ?? 0n;
    return {
      id: m.account,
      label: m.account.slice(2, 4).toUpperCase(),
      color: markColor(m.account),
      state:
        s.status !== Status.Active || m.data.exited || ringRound >= s.totalRounds || !roundOpen
          ? "idle"
          : hasBit(paid, ringRound)
            ? "paid"
            : hasBit(missed, ringRound)
              ? "missed"
              : "due",
      recipient: rotating && s.status === Status.Active && m.data.payoutRound === s.roundsSettled + 1,
      received: rotating && m.data.payoutRound > 0 && m.data.payoutRound <= s.roundsSettled,
      you: !!user && m.account.toLowerCase() === user.toLowerCase(),
    };
  });
  const paidThisRound = nodes.filter((n) => n.state === "paid").length;

  let potLabel = "In the pool";
  let potValue = toMusd(s.poolBalance);
  let potUnit = "MUSD";
  if (s.status === Status.Open) {
    potLabel = "Joined";
    potValue = `${s.memberCount}/${s.params.maxMembers}`;
    potUnit = "members";
  } else if (s.status === Status.Active && rotating) {
    potLabel = `Round ${s.roundsSettled + 1} pot`;
    potValue = toMusd(s.params.contributionAmount * BigInt(paidThisRound));
    potUnit = `of ${toMusd(s.params.contributionAmount * BigInt(s.memberCount))} MUSD`;
  } else if (s.status !== Status.Active) {
    potLabel = "Paid out";
    potValue = toMusd(s.totalPaidOut);
  }

  const target = targetAmount(s);
  const tabs: { id: Tab; label: string }[] = [
    { id: "ledger", label: "Ledger" },
    { id: "members", label: `Members (${s.memberCount})` },
    { id: "schedule", label: rotating ? "Payout schedule" : "Progress" },
    ...(!rotating ? [{ id: "votes" as Tab, label: `Votes${s.proposalCount > 0n ? ` (${s.proposalCount})` : ""}` }] : []),
    { id: "activity", label: "Activity" },
    { id: "rules", label: "Rules" },
  ];

  const isMemberView = (a: string) => !!user && a.toLowerCase() === user.toLowerCase();
  const rounds = started ? s.totalRounds : plannedRounds(s);
  const duration = rounds * s.params.periodDuration;

  // header of the "this round" card
  let roundTitle = "";
  let roundNote = "";
  let progressValue = 0;
  let progressLabel = "";
  if (s.status === Status.Open) {
    roundTitle = "Gathering members";
    roundNote = `Joining closes ${relativeTime(Number(s.params.joinDeadline), t)}`;
    progressValue = (s.memberCount / s.params.maxMembers) * 100;
    progressLabel = `${s.memberCount} of ${s.params.maxMembers} seats filled`;
  } else if (s.status === Status.Active && rotating) {
    const dl = roundDeadline(s, s.roundsSettled);
    roundTitle = `Round ${s.roundsSettled + 1} of ${s.totalRounds}`;
    roundNote = !roundOpen
      ? `Opens ${relativeTime(Number(s.startTime) + s.roundsSettled * s.params.periodDuration, t)}`
      : dl < t
        ? `Deadline passed ${relativeTime(dl, t)}`
        : `Due ${relativeTime(dl, t)}`;
    progressValue = s.memberCount ? (paidThisRound / s.memberCount) * 100 : 0;
    progressLabel = `${paidThisRound} of ${s.memberCount} paid this round`;
  } else if (s.status === Status.Active) {
    const done = s.currentRound >= s.totalRounds;
    roundTitle = done ? "All rounds are done" : `Round ${s.currentRound + 1} of ${s.totalRounds}`;
    roundNote = done ? `Ended ${relativeTime(maturity(s), t)}` : `Due ${relativeTime(roundDeadline(s, s.currentRound), t)}`;
    progressValue = pct(s.totalContributed, target);
    progressLabel = `${toMusd(s.totalContributed)} of ${toMusd(target)} MUSD saved`;
  } else {
    roundTitle = s.status === Status.Cancelled ? "Cancelled" : "Finished";
    roundNote = `${s.status === Status.Cancelled ? "Cancelled" : "Finished"} ${relativeTime(Number(s.endedAt), t)}`;
    progressValue = 100;
    progressLabel = `${toMusd(s.totalPaidOut)} MUSD paid out to members`;
  }

  const facts: { k: string; v: string }[] = [
    { k: "Each member pays", v: `${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)}` },
    { k: "Members", v: `${s.memberCount} of ${s.params.maxMembers}` },
    { k: "Rounds", v: `${rounds}, over ${durationLabel(duration)}` },
    rotating
      ? { k: "Pot each round", v: `${toMusd(s.params.contributionAmount * BigInt(started ? s.memberCount : s.params.maxMembers))} MUSD` }
      : s.params.model === Model.Goal
        ? { k: "Goal", v: `${toMusd(target)} MUSD` }
        : { k: "In the pool", v: `${toMusd(s.poolBalance)} MUSD` },
    { k: "Fee on payouts", v: bpsToPercent(s.feeBps) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <nav className="text-[13px] text-ink-soft" aria-label="Breadcrumb">
        <Link href="/circles" className="hover:text-ink">
          Circles
        </Link>{" "}
        / <span className="text-ink">{s.meta.name}</span>
      </nav>

      {justCreated && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-blue px-5 py-4">
          <div className="flex items-center gap-3">
            <PartyPopper className="size-5 text-blue" />
            <span className="font-semibold text-ink">Your circle is live on Mezo. Send the invite link to your group.</span>
          </div>
          <Button size="sm" variant="ink" onClick={() => setInviteOpen(true)}>
            Get invite link
          </Button>
        </div>
      )}
      {s.paused && (
        <div className="mt-5 rounded-[14px] border border-ink px-5 py-3 text-sm text-ink">
          CircleSave is paused for maintenance. Payments and payouts are on hold; deposits can still be withdrawn.
        </div>
      )}

      <header className="mt-6 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <ModelIcon model={s.params.model} size={52} className="mt-1 hidden sm:inline-flex" />
          <div className="min-w-0">
            <h1 className="font-display text-[32px] leading-tight break-words text-ink sm:text-[40px]">{s.meta.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-ink-soft">
              <Chip tone={status.tone} dot>
                {status.label}
              </Chip>
              <span>{MODEL_INFO[s.params.model].name}</span>
              {isPrivate && (
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" /> Invite only
                </span>
              )}
              <span>
                Started by <AddressLink address={s.creator} you={user} className="text-ink" />
              </span>
            </div>
            {s.meta.description && <p className="mt-3 max-w-2xl text-[15px] text-ink-soft">{s.meta.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {(s.status === Status.Open || position.data?.isMember) && (
            <Button size="sm" onClick={() => setInviteOpen(true)} icon={<Share2 className="size-3.5" />}>
              Invite
            </Button>
          )}
          <a
            href={explorerAddress(s.circle)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-ink/25 px-3 text-[13px] font-semibold text-ink hover:border-ink"
          >
            Contract <ExternalLink className="size-3.5" />
          </a>
        </div>
      </header>

      <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-5">
        {facts.map((f) => (
          <div key={f.k} className="bg-white px-5 py-4">
            <dt className="text-[12px] text-ink-soft">{f.k}</dt>
            <dd className="tabular mt-1 text-[15px] font-semibold text-ink">{f.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 space-y-8 lg:order-1">
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-4">
              <h2 className="text-lg font-semibold text-ink">{roundTitle}</h2>
              <span className="tabular text-sm text-ink-soft">{roundNote}</span>
            </div>
            <div className="px-5 pt-4">
              <div className="mb-1.5 text-[13px] text-ink-soft">{progressLabel}</div>
              <Progress value={progressValue} label={progressLabel} />
            </div>
            <div className="grid items-center gap-6 p-5 sm:grid-cols-[230px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[230px]">
                <CircleRing
                  nodes={nodes}
                  potLabel={potLabel}
                  potValue={potValue}
                  potUnit={potUnit}
                  emptySeats={s.status === Status.Open ? s.params.maxMembers - s.memberCount : 0}
                />
              </div>
              <ul className="divide-y divide-rule">
                {ordered.map((m) => {
                  const node = nodes.find((n) => n.id === m.account)!;
                  const late = hasBit(bits.late.get(m.account) ?? 0n, ringRound);
                  let state: React.ReactNode;
                  if (s.status === Status.Open) state = <span className="text-ink-soft">Joined {formatDate(m.data.joinedAt, false)}</span>;
                  else if (s.status !== Status.Active) state = <span className="tabular text-ink">Received {toMusd(m.data.received)} MUSD</span>;
                  else if (m.data.exited) state = <span className="text-ink-faint">Left early</span>;
                  else if (node.state === "paid") state = <span className="font-semibold text-blue">{late ? "Paid late" : "Paid"}</span>;
                  else if (node.state === "missed") state = <span className="font-semibold text-ink">Missed</span>;
                  else if (node.state === "due") state = <span className="text-ink">Not paid yet</span>;
                  else state = <span className="text-ink-faint">{ringRound >= s.totalRounds ? "Done" : "Round not open"}</span>;
                  return (
                    <li key={m.account} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <MemberMark address={m.account} size={26} ring={isMemberView(m.account) ? "you" : undefined} />
                        <span className="min-w-0">
                          <AddressLink address={m.account} you={user} className="text-ink" />
                          {node.recipient && <span className="ml-2 text-[12px] font-semibold text-blue">Takes this pot</span>}
                          {rotating && m.data.payoutRound > 0 && !node.recipient && (
                            <span className="ml-2 text-[12px] text-ink-faint">turn {m.data.payoutRound}</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px]">{state}</span>
                    </li>
                  );
                })}
                {s.status === Status.Open &&
                  Array.from({ length: s.params.maxMembers - s.memberCount }, (_, k) => (
                    <li key={`seat-${k}`} className="flex items-center gap-2.5 py-2.5 text-[14px] text-ink-faint">
                      <span className="size-[26px] rounded-[7px] border border-dashed border-rule-strong" aria-hidden />
                      Open seat
                    </li>
                  ))}
              </ul>
            </div>
            {(() => {
              const open = (proposals.data ?? []).filter((x) => x.state === ProposalState.Pending || x.state === ProposalState.Approved);
              if (!open.length || s.status !== Status.Active) return null;
              const first = open[0];
              const needed = Math.ceil((s.params.approvalBps * first.data.eligibleVoters) / 10000);
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-mist px-5 py-4">
                  <div className="min-w-0 text-[14px]">
                    <div className="font-semibold text-ink">
                      {open.length === 1 ? "1 proposal needs the group" : `${open.length} proposals need the group`}
                    </div>
                    <div className="truncate text-ink-soft">
                      {first.data.kind === ProposalKind.Withdrawal ? `${toMusd(first.data.amount)} MUSD requested` : "Close the circle early"}
                      {first.data.reason ? `: "${first.data.reason}"` : ""}. {first.data.yesVotes} of {needed} yes votes.
                    </div>
                  </div>
                  <Button size="sm" variant="ink" onClick={() => setTab("votes")}>
                    Review
                  </Button>
                </div>
              );
            })()}
          </Panel>

          <div>
            <div className="border-b border-rule">
              <div
                role="tablist"
                aria-label="Circle details"
                className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const i = tabs.findIndex((x) => x.id === tab);
                  const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                  setTab(next.id);
                  document.getElementById(`tab-${next.id}`)?.focus();
                }}
              >
                {tabs.map((tb) => (
                  <button
                    key={tb.id}
                    role="tab"
                    id={`tab-${tb.id}`}
                    aria-selected={tab === tb.id}
                    aria-controls={`panel-${tb.id}`}
                    tabIndex={tab === tb.id ? 0 : -1}
                    onClick={() => setTab(tb.id)}
                    className={cx(
                      "border-b-2 px-4 py-3 text-[14px] font-semibold whitespace-nowrap transition-colors",
                      tab === tb.id ? "border-blue text-ink" : "border-transparent text-ink-soft hover:text-ink",
                    )}
                  >
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "ledger" &&
                (views.length ? (
                  <Ledger
                    rows={(rotating && started ? ordered : views).map((m) => ({
                      address: m.account,
                      paid: bits.paid.get(m.account) ?? 0n,
                      late: bits.late.get(m.account) ?? 0n,
                      missed: bits.missed.get(m.account) ?? 0n,
                      payoutRound: m.data.payoutRound || undefined,
                      exited: m.data.exited,
                      you: isMemberView(m.account),
                      contributed: m.data.contributed,
                    }))}
                    rounds={rounds}
                    currentRound={ringRound}
                    openUpTo={openUpTo}
                    settled={s.roundsSettled}
                    rotating={rotating}
                    started={started && s.status === Status.Active}
                    deadlines={started ? Array.from({ length: s.totalRounds }, (_, r) => roundDeadline(s, r)) : undefined}
                  />
                ) : (
                  <Empty title="The ledger starts when members join" />
                ))}
              {tab === "members" && <MembersTab s={s} members={views} user={user} />}
              {tab === "schedule" && <ScheduleTab s={s} members={views} paidBits={bits.paid} t={t} />}
              {tab === "votes" && <VotesTab s={s} pos={position.data} user={user} t={t} />}
              {tab === "activity" && <ActivityTab s={s} t={t} />}
              {tab === "rules" && <RulesTab s={s} />}
            </div>
          </div>
        </div>

        <div className="order-1 lg:sticky lg:top-24 lg:order-2">
          <ActionPanel
            s={s}
            members={views}
            paidBits={bits.paid}
            pos={position.data}
            user={user}
            t={t}
            hasInviteKey={!!inviteKey}
            onInvite={() => setInviteOpen(true)}
            onJoin={async () => {
              await join();
            }}
            joining={joining}
          />
        </div>
      </div>

      <InviteDialog s={s} user={user} open={inviteOpen} onClose={() => setInviteOpen(false)} inviteKey={inviteKey} onKey={setInviteKey} />
    </div>
  );
}

function LoadingView() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 h-12 w-2/3" />
      <Skeleton className="mt-4 h-5 w-1/3" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <Skeleton className="h-[380px] w-full rounded-[18px]" />
        <Skeleton className="h-[380px] w-full rounded-[18px]" />
      </div>
    </div>
  );
}

export type { Summary };
