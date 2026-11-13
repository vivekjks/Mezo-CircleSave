import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="font-display text-4xl text-ink">This page isn&apos;t in the ledger</h1>
      <p className="mt-3 text-ink-soft">The link may be mistyped, or the circle address is incomplete.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="inline-flex h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Go home</Link>
        <Link href="/circles" className="inline-flex h-10 items-center rounded-[10px] border border-ink/25 bg-surface px-4 text-sm font-semibold text-ink">Browse circles</Link>
      </div>
    </div>
  );
}
