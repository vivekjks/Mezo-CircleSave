"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="font-display text-4xl text-ink">Something went wrong on this page</h1>
      <p className="mt-3 text-ink-soft">
        Your funds are safe: they live in the contracts on Mezo, not in this page. Try again, or head back home.
      </p>
      {error.digest && <p className="mt-2 text-[13px] text-ink-faint">Reference {error.digest}</p>}
      <div className="mt-8 flex justify-center gap-3">
        <button onClick={reset} className="inline-flex h-10 items-center rounded-[10px] bg-blue px-4 text-sm font-semibold text-white hover:bg-blue-hover">
          Try again
        </button>
        <Link href="/" className="inline-flex h-10 items-center rounded-[10px] border border-ink/25 bg-white px-4 text-sm font-semibold text-ink">
          Go home
        </Link>
      </div>
    </div>
  );
}
