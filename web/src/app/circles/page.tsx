"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRecentCircles } from "@/lib/hooks";
import { Status, ZERO } from "@/lib/contracts";
import { MODEL_INFO } from "@/lib/circle-logic";
import { CircleList } from "@/components/circle-row";
import { Empty, Skeleton, cx, inputClass } from "@/components/ui";

const FILTERS = [
  { id: "open", label: "Open to join" },
  { id: "active", label: "In progress" },
  { id: "done", label: "Finished" },
  { id: "all", label: "All" },
] as const;

export default function CirclesPage() {
  const { data, isLoading, error } = useRecentCircles(200);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("open");
  const [model, setModel] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const list = data?.[0] ?? [];
    return list.filter((s) => {
      if (filter === "open" && s.status !== Status.Open) return false;
      if (filter === "active" && s.status !== Status.Active) return false;
      if (filter === "done" && s.status !== Status.Completed && s.status !== Status.Cancelled) return false;
      if (model !== null && s.params.model !== model) return false;
      if (q && !s.meta.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data, filter, model, q]);

  const total = data ? Number(data[1]) : 0;
  const privateOpen = (data?.[0] ?? []).filter((s) => s.status === Status.Open && s.params.inviteSigner !== ZERO).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[40px] leading-tight text-ink">Circles on Mezo</h1>
          <p className="mt-2 max-w-xl text-ink-soft">
            Every circle created with CircleSave, read straight from the chain.{" "}
            {total > 0 && <span className="tabular">{total.toLocaleString()} so far.</span>} Private circles show up
            here too, but you need an invite link to join them.
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-blue px-4 text-sm font-semibold text-white hover:bg-blue-hover"
        >
          Start a circle
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Circle status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                filter === f.id ? "bg-ink text-white" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 hidden w-px self-stretch bg-rule sm:block" aria-hidden />
          {[0, 1, 2, 3].map((m) => (
            <button
              key={m}
              aria-pressed={model === m}
              onClick={() => setModel(model === m ? null : m)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                model === m ? "border-ink bg-surface text-ink" : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {MODEL_INFO[m].short}
            </button>
          ))}
        </div>
        <label className="relative w-full lg:w-64">
          <span className="sr-only">Search circles by name</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input className={cx(inputClass, "py-2 pl-9 text-sm")} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-px overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-surface">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-5">
                <Skeleton className="h-10 w-14" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="ml-auto h-5 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Empty title="Couldn't reach Mezo">The testnet RPC didn&apos;t respond. Refresh in a moment.</Empty>
        ) : items.length === 0 ? (
          <Empty
            title={filter === "open" ? "No circles are open right now" : "Nothing matches these filters"}
            action={
              <Link href="/create" className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-ink px-4 text-sm font-semibold text-white">
                Start a circle
              </Link>
            }
          >
            {filter === "open" && privateOpen > 0
              ? `${privateOpen} invite-only ${privateOpen === 1 ? "circle is" : "circles are"} gathering members. Ask the creator for a link.`
              : "Start one for your group and share the invite link."}
          </Empty>
        ) : (
          <CircleList items={items} />
        )}
      </div>
    </div>
  );
}
