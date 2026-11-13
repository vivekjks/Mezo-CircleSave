import Link from "next/link";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { HowItWorks, LiveCirclePreview, LiveStats } from "@/components/landing-bits";
import { ModelIcon } from "@/components/model-art";
import { ADDR } from "@/lib/contracts";
import { deployment } from "@/lib/contracts/deployment";
import { explorerAddress } from "@/lib/wagmi";

const MODELS = [
  { name: "Rotating", who: "One member per round, until everyone has had the pot once", when: "Every round", miss: "Their deposit covers the round", leave: "Before the circle starts", good: "Friends, family, community groups" },
  { name: "Goal", who: "A chosen recipient, or back to every member", when: "When the target is reached", miss: "The group saves less; full refund if the deadline passes", leave: "Group votes to close early, fee-free refund", good: "Trips, events, shared purchases" },
  { name: "Fixed term", who: "Every member, in proportion to what they paid", when: "On the end date", miss: "Only their own share is smaller", leave: "Any time, with a penalty paid to those who stay", good: "Saving that has to stick" },
  { name: "Emergency pool", who: "A member who asks, if the group approves", when: "When a request passes the vote", miss: "Only their own share is smaller", leave: "Group votes to close early, fee-free refund", good: "Families and close communities" },
];

const ROWS: { key: keyof (typeof MODELS)[number]; label: string }[] = [
  { key: "who", label: "Who gets the money" },
  { key: "when", label: "When it moves" },
  { key: "miss", label: "If someone misses a round" },
  { key: "leave", label: "Leaving early" },
  { key: "good", label: "Good for" },
];

const WHAT_IF = [
  {
    q: "Someone misses a payment",
    a: "In rotating circles their deposit covers the round, so whoever's turn it is still gets a full pot. The miss is written to their savings record.",
  },
  {
    q: "Their deposit has run out",
    a: "The missing amount becomes their debt. It's taken out of their own payout and returned to whoever came up short. They can repay it at any time.",
  },
  {
    q: "Someone pays late",
    a: "A late payment still counts while the round is open. It's marked late on the ledger for everyone to see.",
  },
  {
    q: "The group wants to stop",
    a: "Goal, fixed-term and emergency circles can vote to close early. Everyone gets their share back, with no fee.",
  },
  {
    q: "Not enough people join",
    a: "Once the joining deadline passes, anyone can cancel the circle and every deposit is returned.",
  },
  {
    q: "A bug is found in the contracts",
    a: "New payments can be paused. Leaving open circles, cancelling and withdrawing deposits keep working while paused.",
  },
];

const CONTRACTS = [
  { name: "Circle factory", role: "Creates circles, holds the fee settings and the pause switch", address: ADDR.factory },
  { name: "Savings circle", role: "The rules every circle runs on", address: deployment.implementation },
  { name: "Group voting", role: "Withdrawal requests and votes to close early", address: ADDR.governor },
  { name: "Read helper", role: "Read-only views used by this app", address: ADDR.lens },
  { name: "MUSD", role: "Mezo's Bitcoin-backed dollar, used for every payment", address: ADDR.musd },
];

export default function Home() {
  return (
    <>
      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-14 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-rule-strong px-3 py-1 text-[13px] font-medium text-ink-soft">
            <span className="size-1.5 rounded-full bg-blue" aria-hidden />
            Live on Mezo Testnet
          </p>
          <h1 className="mt-6 font-display text-[40px] leading-[1.05] tracking-[-0.035em] text-ink sm:text-[54px]">
            Group savings circles, run by a smart contract.
          </h1>
          <p className="mt-5 max-w-[34rem] text-[18px] leading-relaxed text-ink-soft">
            Pool MUSD with friends, family or your community. Take turns with the pot, save toward a goal or keep an
            emergency fund. Every payment and payout is recorded on Mezo for the whole group to see.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/create" className="inline-flex h-12 items-center rounded-[12px] bg-blue px-6 text-[15px] font-semibold text-white transition-colors hover:bg-blue-hover">
              Start a circle
            </Link>
            <Link href="/circles" className="inline-flex h-12 items-center rounded-[12px] border border-ink/25 bg-white px-6 text-[15px] font-semibold text-ink transition-colors hover:border-ink">
              Browse circles
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            New to Mezo?{" "}
            <Link href="/get-musd" className="link-quiet font-semibold text-ink">
              Get test MUSD
            </Link>{" "}
            in a minute.
          </p>
        </div>
        <LiveCirclePreview />
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <LiveStats />
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <HowItWorks />
      </section>

      {/* models */}
      <section className="border-y border-rule bg-mist">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-[32px] leading-tight text-ink sm:text-[38px]">Choose how your group saves</h2>
          <p className="mt-3 max-w-2xl text-[16px] text-ink-soft">
            Four models, each enforced by the contract. The settings are fixed when the circle is created, so nobody can
            change them later.
          </p>
          <div className="mt-8 space-y-4 md:hidden">
            {MODELS.map((m, i) => (
              <div key={m.name} className="rounded-[14px] border border-rule bg-white p-5">
                <div className="flex items-center gap-2.5">
                  <ModelIcon model={i} size={32} />
                  <span className="text-[16px] font-semibold text-ink">{m.name}</span>
                </div>
                <dl className="mt-4 space-y-3 text-[14px]">
                  {ROWS.map((r) => (
                    <div key={r.key}>
                      <dt className="font-semibold text-ink">{r.label}</dt>
                      <dd className="mt-0.5 text-ink-soft">{m[r.key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-10 hidden overflow-x-auto rounded-[14px] border border-rule bg-white md:block">
            <table className="w-full min-w-[820px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className="w-[180px] px-5 py-4 text-left" scope="col">
                    <span className="sr-only">Detail</span>
                  </th>
                  {MODELS.map((m, i) => (
                    <th key={m.name} scope="col" className="px-5 py-4 text-left align-bottom">
                      <div className="flex items-center gap-2.5">
                        <ModelIcon model={i} size={32} />
                        <span className="text-[15px] font-semibold text-ink">{m.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.key} className="border-b border-rule last:border-b-0">
                    <th scope="row" className="px-5 py-4 text-left align-top font-semibold text-ink">
                      {r.label}
                    </th>
                    {MODELS.map((m) => (
                      <td key={m.name} className="px-5 py-4 align-top text-ink-soft">
                        {m[r.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* what if */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-display text-[32px] leading-tight text-ink sm:text-[38px]">What happens if…</h2>
            <p className="mt-3 text-[16px] text-ink-soft">
              The contract holds the money and follows the rules everyone agreed to. Nobody, including us, can move funds
              another way.
            </p>
            <p className="mt-6 border-l-2 border-ink pl-4 text-[15px] leading-relaxed text-ink-soft">
              A contract can&apos;t force anyone to pay a future round. Deposits and the shortfall rules limit the damage,
              so rotating circles still work best with people you know. CircleSave runs on testnet and hasn&apos;t been
              audited yet.
            </p>
          </div>
          <dl className="divide-y divide-rule border-y border-rule">
            {WHAT_IF.map((x) => (
              <div key={x.q} className="grid gap-2 py-5 sm:grid-cols-[220px_1fr] sm:gap-6">
                <dt className="font-semibold text-ink">{x.q}</dt>
                <dd className="text-[15px] leading-relaxed text-ink-soft">{x.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* contracts */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[32px] leading-tight sm:text-[38px]">Open contracts on Mezo</h2>
              <p className="mt-3 max-w-xl text-[16px] text-white/70">
                Every circle is its own contract on Mezo Testnet, chain 31611. The source code is verified on the Mezo
                explorer, so anyone can read exactly what it does.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/create" className="inline-flex h-11 items-center rounded-[10px] bg-blue px-5 text-[15px] font-semibold text-white hover:bg-blue-hover">
                Start a circle
              </Link>
              <Link href="/circles" className="inline-flex h-11 items-center rounded-[10px] border border-white/40 px-5 text-[15px] font-semibold text-white hover:border-white">
                Browse circles
              </Link>
            </div>
          </div>
          <ul className="mt-10 divide-y divide-white/15 border-y border-white/15">
            {CONTRACTS.map((c) => (
              <li key={c.name} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr_auto] sm:items-center sm:gap-6">
                <span className="font-semibold">{c.name}</span>
                <span className="text-[14px] text-white/65">{c.role}</span>
                <a
                  href={explorerAddress(c.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular inline-flex items-center gap-2 text-[14px] text-white hover:underline"
                >
                  <BadgeCheck className="size-4 text-white" aria-label="Verified" />
                  {c.address.slice(0, 8)}…{c.address.slice(-6)}
                  <ExternalLink className="size-3.5 text-white/60" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
