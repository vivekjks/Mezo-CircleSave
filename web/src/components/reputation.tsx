"use client";

import type { Reputation } from "@/lib/contracts";
import { reputationScore } from "@/lib/circle-logic";
import { toMusd } from "@/lib/format";

export function ReputationCard({ rep, compact }: { rep?: Reputation; compact?: boolean }) {
  const r = rep ?? {
    circlesJoined: 0,
    circlesCompleted: 0,
    onTimePayments: 0,
    latePayments: 0,
    missedPayments: 0,
    payoutsReceived: 0,
    totalContributed: 0n,
    totalReceived: 0n,
  };
  const { score, label } = reputationScore(r);
  const total = r.onTimePayments + r.latePayments + r.missedPayments;
  const seg = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-ink-soft">Savings record</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular font-display text-[40px] leading-none text-ink">{total ? score : "–"}</span>
            <span className="text-sm font-semibold text-ink-soft">{label}</span>
          </div>
        </div>
        {!compact && (
          <div className="text-right text-[13px] text-ink-soft">
            Based on {total} scheduled {total === 1 ? "payment" : "payments"}
            <br />
            and {r.circlesCompleted} finished {r.circlesCompleted === 1 ? "circle" : "circles"}
          </div>
        )}
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-ink/[0.08]" aria-hidden>
        <span className="bg-blue" style={{ width: `${seg(r.onTimePayments)}%` }} />
        <span className="bg-ink/35" style={{ width: `${seg(r.latePayments)}%` }} />
        <span className="bg-ink" style={{ width: `${seg(r.missedPayments)}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="text-ink-soft">On time</dt>
          <dd className="tabular font-semibold text-ink">{r.onTimePayments}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Late</dt>
          <dd className="tabular font-semibold text-ink">{r.latePayments}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Missed</dt>
          <dd className="tabular font-semibold text-ink">{r.missedPayments}</dd>
        </div>
      </dl>
      {!compact && (
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-rule pt-4 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-ink-soft">Circles joined</dt>
            <dd className="tabular text-lg font-semibold text-ink">{r.circlesJoined}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Payouts received</dt>
            <dd className="tabular text-lg font-semibold text-ink">{r.payoutsReceived}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Total paid in</dt>
            <dd className="tabular text-lg font-semibold text-ink">{toMusd(r.totalContributed, 0)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Total received</dt>
            <dd className="tabular text-lg font-semibold text-ink">{toMusd(r.totalReceived, 0)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
