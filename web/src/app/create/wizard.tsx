"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress, parseEventLogs, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useSignMessage } from "wagmi";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { ADDR, circleFactoryAbi, Model, PayoutOrder, ZERO } from "@/lib/contracts";
import { MODEL_INFO } from "@/lib/circle-logic";
import { bpsToPercent, durationLabel, parseMusd, periodLabel, toMusd } from "@/lib/format";
import { useCircle, useMounted, useMusdSpend, useTx } from "@/lib/hooks";
import { inviteKeyFromSignature, inviteKeyMessage, inviteSignerOf, rememberInviteKey } from "@/lib/invite";
import { humanizeError } from "@/lib/errors";
import { chain } from "@/lib/wagmi";
import { ModelArt } from "@/components/model-art";
import { ConnectButton } from "@/components/wallet";
import { AmountInput, Button, Field, Panel, Segmented, Toggle, cx, inputClass } from "@/components/ui";

type Form = {
  model: number;
  name: string;
  description: string;
  rules: string;
  contribution: string;
  period: number;
  maxMembers: number;
  totalRounds: number;
  joinWindow: number;
  collateral: string;
  payoutOrder: number;
  goalCustom: boolean;
  goalAmount: string;
  beneficiaryMode: "members" | "address";
  beneficiary: string;
  penaltyBps: number;
  approvalBps: number;
  votingPeriod: number;
  isPrivate: boolean;
  creatorJoins: boolean;
};

const RULES: Record<number, string> = {
  [Model.Rotating]:
    "Pay your share before each round's deadline. If you miss a round, your deposit covers it, and anything it can't cover comes out of your own payout. Tell the group early if you're going to be late.",
  [Model.Goal]:
    "We pay in every round until we reach the goal. Nobody withdraws before then. If we miss the deadline, everyone gets their money back.",
  [Model.FixedTerm]:
    "Money stays in until the end date. Leaving early is allowed but costs the penalty, which is shared by everyone who stays.",
  [Model.Emergency]:
    "Ask for help only for real emergencies and explain why in your request. Vote within the voting window. Whatever is left at the end is returned to everyone.",
};

const PERIODS = [
  { value: 600, label: "10 min", sub: "For trying it out" },
  { value: 86400, label: "Daily" },
  { value: 604800, label: "Weekly" },
  { value: 1209600, label: "2 weeks" },
  { value: 2592000, label: "Monthly", sub: "30 days" },
];

const JOIN_WINDOWS = [
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "1 day" },
  { value: 259200, label: "3 days" },
  { value: 604800, label: "1 week" },
];

const STEPS = ["Savings model", "Name and rules", "Money and schedule", "Safeguards", "Review"];

const initial: Form = {
  model: Model.Rotating,
  name: "",
  description: "",
  rules: RULES[Model.Rotating],
  contribution: "10",
  period: 604800,
  maxMembers: 5,
  totalRounds: 6,
  joinWindow: 259200,
  collateral: "10",
  payoutOrder: PayoutOrder.JoinOrder,
  goalCustom: false,
  goalAmount: "",
  beneficiaryMode: "members",
  beneficiary: "",
  penaltyBps: 500,
  approvalBps: 6000,
  votingPeriod: 172800,
  isPrivate: true,
  creatorJoins: true,
};

export function CreateWizard() {
  const router = useRouter();
  const search = useSearchParams();
  const fromParam = search.get("from");
  const parent = fromParam && isAddress(fromParam) ? (fromParam as Address) : undefined;
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const { signMessageAsync } = useSignMessage();
  const { send, busy } = useTx();
  const spend = useMusdSpend();
  const feeBps = useReadContract({ address: ADDR.factory, abi: circleFactoryAbi, functionName: "feeBps" });
  const parentCircle = useCircle(parent);
  // only circles from this factory can be linked as the previous round
  const parentKnown = useReadContract({
    address: ADDR.factory,
    abi: circleFactoryAbi,
    functionName: "isCircle",
    args: parent ? [parent] : undefined,
    query: { enabled: !!parent },
  });

  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(initial);
  const [creating, setCreating] = useState<null | "sign" | "approve" | "create">(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // "Start the next round" copies the previous circle's settings.
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const s = parentCircle.data;
  if (s && copiedFrom !== s.circle) {
    setCopiedFrom(s.circle);
    const contribution = toMusd(s.params.contributionAmount, 6).replace(/,/g, "");
    setF((p) => ({
      ...p,
      model: s.params.model,
      name: s.meta.name.match(/round \d+$/i) ? s.meta.name.replace(/\d+$/, (n) => String(Number(n) + 1)) : `${s.meta.name.slice(0, 55)}, round 2`,
      description: s.meta.description,
      rules: s.meta.rules,
      contribution,
      period: s.params.periodDuration,
      maxMembers: s.params.maxMembers,
      totalRounds: s.params.model === Model.Rotating ? p.totalRounds : s.params.totalRounds,
      collateral: toMusd(s.params.collateralAmount, 6).replace(/,/g, ""),
      payoutOrder: s.params.payoutOrder === PayoutOrder.Custom ? PayoutOrder.Custom : PayoutOrder.JoinOrder,
      penaltyBps: s.params.earlyExitPenaltyBps || p.penaltyBps,
      approvalBps: s.params.approvalBps,
      votingPeriod: s.params.votingPeriod || p.votingPeriod,
      isPrivate: s.params.inviteSigner !== ZERO,
    }));
  }

  const rotating = f.model === Model.Rotating;
  const contribution = parseMusd(f.contribution);
  const collateral = rotating ? parseMusd(f.collateral || "0") : 0n;
  const rounds = rotating ? f.maxMembers : f.totalRounds;
  const plannedGoal = contribution ? contribution * BigInt(f.maxMembers) * BigInt(rounds) : 0n;
  const customGoal = parseMusd(f.goalAmount);
  const goal = f.model === Model.Goal && f.goalCustom ? customGoal : plannedGoal;
  const perMember = contribution ? contribution * BigInt(rounds) : 0n;

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {};
    if (!f.name.trim()) e.name = "Give your circle a name your group will recognise.";
    else if (new TextEncoder().encode(f.name).length > 64) e.name = "Keep the name under 64 characters.";
    if (new TextEncoder().encode(f.description).length > 600) e.description = "Keep the description under 600 characters.";
    if (new TextEncoder().encode(f.rules).length > 2000) e.rules = "Keep the rules under 2,000 characters.";
    if (!contribution || contribution <= 0n) e.contribution = "Enter how much each member pays per round.";
    else if (contribution < 10n ** 16n) e.contribution = "The smallest contribution is 0.01 MUSD.";
    if (f.maxMembers < 2 || f.maxMembers > 50) e.maxMembers = "Circles hold between 2 and 50 members.";
    if (!rotating && (f.totalRounds < 1 || f.totalRounds > 120)) e.totalRounds = "Choose between 1 and 120 rounds.";
    if (rotating && collateral === null) e.collateral = "Enter a deposit amount, or 0 for none.";
    else if (rotating && !f.isPrivate && contribution && (collateral ?? 0n) < contribution)
      e.collateral = "Open circles need a deposit of at least one contribution, so a stranger can't take an early pot and leave.";
    if (f.model === Model.Goal && f.goalCustom && (!customGoal || customGoal <= 0n)) e.goalAmount = "Enter the target amount.";
    if (f.model === Model.Goal && f.beneficiaryMode === "address" && !isAddress(f.beneficiary)) e.beneficiary = "Enter a valid wallet address.";
    return e;
  }, [f, contribution, collateral, customGoal, rotating]);

  const stepValid = [
    true,
    !errors.name && !errors.description && !errors.rules,
    !errors.contribution && !errors.maxMembers && !errors.totalRounds,
    !errors.collateral && !errors.goalAmount && !errors.beneficiary,
    true,
  ];
  const allValid = stepValid.every(Boolean);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const showErr = (k: string, s: number) => (touched[s] ? errors[k] : null);

  const next = () => {
    setTouched((t) => ({ ...t, [step]: true }));
    if (stepValid[step]) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  async function create() {
    if (!address || !client || !contribution || !allValid) return;
    try {
      // 1. private circles: derive an invite key from a wallet signature
      let inviteKey: Hex | null = null;
      let inviteSigner: Address = ZERO;
      if (f.isPrivate || f.model === Model.Emergency) {
        setCreating("sign");
        const created = await client.readContract({ address: ADDR.factory, abi: circleFactoryAbi, functionName: "createdBy", args: [address] });
        const sig = await signMessageAsync({ message: inviteKeyMessage(address, created.length) });
        inviteKey = inviteKeyFromSignature(sig);
        inviteSigner = inviteSignerOf(inviteKey);
      }
      // 2. the creator's deposit is pulled at creation
      const deposit = f.creatorJoins ? (collateral ?? 0n) : 0n;
      if (deposit > 0n && spend.needsApproval(deposit)) {
        setCreating("approve");
        const ok = await spend.approve(perMember + deposit);
        if (!ok) return;
      }
      if (deposit > 0n && !spend.hasBalance(deposit)) {
        toast.error(`You need ${toMusd(deposit)} MUSD for your deposit.`);
        return;
      }
      // 3. create
      setCreating("create");
      const params = {
        model: f.model,
        payoutOrder: rotating ? f.payoutOrder : 0,
        contributionAmount: contribution,
        collateralAmount: collateral ?? 0n,
        goalAmount: f.model === Model.Goal && f.goalCustom ? (customGoal ?? 0n) : 0n,
        beneficiary: f.model === Model.Goal && f.beneficiaryMode === "address" ? (f.beneficiary as Address) : ZERO,
        periodDuration: f.period,
        votingPeriod: rotating ? 0 : f.votingPeriod,
        maxMembers: f.maxMembers,
        totalRounds: rotating ? 0 : f.totalRounds,
        approvalBps: f.approvalBps,
        earlyExitPenaltyBps: f.model === Model.FixedTerm ? f.penaltyBps : 0,
        joinDeadline: BigInt(Math.floor(Date.now() / 1000) + f.joinWindow),
        inviteSigner,
        parent: parent && parentKnown.data ? parent : ZERO,
        creatorJoins: f.creatorJoins,
      };
      const meta = { name: f.name.trim(), description: f.description.trim(), rules: f.rules.trim() };
      const receipt = await send(
        "create",
        "Create your circle",
        { address: ADDR.factory, abi: circleFactoryAbi, functionName: "createCircle", args: [params, meta] },
        { success: "Circle created" },
      );
      if (!receipt) return;
      const [log] = parseEventLogs({ abi: circleFactoryAbi, logs: receipt.logs, eventName: "CircleCreated" });
      const circle = log?.args.circle;
      if (!circle) return;
      if (inviteKey) rememberInviteKey(circle, inviteKey);
      router.push(`/circle/${circle}?created=1`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-display text-[40px] leading-tight text-ink">{parent ? "Start the next round" : "Start a circle"}</h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        These settings become the circle&apos;s contract. Everyone sees them before joining, and nobody can change them
        afterwards.
      </p>

      <ol className="mt-8 flex flex-wrap gap-x-2 gap-y-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => (i < step || stepValid.slice(0, i).every(Boolean)) && setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cx(
                "flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold transition-colors",
                i === step ? "bg-ink text-white" : i < step ? "text-ink hover:bg-ink/5" : "text-ink-faint",
              )}
            >
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full text-[12px]",
                  i === step ? "bg-blue text-ink" : i < step ? "bg-blue text-white" : "border border-rule-strong",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <Panel className="p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
              {step === 0 && (
                <fieldset>
                  <legend className="text-xl font-semibold text-ink">How will your group save?</legend>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((m) => {
                      const info = MODEL_INFO[m];
                      const active = f.model === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setF((p) => ({ ...p, model: m, rules: p.rules === RULES[p.model] ? RULES[m] : p.rules }))}
                          className={cx(
                            "rounded-[14px] border p-4 text-left transition-colors",
                            active ? "border-blue bg-white ring-1 ring-blue" : "border-rule-strong hover:border-ink/50",
                          )}
                        >
                          <ModelArt model={m} className="h-12 w-20" />
                          <div className="mt-3 font-semibold text-ink">{info.name}</div>
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{info.blurb}</p>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <Field label="Circle name" htmlFor="name" error={showErr("name", 1)} hint="Members see this in their wallet history and invite links.">
                    <input id="name" className={inputClass} value={f.name} maxLength={64} placeholder="Friends Savings Circle" onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="What are you saving for?" htmlFor="desc" error={showErr("description", 1)} aside={<span className="text-[12px] text-ink-faint">Optional</span>}>
                    <textarea id="desc" rows={3} className={inputClass} value={f.description} placeholder="Five of us saving 100 MUSD a month, taking turns with the pot." onChange={(e) => set("description", e.target.value)} />
                  </Field>
                  <Field label="Group rules" htmlFor="rules" error={showErr("rules", 1)} hint="Stored on-chain with the circle. Everyone agrees to these when they join.">
                    <textarea id="rules" rows={5} className={inputClass} value={f.rules} onChange={(e) => set("rules", e.target.value)} />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-7">
                  <Field label="Each member pays per round" htmlFor="amt" error={showErr("contribution", 2)}>
                    <AmountInput id="amt" value={f.contribution} onChange={(v) => set("contribution", v)} />
                    <div className="mt-2 flex gap-2">
                      {["5", "10", "50", "100"].map((v) => (
                        <button key={v} type="button" onClick={() => set("contribution", v)} className="rounded-full border border-rule-strong px-3 py-1 text-[13px] font-semibold text-ink-soft hover:border-ink hover:text-ink">
                          {v}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="How often" hint={f.period === 600 ? "Ten-minute rounds let you run a whole circle in one sitting." : undefined}>
                    <Segmented name="Frequency" options={PERIODS} value={f.period} onChange={(v) => set("period", v)} columns={5} />
                  </Field>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Members" htmlFor="members" error={showErr("maxMembers", 2)} hint={rotating ? "One round per member, so everyone gets a turn." : "The most people who can join."}>
                      <Stepper id="members" noun="members" value={f.maxMembers} min={2} max={50} onChange={(v) => set("maxMembers", v)} />
                    </Field>
                    {!rotating && (
                      <Field label="Number of rounds" htmlFor="rounds" error={showErr("totalRounds", 2)} hint={`Runs ${durationLabel(f.totalRounds * f.period)} after it starts.`}>
                        <Stepper id="rounds" noun="rounds" value={f.totalRounds} min={1} max={120} onChange={(v) => set("totalRounds", v)} />
                      </Field>
                    )}
                  </div>
                  <Field label="Time to gather members" hint="If the circle hasn't started by then, anyone can cancel it and deposits are returned.">
                    <Segmented name="Joining window" options={JOIN_WINDOWS} value={f.joinWindow} onChange={(v) => set("joinWindow", v)} />
                  </Field>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-7">
                  {rotating && (
                    <>
                      <Field
                        label="Deposit per member"
                        htmlFor="col"
                        error={showErr("collateral", 3)}
                        hint="Held by the contract and returned at the end. It covers a member's missed round so the person whose turn it is still gets paid. Matching one contribution is a good default."
                      >
                        <AmountInput id="col" value={f.collateral} onChange={(v) => set("collateral", v)} />
                      </Field>
                      <Field label="Who gets paid first?">
                        <Segmented
                          name="Payout order"
                          value={f.payoutOrder}
                          onChange={(v) => set("payoutOrder", v)}
                          options={[
                            { value: PayoutOrder.JoinOrder, label: "Join order", sub: "First to join, first paid" },
                            { value: PayoutOrder.Custom, label: "You decide", sub: "Set before starting" },
                          ]}
                        />
                      </Field>
                    </>
                  )}
                  {f.model === Model.Goal && (
                    <>
                      <Toggle
                        checked={f.goalCustom}
                        onChange={(v) => set("goalCustom", v)}
                        label="Set a custom target"
                        description={`Otherwise the target is everything scheduled: ${toMusd(plannedGoal)} MUSD with a full circle.`}
                      />
                      {f.goalCustom && (
                        <Field label="Target amount" htmlFor="goal" error={showErr("goalAmount", 3)} hint="Members can top up beyond the schedule to reach it sooner.">
                          <AmountInput id="goal" value={f.goalAmount} onChange={(v) => set("goalAmount", v)} />
                        </Field>
                      )}
                      <Field label="When the goal is reached, the money goes to">
                        <Segmented
                          name="Goal recipient"
                          value={f.beneficiaryMode}
                          onChange={(v) => set("beneficiaryMode", v)}
                          options={[
                            { value: "members", label: "Back to members", sub: "Each takes their share" },
                            { value: "address", label: "One wallet", sub: "e.g. whoever books the trip" },
                          ]}
                        />
                      </Field>
                      {f.beneficiaryMode === "address" && (
                        <Field label="Recipient wallet" htmlFor="ben" error={showErr("beneficiary", 3)}>
                          <input id="ben" className={cx(inputClass, "tabular")} value={f.beneficiary} placeholder="0x…" onChange={(e) => set("beneficiary", e.target.value.trim())} />
                        </Field>
                      )}
                    </>
                  )}
                  {f.model === Model.FixedTerm && (
                    <Field label="Penalty for leaving early" hint="Kept in the pool and shared by the members who stay to the end.">
                      <Segmented
                        name="Early exit penalty"
                        value={f.penaltyBps}
                        onChange={(v) => set("penaltyBps", v)}
                        options={[
                          { value: 0, label: "None" },
                          { value: 200, label: "2%" },
                          { value: 500, label: "5%" },
                          { value: 1000, label: "10%" },
                        ]}
                      />
                    </Field>
                  )}
                  {!rotating && (
                    <div className="grid gap-6 sm:grid-cols-2">
                      <Field label="Votes needed to approve" hint={f.model === Model.Emergency ? "For withdrawal requests and closing early." : "For closing the circle early."}>
                        <select className={inputClass} value={f.approvalBps} onChange={(e) => set("approvalBps", Number(e.target.value))}>
                          <option value={5100}>More than half (51%)</option>
                          <option value={6000}>60% of members</option>
                          <option value={6700}>Two thirds</option>
                          <option value={7500}>Three quarters</option>
                          <option value={10000}>Everyone</option>
                        </select>
                      </Field>
                      <Field label="Voting window">
                        <select className={inputClass} value={f.votingPeriod} onChange={(e) => set("votingPeriod", Number(e.target.value))}>
                          <option value={600}>10 minutes</option>
                          <option value={86400}>1 day</option>
                          <option value={172800}>2 days</option>
                          <option value={604800}>1 week</option>
                        </select>
                      </Field>
                    </div>
                  )}
                  <div className="space-y-5 border-t border-rule pt-6">
                    <Toggle
                      checked={f.isPrivate || f.model === Model.Emergency}
                      onChange={(v) => f.model !== Model.Emergency && set("isPrivate", v)}
                      label="Invite only"
                      description={
                        f.model === Model.Emergency
                          ? "Emergency pools are always invite only, because the group votes on who gets paid."
                          : "Only people with your invite link can join. Your wallet signs once to create the link; you can recreate it later from any device."
                      }
                    />
                    <Toggle
                      checked={f.creatorJoins}
                      onChange={(v) => set("creatorJoins", v)}
                      label="I'm saving in this circle too"
                      description={rotating && collateral ? `You'll join as the first member and pay your ${toMusd(collateral)} MUSD deposit now.` : "You'll join as the first member."}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h2 className="text-xl font-semibold text-ink">Check everything before it goes on-chain</h2>
                  <dl className="mt-5 divide-y divide-rule text-[15px]">
                    <Row k="Circle" v={f.name || "Untitled"} />
                    <Row k="Model" v={MODEL_INFO[f.model].name} />
                    <Row k="Each member pays" v={`${toMusd(contribution ?? 0n)} MUSD ${periodLabel(f.period)}`} />
                    <Row k="Members" v={`Up to ${f.maxMembers}`} />
                    <Row k="Rounds" v={rotating ? `${f.maxMembers}, one per member` : `${f.totalRounds}`} />
                    {rotating && <Row k="Deposit" v={collateral ? `${toMusd(collateral)} MUSD, returned at the end` : "None"} />}
                    {rotating && <Row k="Payout order" v={f.payoutOrder === PayoutOrder.Custom ? "Set by you before starting" : "Join order"} />}
                    {f.model === Model.Goal && <Row k="Goal" v={`${toMusd(goal ?? 0n)} MUSD, ${f.beneficiaryMode === "address" ? "paid to one wallet" : "returned to members"}`} />}
                    {f.model === Model.FixedTerm && <Row k="Early exit penalty" v={bpsToPercent(f.penaltyBps)} />}
                    {!rotating && <Row k="Approval threshold" v={`${bpsToPercent(f.approvalBps)} of members, ${durationLabel(f.votingPeriod)} to vote`} />}
                    <Row k="Joining" v={`${f.isPrivate || f.model === Model.Emergency ? "Invite link only" : "Open to anyone"}, closes ${durationLabel(f.joinWindow)} after creation`} />
                    <Row k="Fee" v={`${feeBps.data !== undefined ? bpsToPercent(feeBps.data) : "0.25%"} of payouts. Refunds are free.`} />
                  </dl>
                  <div className="mt-7">
                    {!mounted ? null : !isConnected ? (
                      <ConnectButton variant="primary" size="lg" label="Connect wallet to create" />
                    ) : (
                      <>
                        <Button variant="primary" size="lg" onClick={create} loading={!!creating || busy === "create"} disabled={!allValid}>
                          Create circle
                        </Button>
                        {creating && (
                          <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
                            {creating === "sign" && "Sign the message in your wallet to create your private invite key."}
                            {creating === "approve" && "Approve MUSD so the contract can take your deposit."}
                            {creating === "create" && "Confirm the transaction to put your circle on Mezo."}
                          </p>
                        )}
                        {!allValid && <p className="mt-3 text-sm text-ink">Some steps still need attention. Go back and check the highlighted fields.</p>}
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between border-t border-rule pt-6">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} icon={<ChevronLeft className="size-4" />}>
              Back
            </Button>
            {step < STEPS.length - 1 && (
              <Button variant="ink" onClick={next}>
                Continue
              </Button>
            )}
          </div>
        </Panel>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel className="overflow-hidden">
            <div className="ledger-paper px-6 pt-6 pb-5">
              <div className="text-[13px] text-ink-soft">{MODEL_INFO[f.model].name}</div>
              <div className="mt-1 font-display text-2xl leading-tight text-ink">{f.name || "Your circle"}</div>
            </div>
            <dl className="space-y-4 px-6 py-5 text-[15px]">
              <SumRow k="Each member pays" v={`${toMusd(contribution ?? 0n)} MUSD ${periodLabel(f.period)}`} />
              <SumRow k={rotating ? "Pot each round" : "Planned savings"} v={`${toMusd(rotating ? (contribution ?? 0n) * BigInt(f.maxMembers) : plannedGoal)} MUSD`} strong />
              {f.model === Model.Goal && <SumRow k="Goal" v={`${toMusd(goal ?? 0n)} MUSD`} />}
              <SumRow k="Each member commits" v={`${toMusd(perMember)} MUSD over ${rounds} rounds`} />
              {rotating && collateral ? <SumRow k="Refundable deposit" v={`${toMusd(collateral)} MUSD`} /> : null}
              <SumRow k="Length" v={`${durationLabel(rounds * f.period)} once started`} />
            </dl>
            <p className="border-t border-rule px-6 py-4 text-[13px] text-ink-soft">
              {rotating
                ? `Everyone pays ${toMusd(contribution ?? 0n)} MUSD each round. Each round one member takes the ${toMusd((contribution ?? 0n) * BigInt(f.maxMembers))} MUSD pot, until all ${f.maxMembers} have had a turn.`
                : MODEL_INFO[f.model].rule}
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2.5">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}

function SumRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{k}</dt>
      <dd className={cx("tabular text-right", strong ? "text-lg font-semibold text-ink" : "font-medium text-ink")}>{v}</dd>
    </div>
  );
}

function Stepper({ value, min, max, onChange, id, noun }: { value: number; min: number; max: number; onChange: (v: number) => void; id: string; noun: string }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Fewer ${noun}`} onClick={() => onChange(Math.max(min, value - 1))} className="size-11 rounded-[var(--radius-control)] border border-rule-strong text-lg font-semibold text-ink hover:border-ink">
        −
      </button>
      <input
        id={id}
        inputMode="numeric"
        className={cx(inputClass, "tabular w-20 text-center text-lg font-semibold")}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (!Number.isNaN(n)) onChange(Math.min(max, n));
        }}
        onBlur={() => onChange(Math.max(min, Math.min(max, value)))}
      />
      <button type="button" aria-label={`More ${noun}`} onClick={() => onChange(Math.min(max, value + 1))} className="size-11 rounded-[var(--radius-control)] border border-rule-strong text-lg font-semibold text-ink hover:border-ink">
        +
      </button>
    </div>
  );
}
