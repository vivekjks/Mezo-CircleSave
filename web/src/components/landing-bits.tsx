"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { ExternalLink } from "lucide-react";
import { useCircle, useMembers, useProtocolStats } from "@/lib/hooks";
import { bpsToPercent, periodLabel, toMusd } from "@/lib/format";
import { MODEL_INFO, statusInfo } from "@/lib/circle-logic";
import { explorerAddress } from "@/lib/wagmi";
import { demoCircles } from "@/lib/contracts/deployment";
import { Ledger } from "./ledger";
import { ModelIcon } from "./model-art";
import { RotationDemo, DEMO_MEMBERS, type DemoPhase } from "./ring";
import { Chip, Skeleton, cx } from "./ui";

/** A real circle that ran end to end on Mezo Testnet (from scripts/e2e-testnet.ts). */
export const SHOWCASE_CIRCLE = (demoCircles.rotating ?? undefined) as Address | undefined;

export function LiveStats() {
  const { data } = useProtocolStats();
  const items = [
    { label: "Circles created", value: data ? Number(data.circleCount).toLocaleString() : null },
    { label: "Paid into circles", value: data ? `${toMusd(data.totalValueContributed)} MUSD` : null },
    { label: "Paid out to members", value: data ? `${toMusd(data.totalValuePaidOut)} MUSD` : null },
    { label: "Fee on payouts", value: data ? bpsToPercent(data.feeBps) : null },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-white px-5 py-5 sm:px-6">
          <dt className="text-[13px] text-ink-soft">{it.label}</dt>
          <dd className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-ink">{it.value ?? <Skeleton className="h-7 w-24" />}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LiveCirclePreview() {
  if (!SHOWCASE_CIRCLE) return null;
  return <CirclePreviewCard circle={SHOWCASE_CIRCLE} />;
}

function CirclePreviewCard({ circle: SHOWCASE_CIRCLE }: { circle: Address }) {
  const summary = useCircle(SHOWCASE_CIRCLE);
  const members = useMembers(SHOWCASE_CIRCLE);
  const s = summary.data;
  const views = members.data?.[0] ?? [];

  return (
    <div className="overflow-hidden rounded-[16px] border border-ink bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <ModelIcon model={0} size={38} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{s ? s.meta.name : "Friends Savings Circle"}</div>
            <div className="text-[13px] text-ink-soft">
              {s ? `${MODEL_INFO[s.params.model].name}, ${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)}` : "Rotating circle"}
            </div>
          </div>
        </div>
        {s && (
          <Chip tone={statusInfo(s).tone} dot>
            {statusInfo(s).label}
          </Chip>
        )}
      </div>
      <dl className="grid grid-cols-3 border-b border-rule text-[13px]">
        {[
          { k: "Members", v: s ? `${s.memberCount}` : null },
          { k: "Paid in", v: s ? `${toMusd(s.totalContributed)} MUSD` : null },
          { k: "Paid out", v: s ? `${toMusd(s.totalPaidOut)} MUSD` : null },
        ].map((x, i) => (
          <div key={x.k} className={cx("px-5 py-3", i > 0 && "border-l border-rule")}>
            <dt className="text-ink-soft">{x.k}</dt>
            <dd className="tabular mt-0.5 font-semibold text-ink">{x.v ?? <Skeleton className="h-4 w-14" />}</dd>
          </div>
        ))}
      </dl>
      {s && views.length ? (
        <Ledger
          bare
          compact
          rows={[...views]
            .sort((a, b) => a.data.payoutRound - b.data.payoutRound)
            .map((m) => {
              const i = views.indexOf(m);
              return {
                address: m.account,
                paid: members.data![1][i],
                late: members.data![2][i],
                missed: members.data![3][i],
                payoutRound: m.data.payoutRound || undefined,
              };
            })}
          rounds={s.totalRounds}
          currentRound={s.roundsSettled}
          settled={s.roundsSettled}
          rotating
          started
        />
      ) : (
        <div className="space-y-3 p-5">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-mist px-5 py-3 text-[13px]">
        <span className="text-ink-soft">A real circle that ran on Mezo Testnet. One paid late, one missed; the deposit covered it.</span>
        <span className="flex gap-4">
          <Link href={`/circle/${SHOWCASE_CIRCLE}`} className="font-semibold text-blue hover:underline">
            Open circle
          </Link>
          <a href={explorerAddress(SHOWCASE_CIRCLE)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">
            Contract <ExternalLink className="size-3" />
          </a>
        </span>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [state, setState] = useState<{ round: number; phase: DemoPhase }>({ round: 0, phase: "collect" });
  const onRound = useCallback((round: number, phase: DemoPhase) => setState({ round, phase }), []);
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div className="mx-auto w-full max-w-[420px]">
        <RotationDemo onRound={onRound} />
      </div>
      <div>
        <h2 className="font-display text-[32px] leading-tight text-ink sm:text-[38px]">How a rotating circle works</h2>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-soft">
          Five friends each pay 100 MUSD a month. Every month the contract collects 500 MUSD and sends it to one of them.
          After five months everyone has paid 500 and received 500, and the group never had to trust one person with the money.
        </p>
        <ol className="mt-7 divide-y divide-rule border-y border-rule">
          {DEMO_MEMBERS.map((name, i) => {
            const active = i === state.round;
            const done = i < state.round || (active && state.phase !== "collect");
            return (
              <li key={name} className={cx("grid grid-cols-[66px_1fr_auto] items-center gap-3 py-3 text-[14px] transition-colors sm:grid-cols-[88px_1fr_auto] sm:gap-4 sm:text-[15px]", active ? "text-ink" : "text-ink-soft")}>
                <span className={cx("font-semibold", active && "text-blue")}>Month {i + 1}</span>
                <span>
                  Everyone pays 100 MUSD. <span className={cx(active && "font-semibold text-ink")}>{name}</span> receives 500 MUSD.
                </span>
                <span className={cx("text-[13px] font-semibold", done ? "text-blue" : "text-ink-faint")}>{done ? "Paid out" : active ? "Collecting" : "Upcoming"}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
