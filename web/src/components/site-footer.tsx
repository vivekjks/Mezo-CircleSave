import Link from "next/link";
import { LogoMark } from "./logo";
import { ADDR } from "@/lib/contracts";
import { explorerAddress } from "@/lib/wagmi";

const CONTRACTS = [
  { label: "Circle factory", address: ADDR.factory },
  { label: "Group voting", address: ADDR.governor },
  { label: "Read helper", address: ADDR.lens },
  { label: "MUSD token", address: ADDR.musd },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="font-display text-lg text-ink">CircleSave</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-ink-soft">
            Group savings circles on Mezo, paid in MUSD. Every contribution, payout and vote is recorded on-chain and
            open for anyone in the group to check.
          </p>
          <p className="mt-4 text-[13px] text-ink-faint">
            Running on Mezo Testnet. Test MUSD has no real-world value.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Product</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li><Link className="hover:text-ink" href="/circles">Browse circles</Link></li>
            <li><Link className="hover:text-ink" href="/create">Start a circle</Link></li>
            <li><Link className="hover:text-ink" href="/dashboard">Your circles</Link></li>
            <li><Link className="hover:text-ink" href="/get-musd">Get test MUSD</Link></li>
            <li><a className="hover:text-ink" href="https://mezo.org/docs/developers/musd/" target="_blank" rel="noreferrer">About MUSD</a></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Verified contracts</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {CONTRACTS.map((c) => (
              <li key={c.address} className="flex items-baseline justify-between gap-3">
                <span className="text-ink-soft">{c.label}</span>
                <a href={explorerAddress(c.address)} target="_blank" rel="noreferrer" className="tabular link-quiet text-[13px] text-ink">
                  {c.address.slice(0, 6)}…{c.address.slice(-4)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
