"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useMusdBalance, useNow, useReputation } from "@/lib/hooks";
import { useTasks } from "@/lib/use-tasks";
import { Status } from "@/lib/contracts";
import { relativeTime, toMusd } from "@/lib/format";
import type { Task } from "@/lib/circle-logic";
import { RequireWallet } from "@/components/wallet";
import { CircleList } from "@/components/circle-row";
import { ReputationCard } from "@/components/reputation";
import { Empty, Panel, Skeleton, cx } from "@/components/ui";

const TONE: Record<Task["tone"], { bar: string; label: string }> = {
  overdue: { bar: "bg-ink", label: "Overdue" },
  due: { bar: "bg-blue", label: "Due soon" },
  vote: { bar: "bg-blue", label: "Vote" },
  ready: { bar: "bg-blue", label: "Ready" },
  good: { bar: "bg-blue", label: "For you" },
  info: { bar: "bg-ink/25", label: "Update" },
};

export default function DashboardPage() {
  return (
    <RequireWallet title="Your circles" body="Connect your wallet to see the circles you belong to, what's due, and what you're owed.">
      <Dashboard />
    </RequireWallet>
  );
}

function Dashboard() {
  const { address } = useAccount();
  const { tasks, circles, positions, isLoading } = useTasks(address);
  const balance = useMusdBalance(address);
  const rep = useReputation(address);

  const active = circles.filter((s) => s.status === Status.Active);
  const gathering = circles.filter((s) => s.status === Status.Open);
  const finished = circles.filter((s) => s.status === Status.Completed || s.status === Status.Cancelled);
  const lowBalance = balance.data !== undefined && balance.data < 10n ** 18n;
  const now = useNow();
  const nextDue = tasks.filter((t) => (t.tone === "due" || t.tone === "overdue") && t.at).sort((a, b) => a.at! - b.at!)[0];

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[40px] leading-tight text-ink">Your circles</h1>
          <p className="mt-2 text-ink-soft">
            Wallet balance{" "}
            <strong className="tabular font-semibold text-ink">{toMusd(balance.data)} MUSD</strong>
            {lowBalance && (
              <>
                .{" "}
                <Link href="/get-musd" className="link-quiet font-semibold text-ink">
                  Get test MUSD
                </Link>
              </>
            )}
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-blue px-4 text-sm font-semibold text-white hover:bg-blue-hover"
        >
          Start a circle
        </Link>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule lg:grid-cols-4">
        {[
          { k: "Paid into circles", v: `${toMusd([...positions.values()].reduce((a, p) => a + p.member.contributed, 0n))} MUSD` },
          { k: "Received from circles", v: `${toMusd([...positions.values()].reduce((a, p) => a + p.member.received, 0n))} MUSD` },
          { k: "Active circles", v: `${active.length}` },
          { k: "Next payment", v: nextDue ? relativeTime(nextDue.at!, now) : "Nothing due" },
        ].map((x) => (
          <div key={x.k} className="bg-white px-5 py-4">
            <dt className="text-[13px] text-ink-soft">{x.k}</dt>
            <dd className="tabular mt-1 text-xl font-semibold text-ink">{isLoading ? "…" : x.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="todo">
          <h2 id="todo" className="text-lg font-semibold text-ink">
            Needs your attention
          </h2>
          {isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : tasks.length === 0 ? (
            <p className="mt-3 rounded-[var(--radius-panel)] border border-rule bg-surface px-5 py-6 text-ink-soft">
              Nothing is due. You&apos;re up to date in every circle.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-surface">
              {tasks.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link href={`/circle/${t.circle}`} className="relative flex items-start gap-4 py-4 pr-5 pl-6 hover:bg-mist">
                    <span className={cx("absolute inset-y-3 left-0 w-1 rounded-r-full", TONE[t.tone].bar)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink">{t.title}</div>
                      <div className="mt-0.5 text-[14px] text-ink-soft">{t.detail}</div>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[13px] text-ink-soft">{t.circleName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Panel className="p-6">
          <ReputationCard rep={rep.data} compact />
          <Link href={`/u/${address}`} className="mt-5 inline-block text-sm font-semibold text-ink link-quiet">
            See your full savings record
          </Link>
        </Panel>
      </div>

      <div className="mt-12 space-y-10">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : circles.length === 0 ? (
          <Empty
            title="You're not in any circles yet"
            action={
              <>
                <Link href="/create" className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-ink px-4 text-sm font-semibold text-white">
                  Start a circle
                </Link>
                <Link href="/circles" className="inline-flex h-10 items-center rounded-[var(--radius-control)] border border-ink/25 bg-surface px-4 text-sm font-semibold text-ink">
                  Browse open circles
                </Link>
              </>
            }
          >
            Start one with your friends, or join an open circle. Invite links from friends bring you straight to their circle.
          </Empty>
        ) : (
          <>
            {active.length > 0 && <Group title="In progress" items={active} />}
            {gathering.length > 0 && <Group title="Gathering members" items={gathering} />}
            {finished.length > 0 && <Group title="Finished" items={finished} />}
          </>
        )}
      </div>
    </div>
  );
}

function Group({ title, items }: { title: string; items: Parameters<typeof CircleList>[0]["items"] }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-ink">
        {title} <span className="tabular font-normal text-ink-soft">({items.length})</span>
      </h2>
      <CircleList items={items} />
    </section>
  );
}
