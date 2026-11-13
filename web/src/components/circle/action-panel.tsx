"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { CalendarPlus, LogOut, Share2 } from "lucide-react";
import { savingsCircleAbi, circleGovernorAbi, ADDR, Model, Status, ProposalKind, type MemberView, type Position, type Summary } from "@/lib/contracts";
import { canFinalize, canSettle, maturity, payableRounds, remainingCommitment, roundDeadline } from "@/lib/circle-logic";
import { bpsToPercent, formatDate, parseMusd, relativeTime, shortAddress, toMusd } from "@/lib/format";
import { useMusdSpend, useTx } from "@/lib/hooks";
import { downloadIcs } from "@/lib/ics";
import { ConnectButton } from "@/components/wallet";
import { AmountInput, Button, Dialog, Field, Panel, cx, inputClass } from "@/components/ui";
import { Musd } from "@/components/identity";

type Props = {
  s: Summary;
  members: readonly MemberView[];
  paidBits: Map<string, bigint>;
  pos?: Position;
  user?: Address;
  t: number;
  hasInviteKey: boolean;
  onInvite: () => void;
  onJoin: () => Promise<void>;
  joining: boolean;
};

export function ActionPanel(props: Props) {
  const { s, pos, user, onInvite } = props;
  const isMember = !!pos?.isMember;
  const isCreator = !!user && s.creator.toLowerCase() === user.toLowerCase();

  return (
    <Panel as="aside" className="p-6" aria-label="Your actions">
      <h2 className="text-base font-semibold text-ink">{isMember ? "Your place in this circle" : "Take part"}</h2>
      {isMember && pos && s.status !== Status.Open && (
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-rule bg-rule text-[13px]">
          <div className="bg-white px-3 py-2.5">
            <dt className="text-ink-soft">Paid in</dt>
            <dd className="tabular font-semibold text-ink">{toMusd(pos.member.contributed)} MUSD</dd>
          </div>
          <div className="bg-white px-3 py-2.5">
            <dt className="text-ink-soft">Received</dt>
            <dd className="tabular font-semibold text-ink">{toMusd(pos.member.received)} MUSD</dd>
          </div>
          {s.params.model === Model.Rotating ? (
            <>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-ink-soft">Deposit held</dt>
                <dd className="tabular font-semibold text-ink">{toMusd(pos.member.collateral)} MUSD</dd>
              </div>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-ink-soft">Your turn</dt>
                <dd className="tabular font-semibold text-ink">{pos.member.payoutRound ? `Round ${pos.member.payoutRound}` : "At start"}</dd>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-ink-soft">Rounds paid</dt>
                <dd className="tabular font-semibold text-ink">{pos.member.paidCount} of {s.totalRounds}</dd>
              </div>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-ink-soft">Late or missed</dt>
                <dd className="tabular font-semibold text-ink">{pos.member.lateCount + pos.member.missedCount}</dd>
              </div>
            </>
          )}
        </dl>
      )}
      <div className="mt-4">
        {!user ? (
          <div>
            <p className="text-[15px] text-ink">Connect your wallet to join, pay your rounds and collect payouts.</p>
            <div className="mt-4">
              <ConnectButton variant="primary" />
            </div>
          </div>
        ) : s.status === Status.Open ? (
          <OpenActions {...props} isMember={isMember} isCreator={isCreator} />
        ) : s.status === Status.Active ? (
          <ActiveActions {...props} isMember={isMember} />
        ) : (
          <EndedActions {...props} isMember={isMember} />
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-rule pt-4">
        {(s.status === Status.Open || isMember) && (
          <button onClick={onInvite} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink">
            <Share2 className="size-3.5" /> Invite link
          </button>
        )}
        {s.status === Status.Active && (
          <button
            onClick={() => downloadIcs(s, window.location.href)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink"
          >
            <CalendarPlus className="size-3.5" /> Add deadlines to calendar
          </button>
        )}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────── open

function OpenActions({ s, user, t, isMember, isCreator, hasInviteKey, onJoin, joining, members }: Props & { isMember: boolean; isCreator: boolean }) {
  const { send, busy } = useTx();
  const circle = { address: s.circle, abi: savingsCircleAbi } as const;
  const isPrivate = s.params.inviteSigner !== "0x0000000000000000000000000000000000000000";
  const full = s.memberCount >= s.params.maxMembers;
  const closed = t > Number(s.params.joinDeadline);
  const spend = useMusdSpend();
  const [orderOpen, setOrderOpen] = useState(false);

  return (
    <div className="space-y-4">
      {isMember ? (
        <>
          <p className="text-[15px] text-ink">
            You&apos;re in.{" "}
            {full
              ? "The circle is full and ready to start."
              : `Waiting for ${s.params.maxMembers - s.memberCount} more ${s.params.maxMembers - s.memberCount === 1 ? "member" : "members"}.`}
          </p>
          {s.params.collateralAmount > 0n && (
            <p className="text-sm text-ink-soft">
              Your <Musd value={s.params.collateralAmount} /> deposit is held by the contract.
            </p>
          )}
        </>
      ) : closed ? (
        <p className="text-[15px] text-ink">Joining closed {relativeTime(Number(s.params.joinDeadline), t)}.</p>
      ) : full ? (
        <p className="text-[15px] text-ink">This circle is full.</p>
      ) : isPrivate && !hasInviteKey && !isCreator ? (
        <p className="text-[15px] text-ink">This circle is invite only. Ask the person who started it for the invite link.</p>
      ) : (
        <>
          <p className="text-[15px] text-ink">
            Join to save <Musd value={s.params.contributionAmount} className="font-semibold" /> each round with this group.
            {s.params.collateralAmount > 0n && (
              <>
                {" "}
                You&apos;ll pay a <Musd value={s.params.collateralAmount} /> refundable deposit now.
              </>
            )}
          </p>
          {s.params.collateralAmount > 0n && !spend.hasBalance(s.params.collateralAmount) && <LowBalance />}
          <Button variant="primary" size="lg" className="w-full" loading={joining || spend.approving} onClick={onJoin}>
            {s.params.collateralAmount > 0n && spend.needsApproval(s.params.collateralAmount) ? "Approve MUSD and join" : "Join circle"}
          </Button>
          <p className="text-xs text-ink-faint">By joining you agree to the rules on this page. They can&apos;t be changed later.</p>
        </>
      )}

      {isCreator && (
        <div className="space-y-2 border-t border-rule pt-4">
          {s.params.model === Model.Rotating && s.params.payoutOrder === 2 && (
            <Button className="w-full" onClick={() => setOrderOpen(true)} disabled={s.memberCount < 2}>
              Set payout order
            </Button>
          )}
          <Button
            variant="ink"
            className="w-full"
            disabled={s.memberCount < 2}
            loading={busy === "start"}
            onClick={() => send("start", "Start the circle", { ...circle, functionName: "start" }, { success: "Circle started. Round 1 is open." })}
          >
            Start circle with {s.memberCount} {s.memberCount === 1 ? "member" : "members"}
          </Button>
          {s.memberCount < 2 && <p className="text-xs text-ink-soft">A circle needs at least 2 members to start.</p>}
        </div>
      )}
      {!isCreator && isMember && full && (
        <Button variant="ink" className="w-full" loading={busy === "start"} onClick={() => send("start", "Start the circle", { ...circle, functionName: "start" })}>
          Start circle
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        {isMember && !isCreator && (
          <Button size="sm" variant="ghost" icon={<LogOut className="size-3.5" />} loading={busy === "leave"} onClick={() => send("leave", "Leave circle", { ...circle, functionName: "leave" }, { success: "You left the circle. Your deposit was returned." })}>
            Leave and get deposit back
          </Button>
        )}
        {(isCreator || closed) && (
          <Button size="sm" variant="danger" loading={busy === "cancel"} onClick={() => send("cancel", "Cancel circle", { ...circle, functionName: "cancel" }, { success: "Circle cancelled. Members can withdraw their deposits." })}>
            Cancel circle
          </Button>
        )}
      </div>
      {orderOpen && <PayoutOrderDialog s={s} members={members} onClose={() => setOrderOpen(false)} user={user} />}
    </div>
  );
}

function PayoutOrderDialog({ s, members, onClose }: { s: Summary; members: readonly MemberView[]; onClose: () => void; user?: Address }) {
  const [order, setOrder] = useState<Address[]>(() =>
    [...members].sort((a, b) => (a.data.payoutRound || 99) - (b.data.payoutRound || 99)).map((m) => m.account),
  );
  const { send, busy } = useTx();
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <Dialog open onClose={onClose} title="Payout order">
      <p className="-mt-2 mb-4 text-sm text-ink-soft">Round 1 pays the person at the top. Share the order with your group before starting.</p>
      <ol className="space-y-2">
        {order.map((a, i) => (
          <li key={a} className="flex items-center gap-3 rounded-[10px] border border-rule px-3 py-2">
            <span className="tabular w-16 text-sm text-ink-soft">Round {i + 1}</span>
            <span className="tabular flex-1 font-medium">{shortAddress(a, 6)}</span>
            <button className="rounded px-2 py-1 text-ink-soft hover:bg-ink/5" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
              ↑
            </button>
            <button className="rounded px-2 py-1 text-ink-soft hover:bg-ink/5" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === order.length - 1}>
              ↓
            </button>
          </li>
        ))}
      </ol>
      <Button
        variant="ink"
        className="mt-5 w-full"
        loading={busy === "order"}
        onClick={async () => {
          const r = await send("order", "Save payout order", { address: s.circle, abi: savingsCircleAbi, functionName: "setPayoutOrder", args: [order] });
          if (r) onClose();
        }}
      >
        Save order
      </Button>
    </Dialog>
  );
}

// ───────────────────────────────────────────── active

function ActiveActions({ s, pos, t, isMember, members, paidBits, user }: Props & { isMember: boolean }) {
  const { send, busy } = useTx();
  const spend = useMusdSpend();
  const circle = { address: s.circle, abi: savingsCircleAbi } as const;
  const [dialog, setDialog] = useState<null | "topup" | "exit" | "request" | "dissolve">(null);
  const rotating = s.params.model === Model.Rotating;
  const amount = s.params.contributionAmount;

  const paidThisRound = rotating ? members.filter((m) => ((paidBits.get(m.account) ?? 0n) >> BigInt(s.roundsSettled)) & 1n).length : 0;
  const settleable = canSettle(s, paidThisRound, t);
  const finalizable = canFinalize(s, t);
  const recipient = rotating ? members.find((m) => m.data.payoutRound === s.roundsSettled + 1) : undefined;

  const payable = pos && isMember && !pos.member.exited ? payableRounds(s, pos.paidBits, t) : [];
  const nextRound = payable[0];
  const remaining = pos ? remainingCommitment(s, pos.paidBits) : amount;

  const pay = async (round: number) => {
    if (spend.needsApproval(amount)) {
      const ok = await spend.approve(remaining > amount ? remaining : amount);
      if (!ok) return;
    }
    await send(`pay-${round}`, `Pay round ${round + 1}`, { ...circle, functionName: "contribute", args: [round] }, { success: `Round ${round + 1} paid` });
  };

  // next round this member still has to pay that isn't open yet
  let upcoming: number | undefined;
  if (pos && isMember) {
    for (let r = rotating ? s.roundsSettled : 0; r < s.totalRounds; r++) {
      if (!((pos.paidBits >> BigInt(r)) & 1n)) {
        upcoming = r;
        break;
      }
    }
  }
  const opensAt = (r: number) => Number(s.startTime) + r * s.params.periodDuration;
  return (
    <div className="space-y-4">
      {isMember && pos && !pos.member.exited && (
        <>
          {nextRound !== undefined ? (
            <div>
              <p className="text-[15px] text-ink">
                Round {nextRound + 1} payment{" "}
                {roundDeadline(s, nextRound) < t ? (
                  <span className="font-semibold text-ink">was due {relativeTime(roundDeadline(s, nextRound), t)}</span>
                ) : (
                  <>is due {relativeTime(roundDeadline(s, nextRound), t)}</>
                )}
                .
              </p>
              {payable.length > 1 && <p className="mt-1 text-sm text-ink-soft">You have {payable.length} rounds to pay. Oldest first.</p>}
              {!spend.hasBalance(amount) && <LowBalance />}
              <Button
                variant="primary"
                size="lg"
                className="mt-4 w-full"
                loading={busy === `pay-${nextRound}` || spend.approving}
                disabled={!spend.hasBalance(amount)}
                onClick={() => pay(nextRound)}
              >
                {spend.needsApproval(amount) ? "Approve and pay" : "Pay"} {toMusd(amount)} MUSD
              </Button>
              {spend.needsApproval(amount) && (
                <p className="mt-2 text-xs text-ink-faint">
                  First time only: your wallet approves {toMusd(remaining > amount ? remaining : amount)} MUSD for the rest of this circle, then pays.
                </p>
              )}
            </div>
          ) : upcoming !== undefined && !(s.params.model === Model.Goal && s.goalReached) ? (
            <p className="text-[15px] text-ink">
              You&apos;re paid up. Round {upcoming + 1} opens {relativeTime(opensAt(upcoming), t)}.
            </p>
          ) : (
            <p className="text-[15px] text-ink">You&apos;ve paid every round.</p>
          )}

          {rotating && pos.member.payoutRound > 0 && (
            <div className="rounded-[12px] border border-blue px-4 py-3 text-sm text-ink">
              {pos.member.payoutRound <= s.roundsSettled ? (
                <>
                  You received <Musd value={pos.member.received} className="font-semibold" /> in round {pos.member.payoutRound}.
                </>
              ) : pos.member.payoutRound === s.roundsSettled + 1 ? (
                <>
                  <strong>The pot is yours this round</strong>: about <Musd value={s.params.contributionAmount * BigInt(s.memberCount)} />, once everyone pays.
                </>
              ) : (
                <>
                  Your turn is round {pos.member.payoutRound}, around {formatDate(roundDeadline(s, pos.member.payoutRound - 1), false)}.
                </>
              )}
            </div>
          )}

          {pos.member.debt > 0n && (
            <div className="rounded-[12px] border border-ink p-4">
              <p className="text-sm text-ink">
                You owe <Musd value={pos.member.debt} className="font-semibold" /> from missed rounds your deposit couldn&apos;t cover.
              </p>
              <Button
                size="sm"
                variant="ink"
                className="mt-3"
                loading={busy === "repay"}
                onClick={async () => {
                  if (spend.needsApproval(pos.member.debt) && !(await spend.approve(pos.member.debt))) return;
                  await send("repay", "Repay missed rounds", { ...circle, functionName: "repayDebt" }, { success: "Thank you. The group has been made whole." });
                }}
              >
                Repay {toMusd(pos.member.debt)} MUSD
              </Button>
            </div>
          )}
        </>
      )}
      {pos?.member.exited && <p className="text-[15px] text-ink">You left this circle early and took back {toMusd(pos.member.received)} MUSD.</p>}
      {!isMember && <p className="text-[15px] text-ink">This circle is under way. You can follow along, but only members can pay in.</p>}

      {/* group-level actions that anyone can trigger */}
      {settleable && recipient && (
        <div className="rounded-[12px] border border-blue p-4">
          <p className="text-sm text-ink">
            Round {s.roundsSettled + 1} is ready to pay out to{" "}
            <strong>{recipient.account.toLowerCase() === user?.toLowerCase() ? "you" : shortAddress(recipient.account)}</strong>.
            {paidThisRound < s.memberCount && " Missed payments will be covered from deposits."}
          </p>
          <Button variant="ink" size="sm" className="mt-3" loading={busy === "settle"} onClick={() => send("settle", `Pay out round ${s.roundsSettled + 1}`, { ...circle, functionName: "settleRound" }, { success: "Payout sent" })}>
            Pay out round {s.roundsSettled + 1}
          </Button>
        </div>
      )}
      {finalizable && (
        <div className="rounded-[12px] border border-blue p-4">
          <p className="text-sm text-ink">
            {s.params.model === Model.Goal && s.goalReached
              ? s.params.beneficiary !== "0x0000000000000000000000000000000000000000"
                ? `The goal is reached. Closing sends the pot to ${shortAddress(s.params.beneficiary)}.`
                : "The goal is reached. Close the circle so everyone can collect their share."
              : `The term ended ${relativeTime(maturity(s), t)}. Close the circle so members can collect.`}
          </p>
          <Button variant="ink" size="sm" className="mt-3" loading={busy === "finalize"} onClick={() => send("finalize", "Close the circle", { ...circle, functionName: "finalize" }, { success: "Circle closed" })}>
            Close circle
          </Button>
        </div>
      )}

      {isMember && pos && !pos.member.exited && !rotating && (
        <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
          {!(s.params.model === Model.Goal && s.goalReached) && (
            <Button size="sm" onClick={() => setDialog("topup")}>
              Add extra
            </Button>
          )}
          {s.params.model === Model.Emergency && (
            <Button size="sm" onClick={() => setDialog("request")}>
              Ask the group for help
            </Button>
          )}
          {s.params.model === Model.FixedTerm && t < maturity(s) && (
            <Button size="sm" variant="ghost" onClick={() => setDialog("exit")}>
              Leave early
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDialog("dissolve")}>
            Propose closing early
          </Button>
        </div>
      )}

      {dialog === "topup" && <TopUpDialog s={s} onClose={() => setDialog(null)} />}
      {dialog === "exit" && pos && <ExitDialog s={s} pos={pos} onClose={() => setDialog(null)} />}
      {(dialog === "request" || dialog === "dissolve") && <ProposeDialog s={s} kind={dialog === "request" ? ProposalKind.Withdrawal : ProposalKind.Dissolve} onClose={() => setDialog(null)} />}
    </div>
  );
}

function TopUpDialog({ s, onClose }: { s: Summary; onClose: () => void }) {
  const [v, setV] = useState("");
  const { send, busy } = useTx();
  const spend = useMusdSpend();
  const amount = parseMusd(v);
  return (
    <Dialog open onClose={onClose} title="Add extra savings">
      <p className="-mt-2 mb-5 text-sm text-ink-soft">
        Extra MUSD counts toward {s.params.model === Model.Goal ? "the goal" : "your share"} and is returned with everything else at the end.
      </p>
      <Field label="Amount" htmlFor="topup">
        <AmountInput id="topup" value={v} onChange={setV} />
      </Field>
      <Button
        variant="primary"
        className="mt-5 w-full"
        size="lg"
        disabled={!amount || amount <= 0n || !spend.hasBalance(amount)}
        loading={busy === "topup" || spend.approving}
        onClick={async () => {
          if (!amount) return;
          if (spend.needsApproval(amount) && !(await spend.approve(amount))) return;
          const r = await send("topup", "Add extra savings", { address: s.circle, abi: savingsCircleAbi, functionName: "topUp", args: [amount] }, { success: "Extra savings added" });
          if (r) onClose();
        }}
      >
        Add {amount ? toMusd(amount) : ""} MUSD
      </Button>
      {amount && !spend.hasBalance(amount) ? <p className="mt-2 text-sm text-ink">That&apos;s more than your wallet holds.</p> : null}
    </Dialog>
  );
}

function ExitDialog({ s, pos, onClose }: { s: Summary; pos: Position; onClose: () => void }) {
  const { send, busy } = useTx();
  const penalty = (pos.member.contributed * BigInt(s.params.earlyExitPenaltyBps)) / 10000n;
  return (
    <Dialog open onClose={onClose} title="Leave before the end?">
      <dl className="space-y-2 text-[15px]">
        <div className="flex justify-between"><dt className="text-ink-soft">You&apos;ve paid in</dt><dd className="tabular font-medium">{toMusd(pos.member.contributed)} MUSD</dd></div>
        <div className="flex justify-between"><dt className="text-ink-soft">Penalty ({bpsToPercent(s.params.earlyExitPenaltyBps)})</dt><dd className="tabular font-medium text-ink">−{toMusd(penalty)} MUSD</dd></div>
        <div className="flex justify-between border-t border-rule pt-2"><dt className="font-semibold">You get back</dt><dd className="tabular font-semibold">{toMusd(pos.member.contributed - penalty)} MUSD</dd></div>
      </dl>
      <p className="mt-4 text-sm text-ink-soft">The penalty stays in the pool for the members who stay. You can&apos;t rejoin this circle afterwards.</p>
      <Button
        variant="danger"
        className="mt-5 w-full"
        loading={busy === "exit"}
        onClick={async () => {
          const r = await send("exit", "Leave early", { address: s.circle, abi: savingsCircleAbi, functionName: "exitEarly" }, { success: "You've left the circle" });
          if (r) onClose();
        }}
      >
        Leave and take {toMusd(pos.member.contributed - penalty)} MUSD
      </Button>
    </Dialog>
  );
}

function ProposeDialog({ s, kind, onClose }: { s: Summary; kind: number; onClose: () => void }) {
  const [v, setV] = useState("");
  const [reason, setReason] = useState("");
  const { send, busy } = useTx();
  const amount = parseMusd(v);
  const withdrawal = kind === ProposalKind.Withdrawal;
  const tooMuch = !!amount && amount > s.poolBalance;
  return (
    <Dialog open onClose={onClose} title={withdrawal ? "Ask the group for help" : "Propose closing early"}>
      <p className="-mt-2 mb-5 text-sm text-ink-soft">
        {withdrawal
          ? `The other members vote. If ${bpsToPercent(s.params.approvalBps)} approve, the MUSD is sent to you.`
          : `If ${bpsToPercent(s.params.approvalBps)} of members agree, the circle closes and everyone gets their share back with no fee.`}
      </p>
      <div className="space-y-4">
        {withdrawal && (
          <Field label="Amount" htmlFor="ask" hint={`The pool holds ${toMusd(s.poolBalance)} MUSD.`} error={tooMuch ? "That's more than the pool holds." : null}>
            <AmountInput id="ask" value={v} onChange={setV} />
          </Field>
        )}
        <Field label="Reason" htmlFor="reason" hint={`${reason.length}/280. Visible to everyone, stored on-chain.`}>
          <textarea id="reason" rows={3} maxLength={280} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={withdrawal ? "Hospital bill for my daughter" : "Plans changed and we'd rather stop here"} />
        </Field>
      </div>
      <Button
        variant="ink"
        className="mt-5 w-full"
        disabled={withdrawal && (!amount || amount <= 0n || tooMuch)}
        loading={busy === "propose"}
        onClick={async () => {
          const r = await send(
            "propose",
            withdrawal ? "Send your request" : "Send your proposal",
            { address: ADDR.governor, abi: circleGovernorAbi, functionName: "propose", args: [s.circle, kind, withdrawal ? amount! : 0n, reason] },
            { success: "Proposal sent to the group" },
          );
          if (r) onClose();
        }}
      >
        {withdrawal ? "Send request" : "Send proposal"}
      </Button>
    </Dialog>
  );
}

// ───────────────────────────────────────────── ended

function EndedActions({ s, pos, isMember }: Props & { isMember: boolean }) {
  const { send, busy } = useTx();
  const circle = { address: s.circle, abi: savingsCircleAbi } as const;
  const claimNet = pos ? pos.claimableGross - pos.claimableFee : 0n;
  const withdrawable = pos ? pos.member.collateral + pos.reserveClaimable : 0n;

  return (
    <div className="space-y-4">
      {s.status === Status.Cancelled ? (
        <p className="text-[15px] text-ink">This circle was cancelled before it started.</p>
      ) : (
        <p className="text-[15px] text-ink">
          This circle has finished.
          {isMember && pos && (
            <>
              {" "}You paid in <Musd value={pos.member.contributed} className="font-semibold" /> and received{" "}
              <Musd value={pos.member.received} className="font-semibold" />.
            </>
          )}
        </p>
      )}
      {claimNet > 0n && (
        <Action>
          <p className="text-sm text-ink">
            Your share is ready: <Musd value={claimNet} className="font-semibold" />
            {pos!.claimableFee > 0n && <span className="text-ink-soft"> after a {toMusd(pos!.claimableFee)} MUSD fee</span>}.
          </p>
          <Button variant="primary" className="mt-3 w-full" loading={busy === "claim"} onClick={() => send("claim", "Collect your share", { ...circle, functionName: "claim" }, { success: `${toMusd(claimNet)} MUSD collected` })}>
            Collect {toMusd(claimNet)} MUSD
          </Button>
        </Action>
      )}
      {withdrawable > 0n && (
        <Action>
          <p className="text-sm text-ink">
            {pos!.member.collateral > 0n && <>Your deposit of <Musd value={pos!.member.collateral} className="font-semibold" /> is free to withdraw. </>}
            {pos!.reserveClaimable > 0n && <><Musd value={pos!.reserveClaimable} className="font-semibold" /> repaid by members who missed rounds is yours.</>}
          </p>
          <Button variant="primary" className="mt-3 w-full" loading={busy === "withdraw"} onClick={() => send("withdraw", "Withdraw", { ...circle, functionName: "withdraw" }, { success: `${toMusd(withdrawable)} MUSD withdrawn` })}>
            Withdraw {toMusd(withdrawable)} MUSD
          </Button>
        </Action>
      )}
      {s.status === Status.Completed && (
        <Link href={`/create?from=${s.circle}`} className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius-control)] border border-ink/25 bg-surface text-sm font-semibold text-ink hover:border-ink/60">
          Start the next round with these settings
        </Link>
      )}
    </div>
  );
}

function Action({ children }: { children: ReactNode }) {
  return <div className={cx("rounded-[12px] border border-blue p-4")}>{children}</div>;
}

function LowBalance() {
  return (
    <p className="mt-2 text-sm text-ink">
      Your MUSD balance is too low.{" "}
      <Link href="/get-musd" className="link-quiet font-semibold">
        Get test MUSD
      </Link>
    </p>
  );
}
