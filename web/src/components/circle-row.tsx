"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { Summary } from "@/lib/contracts";
import { Model, Status, ZERO } from "@/lib/contracts";
import { MODEL_INFO, plannedRounds, roundDeadline, statusInfo, targetAmount } from "@/lib/circle-logic";
import { pct, periodLabel, relativeTime, toMusd } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { Chip, Progress } from "./ui";
import { ModelArt } from "./model-art";

export function CircleRow({ s, note }: { s: Summary; note?: string }) {
  const t = useNow();
  const info = MODEL_INFO[s.params.model];
  const status = statusInfo(s);
  const target = targetAmount(s);
  const progress = s.params.model === Model.Rotating ? (s.totalRounds ? (s.roundsSettled / s.totalRounds) * 100 : 0) : pct(s.totalContributed, target);
  const isPrivate = s.params.inviteSigner !== ZERO;

  let timing = "";
  if (s.status === Status.Open) timing = t ? `Joining closes ${relativeTime(Number(s.params.joinDeadline), t)}` : "";
  else if (s.status === Status.Active && t) {
    const r = s.params.model === Model.Rotating ? s.roundsSettled : Math.min(s.currentRound, s.totalRounds - 1);
    const dl = roundDeadline(s, r);
    timing = dl > t ? `Round ${r + 1} due ${relativeTime(dl, t)}` : `Round ${r + 1} deadline passed`;
  } else if (s.status === Status.Completed) timing = "Cycle finished";

  return (
    <Link
      href={`/circle/${s.circle}`}
      className="group grid grid-cols-[56px_1fr] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-mist md:grid-cols-[56px_1.6fr_1fr_1fr_auto]"
    >
      <ModelArt model={s.params.model} className="h-10 w-14" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">
            {s.meta.name}
          </span>
          {isPrivate && <Lock className="size-3.5 shrink-0 text-ink-faint" aria-label="Invite only" />}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-ink-soft">
          {info.short}, {toMusd(s.params.contributionAmount)} MUSD {periodLabel(s.params.periodDuration)}
          {note ? `. ${note}` : ""}
        </div>
      </div>
      <div className="col-start-2 text-[13px] text-ink-soft md:col-start-auto">
        <span className="tabular font-semibold text-ink">
          {s.memberCount}/{s.params.maxMembers}
        </span>{" "}
        members, {plannedRounds(s)} rounds
        <div className="mt-0.5 text-ink-faint">{timing}</div>
      </div>
      <div className="col-start-2 md:col-start-auto">
        <div className="mb-1.5 flex justify-between text-[12px] text-ink-soft">
          <span>{s.params.model === Model.Rotating ? "Payouts made" : "Saved"}</span>
          <span className="tabular">
            {s.params.model === Model.Rotating ? `${s.roundsSettled}/${plannedRounds(s)}` : `${toMusd(s.totalContributed, 0)} / ${toMusd(target, 0)}`}
          </span>
        </div>
        <Progress value={progress} tone={s.params.model === Model.Rotating ? "marigold" : "jade"} label="Progress" />
      </div>
      <div className="col-start-2 md:col-start-auto md:text-right">
        <Chip tone={status.tone} dot>
          {status.label}
        </Chip>
      </div>
    </Link>
  );
}

export function CircleList({ items, notes }: { items: readonly Summary[]; notes?: Record<string, string> }) {
  return (
    <div className="divide-y divide-rule overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-surface">
      {items.map((s) => (
        <CircleRow key={s.circle} s={s} note={notes?.[s.circle]} />
      ))}
    </div>
  );
}
