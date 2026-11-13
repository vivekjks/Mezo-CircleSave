"use client";

import clsx from "clsx";
import { MemberMark } from "./identity";
import { shortAddress, formatDate, toMusd } from "@/lib/format";

export type LedgerRow = {
  address: string;
  name?: string;
  paid: bigint;
  late: bigint;
  missed: bigint;
  payoutRound?: number; // 1-based, rotating only
  exited?: boolean;
  you?: boolean;
  contributed?: bigint;
};

const bit = (b: bigint, i: number) => ((b >> BigInt(i)) & 1n) === 1n;
const countBits = (b: bigint, n: number) => {
  let c = 0;
  for (let i = 0; i < n; i++) if (bit(b, i)) c++;
  return c;
};

function TickMark({ late }: { late?: boolean }) {
  return (
    <span className="relative inline-flex">
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
        <path d="M5 12.6 9.6 17 19 6.8" fill="none" stroke="#1d4ed8" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {late && <span className="absolute -top-0.5 -right-1 size-[7px] rounded-full bg-ink ring-2 ring-white" />}
    </span>
  );
}

function MissMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="#000000" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

export function Ledger({
  rows,
  rounds,
  currentRound,
  openUpTo = Number.MAX_SAFE_INTEGER,
  settled = 0,
  rotating,
  started,
  deadlines,
  compact,
  bare,
}: {
  rows: LedgerRow[];
  rounds: number;
  currentRound: number;
  openUpTo?: number;
  settled?: number;
  rotating: boolean;
  started: boolean;
  deadlines?: number[];
  compact?: boolean;
  bare?: boolean;
}) {
  const cols = Array.from({ length: rounds }, (_, i) => i);
  const hasAmounts = rows.some((r) => r.contributed !== undefined);
  return (
    <div className={clsx("overflow-hidden bg-white", !bare && "rounded-[var(--radius-panel)] border border-rule")}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Payment record for each member and round</caption>
          <thead>
            <tr className="h-11 border-b border-rule">
              <th scope="col" className="sticky left-0 z-10 w-[1%] bg-white pr-6 pl-4 text-left text-[12px] font-semibold whitespace-nowrap text-ink-soft">
                Member
              </th>
              {cols.map((r) => (
                <th
                  key={r}
                  scope="col"
                  className={clsx(
                    "w-10 min-w-10 px-0.5 text-center text-[12px] font-semibold",
                    started && r === currentRound ? "text-blue" : "text-ink-soft",
                  )}
                >
                  <div>{r + 1}</div>
                  {!compact && deadlines?.[r] ? <div className="text-[10px] font-medium text-ink-faint">{formatDate(deadlines[r], false)}</div> : null}
                </th>
              ))}
              <th scope="col" className="pr-4 pl-4 text-right text-[12px] font-semibold whitespace-nowrap text-ink-soft">
                {hasAmounts ? "Paid in" : "Rounds paid"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.address} className={clsx("h-12 border-b border-rule last:border-b-0", row.exited && "opacity-55")}>
                <th scope="row" className="sticky left-0 z-10 bg-white pr-6 pl-4 text-left font-normal">
                  <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <MemberMark address={row.address} size={24} ring={row.you ? "you" : undefined} />
                    <span className={clsx("text-ink", row.you && "font-semibold")}>{row.you ? "You" : row.name ?? shortAddress(row.address)}</span>
                    {rotating && row.payoutRound ? <span className="text-[11px] text-ink-faint tabular">turn {row.payoutRound}</span> : null}
                    {row.exited && <span className="text-[11px] text-ink-faint">left early</span>}
                  </div>
                </th>
                {cols.map((r) => {
                  const paid = bit(row.paid, r);
                  const late = bit(row.late, r);
                  const missed = bit(row.missed, r);
                  const isPayout = rotating && row.payoutRound === r + 1;
                  const open = r <= openUpTo;
                  const due = started && !paid && !missed && r === currentRound && open && !row.exited;
                  const overdue = started && !paid && !missed && r < currentRound && !row.exited && (!rotating || r >= settled);
                  let title = "Upcoming";
                  if (paid) title = late ? "Paid late" : "Paid on time";
                  else if (missed) title = "Missed, covered by the deposit where possible";
                  else if (overdue) title = "Overdue";
                  else if (due) title = "Due this round";
                  if (isPayout) title += r < settled ? ". Took the pot this round" : ". Takes the pot this round";
                  return (
                    <td key={r} title={title} className={clsx("text-center align-middle", started && r === currentRound && "bg-mist")}>
                      <span className="sr-only">{title}</span>
                      <span
                        className={clsx(
                          "inline-flex size-8 items-center justify-center rounded-[8px]",
                          isPayout && (r < settled ? "ring-[1.5px] ring-blue" : "ring-[1.5px] ring-blue/40"),
                        )}
                      >
                        {paid ? (
                          <TickMark late={late} />
                        ) : missed ? (
                          <MissMark />
                        ) : overdue ? (
                          <span className="size-3.5 rounded-full border-2 border-ink" />
                        ) : due ? (
                          <span className="size-3.5 rounded-full border-2 border-blue" />
                        ) : (
                          <span className="size-1 rounded-full bg-ink/20" />
                        )}
                      </span>
                    </td>
                  );
                })}
                <td className="pr-4 pl-4 text-right text-[13px] whitespace-nowrap text-ink tabular">
                  {row.contributed !== undefined ? (
                    <>
                      {toMusd(row.contributed)} <span className="text-ink-soft">MUSD</span>
                    </>
                  ) : (
                    `${countBits(row.paid, rounds)} of ${rounds}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule px-4 py-3 text-[12px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <TickMark /> Paid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TickMark late /> Paid late
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MissMark /> Missed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border-2 border-blue" /> Due now
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border-2 border-ink" /> Overdue
          </span>
          {rotating && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded-[4px] ring-[1.5px] ring-blue" /> Their turn for the pot
            </span>
          )}
        </div>
      )}
    </div>
  );
}
