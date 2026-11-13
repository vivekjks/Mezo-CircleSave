import type { Address } from "viem";
import { Model, ProposalKind, ProposalState, Status, type Position, type ProposalView, type Summary } from "./contracts";
import { relativeTime, toMusd } from "./format";

export type ModelId = (typeof Model)[keyof typeof Model];

export const MODEL_INFO: Record<
  number,
  { name: string; short: string; blurb: string; bestFor: string; rule: string }
> = {
  [Model.Rotating]: {
    name: "Rotating circle",
    short: "Rotating",
    blurb: "Everyone pays in each round and one member takes the whole pot, until everyone has had a turn.",
    bestFor: "Friends, families and community groups",
    rule: "Collateral covers a missed payment, so the person whose turn it is still gets paid.",
  },
  [Model.Goal]: {
    name: "Goal savings",
    short: "Goal",
    blurb: "Save toward one shared target. Once it's reached the pot goes to a chosen recipient, or back to each member.",
    bestFor: "Trips, events and shared purchases",
    rule: "If the deadline passes before the goal, everyone is refunded with no fee.",
  },
  [Model.FixedTerm]: {
    name: "Fixed-term savings",
    short: "Fixed term",
    blurb: "Money stays locked until the end date, then everyone takes back their share.",
    bestFor: "Groups that want saving to stick",
    rule: "Leaving early costs a penalty that is shared by the members who stay.",
  },
  [Model.Emergency]: {
    name: "Emergency pool",
    short: "Emergency",
    blurb: "A shared safety net. A member asks for help and the group votes before any money moves.",
    bestFor: "Families and close communities",
    rule: "Withdrawals need a majority vote. Whatever is left is returned at the end.",
  },
};

export type Tone = "sky" | "jade" | "marigold" | "margin" | "ink";

export function statusInfo(s: Summary): { label: string; tone: Tone } {
  switch (s.status) {
    case Status.Open:
      return { label: "Gathering members", tone: "sky" };
    case Status.Active:
      if (s.params.model === Model.Rotating) {
        return { label: `Round ${Math.min(s.roundsSettled + 1, s.totalRounds)} of ${s.totalRounds}`, tone: "jade" };
      }
      if (s.params.model === Model.Goal && s.goalReached) return { label: "Goal reached", tone: "marigold" };
      return { label: "In progress", tone: "jade" };
    case Status.Completed:
      return { label: s.refundMode ? "Closed with refunds" : "Completed", tone: "ink" };
    default:
      return { label: "Cancelled", tone: "margin" };
  }
}

export const now = () => Math.floor(Date.now() / 1000);

export function roundDeadline(s: Summary, round: number): number {
  return Number(s.startTime) + (round + 1) * s.params.periodDuration;
}

export function maturity(s: Summary): number {
  return Number(s.startTime) + s.totalRounds * s.params.periodDuration;
}

/** Rounds elapsed since start (uncapped), i.e. the highest round index currently payable. */
export function elapsedRounds(s: Summary, t = now()): number {
  if (!s.startTime) return 0;
  return Math.floor((t - Number(s.startTime)) / s.params.periodDuration);
}

/** Planned number of rounds before the circle starts. */
export function plannedRounds(s: Summary): number {
  if (s.status !== Status.Open) return s.totalRounds;
  return s.params.model === Model.Rotating ? s.params.maxMembers : s.params.totalRounds;
}

export function potPerRound(s: Summary): bigint {
  return s.params.contributionAmount * BigInt(s.memberCount);
}

/** What the group is aiming for, used for progress bars. */
export function targetAmount(s: Summary): bigint {
  if (s.params.model === Model.Goal) {
    if (s.goalAmount > 0n) return s.goalAmount;
    if (s.params.goalAmount > 0n) return s.params.goalAmount;
    return s.params.contributionAmount * BigInt(Math.max(s.memberCount, 1)) * BigInt(s.params.totalRounds);
  }
  const members = s.status === Status.Open ? s.params.maxMembers : s.memberCount;
  return s.params.contributionAmount * BigInt(members) * BigInt(plannedRounds(s));
}

export const hasBit = (bits: bigint, i: number) => ((bits >> BigInt(i)) & 1n) === 1n;

/** Rounds the member can still pay, oldest first. */
export function payableRounds(s: Summary, paidBits: bigint, t = now()): number[] {
  if (s.status !== Status.Active) return [];
  if (s.params.model === Model.Goal && s.goalReached) return [];
  const first = s.params.model === Model.Rotating ? s.roundsSettled : 0;
  const last = Math.min(elapsedRounds(s, t), s.totalRounds - 1);
  const out: number[] = [];
  for (let r = first; r <= last; r++) if (!hasBit(paidBits, r)) out.push(r);
  return out;
}

/** Remaining commitment if the member pays every outstanding and future round. */
export function remainingCommitment(s: Summary, paidBits: bigint): bigint {
  const rounds = plannedRounds(s);
  let unpaid = 0;
  for (let r = s.params.model === Model.Rotating ? s.roundsSettled : 0; r < rounds; r++) {
    if (!hasBit(paidBits, r)) unpaid++;
  }
  return s.params.contributionAmount * BigInt(unpaid);
}

export function canSettle(s: Summary, paidCountThisRound: number, t = now()): boolean {
  if (s.status !== Status.Active || s.params.model !== Model.Rotating) return false;
  if (s.roundsSettled >= s.totalRounds) return false;
  return paidCountThisRound >= s.memberCount || t > roundDeadline(s, s.roundsSettled);
}

export function canFinalize(s: Summary, t = now()): boolean {
  if (s.status !== Status.Active || s.params.model === Model.Rotating) return false;
  if (s.params.model === Model.Goal && s.goalReached) return true;
  return t >= maturity(s);
}

export function proposalStateLabel(state: number): { label: string; tone: Tone } {
  switch (state) {
    case ProposalState.Pending:
      return { label: "Voting open", tone: "sky" };
    case ProposalState.Approved:
      return { label: "Approved", tone: "jade" };
    case ProposalState.Rejected:
      return { label: "Rejected", tone: "margin" };
    case ProposalState.Expired:
      return { label: "Expired", tone: "ink" };
    case ProposalState.Executed:
      return { label: "Done", tone: "ink" };
    default:
      return { label: "Withdrawn", tone: "ink" };
  }
}

// ───────────────────────────────────────────── reminders

export type Task = {
  id: string;
  circle: Address;
  circleName: string;
  tone: "overdue" | "due" | "ready" | "good" | "vote" | "info";
  title: string;
  detail: string;
  at?: number;
};

export function deriveTasks(
  s: Summary,
  pos: Position | undefined,
  proposals: readonly ProposalView[] | undefined,
  user: Address | undefined,
  t = now(),
): Task[] {
  const tasks: Task[] = [];
  const name = s.meta.name;
  const base = { circle: s.circle, circleName: name };
  const isMember = pos?.isMember ?? false;
  const isCreator = user && s.creator.toLowerCase() === user.toLowerCase();
  const amount = toMusd(s.params.contributionAmount);

  if (s.status === Status.Open) {
    if (isCreator && s.memberCount >= 2) {
      tasks.push({ ...base, id: `${s.circle}-start`, tone: "ready", title: "Ready to start", detail: `${s.memberCount} of ${s.params.maxMembers} members have joined. Start the circle when your group is in.` });
    } else if (isMember) {
      tasks.push({ ...base, id: `${s.circle}-waiting`, tone: "info", title: "Waiting for members", detail: `${s.memberCount} of ${s.params.maxMembers} joined. Joining closes ${relativeTime(Number(s.params.joinDeadline), t)}.`, at: Number(s.params.joinDeadline) });
    }
  }

  if (s.status === Status.Active && isMember && pos && !pos.member.exited) {
    const due = payableRounds(s, pos.paidBits, t);
    if (due.length) {
      const r = due[0];
      const dl = roundDeadline(s, r);
      const overdue = dl < t;
      const more = due.length > 1 ? ` You have ${due.length} rounds to pay.` : "";
      tasks.push({
        ...base,
        id: `${s.circle}-pay-${r}`,
        tone: overdue ? "overdue" : "due",
        title: overdue ? `Round ${r + 1} payment is overdue` : `Round ${r + 1} payment due ${relativeTime(dl, t)}`,
        detail: `Pay ${amount} MUSD to stay on track.${more}`,
        at: dl,
      });
    }
    if (s.params.model === Model.Rotating && s.roundsSettled < s.totalRounds) {
      if (pos.member.payoutRound === s.roundsSettled + 1) {
        tasks.push({ ...base, id: `${s.circle}-next`, tone: "good", title: "You receive the next pot", detail: `Round ${s.roundsSettled + 1} pays out to you once everyone has paid or the deadline passes.`, at: roundDeadline(s, s.roundsSettled) });
      }
      if (t > roundDeadline(s, s.roundsSettled)) {
        tasks.push({ ...base, id: `${s.circle}-settle`, tone: "ready", title: `Round ${s.roundsSettled + 1} is ready to pay out`, detail: "Anyone in the group can trigger the payout now." });
      }
    }
    if (canFinalize(s, t)) {
      tasks.push({ ...base, id: `${s.circle}-final`, tone: "ready", title: s.goalReached ? "Goal reached, ready to release" : "Term has ended", detail: "Close the circle so members can collect their share." });
    }
    if (s.params.model === Model.Goal && !s.goalReached) {
      const target = targetAmount(s);
      if (target > 0n && s.totalContributed * 2n >= target) {
        tasks.push({ ...base, id: `${s.circle}-half`, tone: "info", title: "Past halfway to the goal", detail: `${toMusd(s.totalContributed)} of ${toMusd(target)} MUSD saved.` });
      }
    }
  }

  if (pos && pos.member.debt > 0n) {
    tasks.push({ ...base, id: `${s.circle}-debt`, tone: "overdue", title: `Repay ${toMusd(pos.member.debt)} MUSD`, detail: "Missed contributions are owed to the members whose pots came up short." });
  }
  if (pos && pos.claimableGross > 0n) {
    tasks.push({ ...base, id: `${s.circle}-claim`, tone: "good", title: `Collect ${toMusd(pos.claimableGross - pos.claimableFee)} MUSD`, detail: "Your share is ready to claim." });
  }
  if (pos && (s.status === Status.Completed || s.status === Status.Cancelled) && (pos.member.collateral > 0n || pos.reserveClaimable > 0n)) {
    tasks.push({ ...base, id: `${s.circle}-withdraw`, tone: "good", title: `Withdraw ${toMusd(pos.member.collateral + pos.reserveClaimable)} MUSD`, detail: "Your collateral is free to take back." });
  }
  if (proposals && user && s.status === Status.Active) {
    for (const p of proposals) {
      const own = p.data.proposer.toLowerCase() === user.toLowerCase();
      if (p.state === ProposalState.Pending && p.viewerVote === 0 && !(own && p.data.kind === ProposalKind.Withdrawal)) {
        tasks.push({ ...base, id: `${s.circle}-vote-${p.id}`, tone: "vote", title: p.data.kind === ProposalKind.Withdrawal ? `Vote on a ${toMusd(p.data.amount)} MUSD request` : "Vote on closing the circle", detail: p.data.reason || "A member is waiting for the group's decision.", at: Number(p.data.deadline) });
      }
      if (p.state === ProposalState.Approved) {
        tasks.push({ ...base, id: `${s.circle}-exec-${p.id}`, tone: "ready", title: "An approved proposal is ready", detail: "Carry it out so the funds move." });
      }
    }
  }
  return tasks;
}

const TONE_ORDER: Task["tone"][] = ["overdue", "vote", "due", "ready", "good", "info"];
export const sortTasks = (tasks: Task[]) =>
  [...tasks].sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone) || (a.at ?? 0) - (b.at ?? 0));

// ───────────────────────────────────────────── reputation

export function reputationScore(r: {
  onTimePayments: number;
  latePayments: number;
  missedPayments: number;
  circlesCompleted: number;
}): { score: number; label: string } {
  const total = r.onTimePayments + r.latePayments + r.missedPayments;
  if (total === 0) return { score: 0, label: "No history yet" };
  const reliability = (r.onTimePayments + r.latePayments * 0.5) / total;
  const experience = Math.min(1, (total + r.circlesCompleted * 3) / 30);
  const score = Math.round(300 + reliability * 550 + experience * 150);
  const label = score >= 820 ? "Excellent" : score >= 700 ? "Reliable" : score >= 560 ? "Building trust" : "Needs care";
  return { score, label };
}
