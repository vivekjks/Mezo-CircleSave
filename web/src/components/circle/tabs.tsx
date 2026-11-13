"use client";

import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { ExternalLink } from "lucide-react";
import { useReadContract } from "wagmi";
import {
  ActivityKind,
  ADDR,
  circleGovernorAbi,
  Model,
  ProposalKind,
  ProposalState,
  savingsCircleAbi,
  Status,
  ZERO,
  type MemberView,
  type Position,
  type ProposalView,
  type Summary,
} from "@/lib/contracts";
import { hasBit, maturity, MODEL_INFO, proposalStateLabel, roundDeadline, targetAmount } from "@/lib/circle-logic";
import { bpsToPercent, durationLabel, formatDate, pct, periodLabel, relativeTime, shortAddress, toMusd } from "@/lib/format";
import { useActivities, useActivityTxs, useProposals, useTx } from "@/lib/hooks";
import { explorerAddress, explorerTx } from "@/lib/wagmi";
import { AddressLink, MemberMark, Musd } from "@/components/identity";
import { Button, Chip, Empty, Progress, Skeleton, cx } from "@/components/ui";

// ───────────────────────────────────────────── members

export function MembersTab({ s, members, user }: { s: Summary; members: readonly MemberView[]; user?: Address }) {
  const { send, busy } = useTx();
  const isCreator = !!user && s.creator.toLowerCase() === user.toLowerCase();
  const rotating = s.params.model === Model.Rotating;
  if (!members.length) return <Empty title="No members yet">Share the invite link to bring your group in.</Empty>;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-rule bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-[13px] text-ink-soft">
            <th className="px-5 py-3 font-semibold">Member</th>
            <th className="px-3 py-3 font-semibold">Joined</th>
            <th className="px-3 py-3 text-right font-semibold">Paid in</th>
            <th className="px-3 py-3 text-right font-semibold">Received</th>
            {rotating && <th className="px-3 py-3 text-right font-semibold">Deposit</th>}
            <th className="px-3 py-3 font-semibold">Record</th>
            {rotating && <th className="px-3 py-3 font-semibold">Turn</th>}
            {isCreator && s.status === Status.Open && <th className="px-3 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {members.map((m) => {
            const d = m.data;
            const you = user && m.account.toLowerCase() === user.toLowerCase();
            const creator = m.account.toLowerCase() === s.creator.toLowerCase();
            return (
              <tr key={m.account} className={cx(d.exited && "opacity-60")}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <MemberMark address={m.account} size={30} />
                    <div>
                      <AddressLink address={m.account} you={user} className="text-ink" />
                      <div className="text-[12px] text-ink-faint">
                        {creator ? "Started the circle" : d.exited ? "Left early" : `Member #${d.index + 1}`}
                        {d.debt > 0n && <span className="text-ink">, owes {toMusd(d.debt)} MUSD</span>}
                      </div>
                    </div>
                    {you && <Chip tone="sky">You</Chip>}
                  </div>
                </td>
                <td className="px-3 py-3 text-ink-soft">{formatDate(d.joinedAt, false)}</td>
                <td className="tabular px-3 py-3 text-right text-ink">{toMusd(d.contributed)}</td>
                <td className="tabular px-3 py-3 text-right text-ink">{toMusd(d.received)}</td>
                {rotating && <td className="tabular px-3 py-3 text-right text-ink">{toMusd(d.collateral)}</td>}
                <td className="px-3 py-3 text-[13px] text-ink-soft">
                  <span className="text-blue">{d.paidCount - d.lateCount} on time</span>
                  {d.lateCount > 0 && <span className="text-blue">, {d.lateCount} late</span>}
                  {d.missedCount > 0 && <span className="text-ink">, {d.missedCount} missed</span>}
                </td>
                {rotating && (
                  <td className="px-3 py-3 text-[13px]">
                    {d.payoutRound ? (
                      d.payoutRound <= s.roundsSettled ? (
                        <span className="text-ink-soft">Paid in round {d.payoutRound}</span>
                      ) : (
                        <span className="font-semibold text-ink">Round {d.payoutRound}</span>
                      )
                    ) : (
                      <span className="text-ink-faint">At start</span>
                    )}
                  </td>
                )}
                {isCreator && s.status === Status.Open && (
                  <td className="px-3 py-3 text-right">
                    {!creator && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `rm-${m.account}`}
                        onClick={() => send(`rm-${m.account}`, "Remove member", { address: s.circle, abi: savingsCircleAbi, functionName: "removeMember", args: [m.account] }, { success: "Member removed and deposit returned" })}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────── schedule / progress

export function ScheduleTab({ s, members, paidBits, t }: { s: Summary; members: readonly MemberView[]; paidBits: Map<string, bigint>; t: number }) {
  const started = s.status !== Status.Open && s.startTime > 0n;
  if (s.params.model === Model.Rotating) {
    const order = [...members].filter((m) => m.data.payoutRound > 0).sort((a, b) => a.data.payoutRound - b.data.payoutRound);
    if (!started || !order.length)
      return (
        <Empty title="The payout order is set when the circle starts">
          {s.params.payoutOrder === 2 ? "The creator sets the order before starting. Members can leave with a full refund if they disagree." : "Members are paid in the order they joined."}
        </Empty>
      );
    return (
      <ol className="divide-y divide-rule overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-surface">
        {order.map((m, r) => {
          const paid = members.filter((x) => hasBit(paidBits.get(x.account) ?? 0n, r)).length;
          const done = r < s.roundsSettled;
          const current = r === s.roundsSettled && s.status === Status.Active;
          return (
            <li key={m.account} className={cx("grid grid-cols-[64px_1fr_auto] items-center gap-4 px-5 py-3.5", current && "bg-mist")}>
              <span className="font-display text-lg text-ink">Round {r + 1}</span>
              <div className="flex min-w-0 items-center gap-3">
                <MemberMark address={m.account} size={28} />
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    <AddressLink address={m.account} profile={false} /> takes the pot
                  </div>
                  <div className="text-[13px] text-ink-soft">
                    Deadline {formatDate(roundDeadline(s, r))}
                    {current && ` (${relativeTime(roundDeadline(s, r), t)})`}
                  </div>
                </div>
              </div>
              <div className="text-right text-[13px]">
                {done ? (
                  <Chip tone="marigold">Paid out</Chip>
                ) : current ? (
                  <Chip tone="sky">{paid}/{s.memberCount} paid</Chip>
                ) : (
                  <span className="text-ink-faint">Upcoming</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  const target = targetAmount(s);
  const rounds = s.status === Status.Open ? s.params.totalRounds : s.totalRounds;
  const perRound = Array.from({ length: rounds }, (_, r) => members.filter((m) => hasBit(paidBits.get(m.account) ?? 0n, r)).length);
  const maxCount = Math.max(1, s.memberCount);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="rounded-[var(--radius-panel)] border border-rule bg-surface p-6">
        <div className="text-[13px] text-ink-soft">{s.params.model === Model.Goal ? "Toward the goal" : "Saved so far"}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular font-display text-[34px] text-ink">{toMusd(s.totalContributed, 0)}</span>
          <span className="text-ink-soft">of {toMusd(target, 0)} MUSD</span>
        </div>
        <Progress className="mt-4" value={pct(s.totalContributed, target)} label="Savings progress" />
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-soft">In the pool now</dt>
            <dd className="tabular font-semibold text-ink">{toMusd(s.poolBalance)} MUSD</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Paid out</dt>
            <dd className="tabular font-semibold text-ink">{toMusd(s.totalPaidOut)} MUSD</dd>
          </div>
          {started && (
            <div className="col-span-2">
              <dt className="text-ink-soft">{s.params.model === Model.Goal ? "Deadline" : "Ends"}</dt>
              <dd className="font-semibold text-ink">
                {formatDate(maturity(s))} ({relativeTime(maturity(s), t)})
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div className="rounded-[var(--radius-panel)] border border-rule bg-surface p-6">
        <div className="text-[13px] font-semibold text-ink-soft">Members paid per round</div>
        <div className="mt-5 flex h-40 items-end gap-1.5" role="img" aria-label="Number of members who paid in each round">
          {perRound.map((n, r) => {
            const isCurrent = started && r === s.currentRound;
            return (
              <div key={r} className="group relative flex h-full flex-1 flex-col justify-end" title={`Round ${r + 1}: ${n} of ${s.memberCount} paid`}>
                <div
                  className={cx("w-full rounded-t-[4px] transition-all", isCurrent ? "bg-blue" : r < s.currentRound || !started ? "bg-blue" : "bg-ink/10")}
                  style={{ height: `${Math.max(3, (n / maxCount) * 100)}%` }}
                />
                {rounds <= 16 && <div className="mt-1.5 text-center text-[11px] text-ink-faint">{r + 1}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── votes

export function VotesTab({ s, pos, user, t }: { s: Summary; pos?: Position; user?: Address; t: number }) {
  const { data, isLoading } = useProposals(s.circle, user);
  const { send, busy } = useTx();
  const upToDate = useReadContract({
    address: s.circle,
    abi: savingsCircleAbi,
    functionName: "isUpToDate",
    args: user ? [user] : undefined,
    query: { enabled: !!user && s.params.model !== Model.Rotating, refetchInterval: 15_000 },
  });
  if (s.params.model === Model.Rotating) return null;
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data?.length)
    return (
      <Empty title="No proposals yet">
        {s.params.model === Model.Emergency
          ? "When a member needs help, their request and the group's votes appear here."
          : "Members can propose closing the circle early. Proposals and votes appear here."}
      </Empty>
    );
  const canVote = !!pos?.isMember && !pos.member.exited && s.status === Status.Active && upToDate.data !== false;
  const behind = !!pos?.isMember && !pos.member.exited && s.status === Status.Active && upToDate.data === false;
  return (
    <ul className="space-y-4">
      {behind && (
        <li className="rounded-[var(--radius-panel)] border border-ink px-5 py-4 text-[14px] text-ink">
          You&apos;re behind on your rounds, so you can&apos;t vote right now. Pay what&apos;s overdue to get your say back.
        </li>
      )}
      {data.map((p: ProposalView) => {
        const st = proposalStateLabel(p.state);
        const d = p.data;
        const own = !!user && d.proposer.toLowerCase() === user.toLowerCase();
        const isWithdrawal = d.kind === ProposalKind.Withdrawal;
        const needed = Math.ceil((s.params.approvalBps * d.eligibleVoters) / 10000);
        const eligible = canVote && !(own && isWithdrawal);
        return (
          <li key={p.id.toString()} className="rounded-[var(--radius-panel)] border border-rule bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">
                  {isWithdrawal ? <>Request for <Musd value={d.amount} /></> : "Close the circle early"}
                </div>
                <div className="mt-0.5 text-[13px] text-ink-soft">
                  Proposal {Number(p.id) + 1} by <AddressLink address={d.proposer} you={user} />, {relativeTime(Number(d.createdAt), t)}
                </div>
              </div>
              <Chip tone={st.tone} dot>
                {st.label}
              </Chip>
            </div>
            {d.reason && <p className="mt-3 border-l-2 border-blue pl-4 text-[15px] text-ink">&ldquo;{d.reason}&rdquo;</p>}
            <div className="mt-4">
              <div className="relative flex h-2.5 overflow-hidden rounded-full bg-ink/[0.08]">
                <span className="bg-blue" style={{ width: `${(d.yesVotes / Math.max(1, d.eligibleVoters)) * 100}%` }} />
                <span className="bg-ink" style={{ width: `${(d.noVotes / Math.max(1, d.eligibleVoters)) * 100}%` }} />
                <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(needed / Math.max(1, d.eligibleVoters)) * 100}%` }} aria-hidden />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px] text-ink-soft">
                <span>
                  {d.yesVotes} yes, {d.noVotes} no of {d.eligibleVoters} {d.eligibleVoters === 1 ? "voter" : "voters"}. Needs {needed} yes.
                </span>
                {p.state === ProposalState.Pending && <span>Voting closes {relativeTime(Number(d.deadline), t)}</span>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.state === ProposalState.Pending && eligible && p.viewerVote === 0 && (
                <>
                  <Button size="sm" variant="ink" loading={busy === `y-${p.id}`} onClick={() => send(`y-${p.id}`, "Vote yes", { address: ADDR.governor, abi: circleGovernorAbi, functionName: "vote", args: [s.circle, p.id, true] }, { success: "Vote recorded" })}>
                    Vote yes
                  </Button>
                  <Button size="sm" loading={busy === `n-${p.id}`} onClick={() => send(`n-${p.id}`, "Vote no", { address: ADDR.governor, abi: circleGovernorAbi, functionName: "vote", args: [s.circle, p.id, false] }, { success: "Vote recorded" })}>
                    Vote no
                  </Button>
                </>
              )}
              {p.viewerVote !== 0 && <span className="text-[13px] font-semibold text-ink-soft">You voted {p.viewerVote === 1 ? "yes" : "no"}.</span>}
              {own && isWithdrawal && p.state === ProposalState.Pending && <span className="text-[13px] text-ink-soft">The rest of the group is voting on your request.</span>}
              {p.state === ProposalState.Approved && s.status === Status.Active && (
                <Button size="sm" variant="primary" loading={busy === `x-${p.id}`} onClick={() => send(`x-${p.id}`, "Carry out proposal", { address: ADDR.governor, abi: circleGovernorAbi, functionName: "execute", args: [s.circle, p.id] }, { success: isWithdrawal ? "Funds sent" : "Circle closed" })}>
                  {isWithdrawal ? `Send ${toMusd(d.amount)} MUSD` : "Close the circle"}
                </Button>
              )}
              {own && (p.state === ProposalState.Pending || p.state === ProposalState.Approved) && s.status === Status.Active && (
                <Button size="sm" variant="ghost" loading={busy === `c-${p.id}`} onClick={() => send(`c-${p.id}`, "Withdraw proposal", { address: ADDR.governor, abi: circleGovernorAbi, functionName: "cancel", args: [s.circle, p.id] })}>
                  Withdraw
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────────────────────── activity

function describe(kind: number, actor: string, round: number, amount: bigint, s: Summary): React.ReactNode {
  const who = <AddressLink address={actor} />;
  const m = (v: bigint) => <Musd value={v} className="font-semibold" />;
  switch (kind) {
    case ActivityKind.Created:
      return <>{who} created the circle</>;
    case ActivityKind.Joined:
      return amount > 0n ? <>{who} joined and paid a {m(amount)} deposit</> : <>{who} joined</>;
    case ActivityKind.Left:
      return <>{who} left{amount > 0n && <> and got {m(amount)} back</>}</>;
    case ActivityKind.Removed:
      return <>{who} was removed by the creator</>;
    case ActivityKind.Started:
      return <>{who} started the circle with {amount.toString()} members</>;
    case ActivityKind.Contributed:
      return <>{who} paid round {round + 1}: {m(amount)}</>;
    case ActivityKind.Missed:
      return amount > 0n ? <>{who} missed round {round + 1}. {m(amount)} covered from their deposit</> : <>{who} missed round {round + 1}</>;
    case ActivityKind.Payout:
      return s.params.model === Model.Rotating ? <>{who} received the round {round + 1} pot: {m(amount)}</> : <>{who} received the pot: {m(amount)}</>;
    case ActivityKind.GoalReached:
      return <>The goal was reached with {m(amount)} saved</>;
    case ActivityKind.Withdrawn:
      return <>{who} withdrew {m(amount)}</>;
    case ActivityKind.Claimed:
      return <>{who} collected {m(amount)}</>;
    case ActivityKind.ExitedEarly:
      return <>{who} left early and took back {m(amount)}</>;
    case ActivityKind.ProposalCreated:
      return amount > 0n ? <>{who} asked the group for {m(amount)} (proposal {round + 1})</> : <>{who} proposed closing the circle early (proposal {round + 1})</>;
    case ActivityKind.Voted:
      return <>{who} voted {amount === 1n ? "yes" : "no"} on proposal {round + 1}</>;
    case ActivityKind.ProposalExecuted:
      return amount > 0n ? <>Proposal {round + 1} approved: {who} received {m(amount)}</> : <>Proposal {round + 1} was carried out</>;
    case ActivityKind.Completed:
      return <>The circle finished with {m(amount)} paid out</>;
    case ActivityKind.Cancelled:
      return <>{who} cancelled the circle</>;
    case ActivityKind.DebtRepaid:
      return <>{who} repaid {m(amount)} for missed rounds</>;
    case ActivityKind.TopUp:
      return <>{who} added {m(amount)} extra</>;
    default:
      return "Activity";
  }
}

const KIND_DOT: Record<number, string> = {
  [ActivityKind.Contributed]: "bg-blue",
  [ActivityKind.TopUp]: "bg-blue",
  [ActivityKind.DebtRepaid]: "bg-blue",
  [ActivityKind.Payout]: "bg-blue",
  [ActivityKind.Claimed]: "bg-blue",
  [ActivityKind.Withdrawn]: "bg-blue",
  [ActivityKind.ProposalExecuted]: "bg-blue",
  [ActivityKind.GoalReached]: "bg-blue",
  [ActivityKind.Missed]: "bg-ink",
  [ActivityKind.Cancelled]: "bg-ink",
  [ActivityKind.ExitedEarly]: "bg-ink",
  [ActivityKind.ProposalCreated]: "bg-blue",
  [ActivityKind.Voted]: "bg-blue",
};

export function ActivityTab({ s, t }: { s: Summary; t: number }) {
  const [limit, setLimit] = useState(25);
  const { data, isLoading } = useActivities(s.circle, limit);
  const entries = data ? data[0].map((a, i) => ({ a, index: data[1][i] })) : [];
  const txs = useActivityTxs(s.circle, entries.map((e) => ({ index: e.index, block: e.a.blockNumber })));
  const total = data ? Number(data[2]) : 0;

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="rounded-[var(--radius-panel)] border border-rule bg-surface">
      <ol className="divide-y divide-rule">
        {entries.map(({ a, index }) => {
          const hash = txs.data?.[index.toString()];
          return (
            <li key={index.toString()} className="grid grid-cols-[14px_1fr_auto] items-start gap-3 px-5 py-3.5">
              <span className={cx("mt-1.5 size-2.5 rounded-full", KIND_DOT[a.kind] ?? "bg-ink/25")} aria-hidden />
              <div className="text-[15px] text-ink">{describe(a.kind, a.actor, a.round, a.amount, s)}</div>
              <div className="text-right text-[12px] whitespace-nowrap text-ink-soft">
                <div title={formatDate(a.timestamp)}>{relativeTime(Number(a.timestamp), t)}</div>
                {hash ? (
                  <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 link-quiet">
                    {hash.slice(0, 8)}… <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-ink-faint">block {a.blockNumber.toString()}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {total > entries.length && (
        <div className="border-t border-rule p-3 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 25)}>
            Show older activity ({total - entries.length} more)
          </Button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── rules

export function RulesTab({ s }: { s: Summary }) {
  const p = s.params;
  const rotating = p.model === Model.Rotating;
  const rows: [string, React.ReactNode][] = [
    ["Savings model", MODEL_INFO[p.model].name],
    ["Each member pays", <><Musd value={p.contributionAmount} /> {periodLabel(p.periodDuration)}</>],
    ["Members", `Up to ${p.maxMembers}`],
    ["Rounds", rotating ? "One per member" : `${p.totalRounds} (${durationLabel(p.totalRounds * p.periodDuration)})`],
    ["Joining closes", formatDate(p.joinDeadline)],
    ["Who can join", p.inviteSigner !== ZERO ? "People with the invite link" : "Anyone"],
  ];
  if (rotating) {
    rows.push(["Deposit", p.collateralAmount > 0n ? <><Musd value={p.collateralAmount} />, returned at the end</> : "None"]);
    rows.push(["Payout order", p.payoutOrder === 2 ? "Set by the creator before starting" : "Join order"]);
  } else {
    rows.push(["Approval threshold", `${bpsToPercent(p.approvalBps)} of members, ${durationLabel(p.votingPeriod)} to vote`]);
  }
  if (p.model === Model.Goal) {
    rows.push(["Goal", <Musd key="g" value={targetAmount(s)} />]);
    rows.push(["Goal paid to", p.beneficiary !== ZERO ? <AddressLink key="b" address={p.beneficiary} /> : "Members, by what each paid in"]);
  }
  if (p.model === Model.FixedTerm) rows.push(["Early exit penalty", bpsToPercent(p.earlyExitPenaltyBps)]);
  rows.push(["Fee", `${bpsToPercent(s.feeBps)} of payouts, fixed for this circle. Refunds are free.`]);
  rows.push(["Created", formatDate(s.createdAt)]);
  if (p.parent !== ZERO) rows.push(["Previous round", <Link key="p" className="link-quiet" href={`/circle/${p.parent}`}>{shortAddress(p.parent)}</Link>]);
  rows.push([
    "Contract",
    <a key="c" className="tabular inline-flex items-center gap-1 link-quiet" href={explorerAddress(s.circle)} target="_blank" rel="noreferrer">
      {s.circle} <ExternalLink className="size-3" />
    </a>,
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-[var(--radius-panel)] border border-rule bg-surface p-6">
        <h3 className="font-display text-xl text-ink">Group rules</h3>
        <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-ink">{s.meta.rules || "No extra rules were written for this circle."}</p>
        <h4 className="mt-6 text-sm font-semibold text-ink">How the contract handles problems</h4>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{MODEL_INFO[p.model].rule}</p>
        {rotating && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            If a deposit runs out, the missed amount becomes that member&apos;s debt. It&apos;s taken from their own payout
            and returned to whoever came up short.
          </p>
        )}
      </div>
      <dl className="divide-y divide-rule rounded-[var(--radius-panel)] border border-rule bg-surface px-6 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[150px_1fr] gap-4 py-3">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
