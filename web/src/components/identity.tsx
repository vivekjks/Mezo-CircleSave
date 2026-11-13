"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { shortAddress, toMusd } from "@/lib/format";
import { Identicon } from "./identicon";
import { explorerAddress } from "@/lib/wagmi";


export function markInitials(seed: string, label?: string) {
  if (label) return label.slice(0, 2).toUpperCase();
  return seed.slice(2, 4).toUpperCase();
}

/** Identity mark derived from an address: a blue identicon. `ring` marks the viewer. */
export function MemberMark({ address, size = 32, ring }: { address: string; label?: string; size?: number; ring?: string }) {
  return <Identicon address={address} size={size} active={!!ring} />;
}

export function AddressLink({
  address,
  you,
  className,
  profile = true,
}: {
  address: string;
  you?: string;
  className?: string;
  profile?: boolean;
}) {
  const isYou = you && address.toLowerCase() === you.toLowerCase();
  const text = isYou ? "You" : shortAddress(address);
  if (!profile) return <span className={clsx("font-medium", className)}>{text}</span>;
  return (
    <Link href={`/u/${address}`} className={clsx("link-quiet font-medium", className)} title={address}>
      {text}
    </Link>
  );
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {}
      }}
      className={clsx("inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink", className)}
    >
      {done ? <Check className="size-3.5 text-blue" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function ExplorerLink({ address, children }: { address: string; children?: React.ReactNode }) {
  return (
    <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 link-quiet">
      {children ?? shortAddress(address)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

export function Musd({ value, className, decimals = 2 }: { value: bigint | undefined; className?: string; decimals?: number }) {
  return (
    <span className={clsx("tabular whitespace-nowrap", className)}>
      {toMusd(value, decimals)} <span className="text-[0.82em] font-medium text-ink-soft">MUSD</span>
    </span>
  );
}
