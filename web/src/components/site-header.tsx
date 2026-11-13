"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Bell, BellRing, Menu, X } from "lucide-react";
import clsx from "clsx";
import { Logo } from "./logo";
import { NetworkBanner, NetworkBadge, WalletButton } from "./wallet";
import { useMounted } from "@/lib/hooks";
import { useTasks } from "@/lib/use-tasks";
import type { Task } from "@/lib/circle-logic";

const NAV = [
  { href: "/circles", label: "Circles" },
  { href: "/dashboard", label: "Your circles" },
  { href: "/create", label: "Start a circle" },
  { href: "/get-musd", label: "Get MUSD" },
];

export function SiteHeader() {
  const path = usePathname();
  // the menu belongs to the page it was opened on, so navigating closes it
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-white">
      <NetworkBanner />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => {
            const active = path === n.href || (n.href !== "/" && path.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors",
                  active ? "text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {n.label}
                {active && <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded-full bg-blue" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NetworkBadge />
          <NotificationBell />
          <WalletButton />
          <button
            className="rounded-lg p-2 text-ink md:hidden"
            onClick={() => setOpenOn(open ? null : path)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-rule bg-white px-5 pt-2 pb-4 md:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-lg px-2 py-3 text-base font-semibold text-ink hover:bg-ink/5">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

const TONE_DOT: Record<Task["tone"], string> = {
  overdue: "bg-ink",
  due: "bg-blue",
  vote: "bg-blue",
  ready: "bg-blue",
  good: "bg-blue",
  info: "bg-ink/30",
};

function NotificationBell() {
  const mounted = useMounted();
  const { address } = useAccount();
  const { tasks } = useTasks(address);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const urgent = tasks.filter((t) => t.tone === "overdue" || t.tone === "due" || t.tone === "vote").length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  useBrowserReminders(tasks);

  if (!mounted || !address) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-[var(--radius-control)] p-2.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        aria-label={`Reminders${tasks.length ? `, ${tasks.length} items` : ""}`}
        aria-expanded={open}
      >
        {urgent ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {tasks.length > 0 && (
          <span
            className={clsx(
              "absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
              urgent ? "bg-ink" : "bg-ink-soft",
            )}
          >
            {tasks.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] rounded-[16px] border border-rule bg-surface">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <span className="font-semibold text-ink">Reminders</span>
            <ReminderToggle />
          </div>
          {tasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">You&apos;re all caught up. Nothing is due right now.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-rule overflow-y-auto">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/circle/${t.circle}`} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-mist">
                    <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[t.tone])} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{t.title}</span>
                      <span className="block truncate text-[13px] text-ink-soft">
                        {t.circleName}. {t.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-rule px-4 py-2.5">
            <Link href="/dashboard" onClick={() => setOpen(false)} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
              Open your circles
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const REMIND_KEY = "circlesave:reminders";
const SEEN_KEY = "circlesave:reminded";

function ReminderToggle() {
  // only rendered on the client, inside the open reminders panel
  const [on, setOn] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem(REMIND_KEY) === "1",
  );
  if (typeof Notification === "undefined") return null;
  return (
    <button
      className="text-[13px] font-semibold text-blue hover:underline"
      onClick={async () => {
        if (on) {
          localStorage.removeItem(REMIND_KEY);
          setOn(false);
          return;
        }
        const p = await Notification.requestPermission();
        if (p === "granted") {
          localStorage.setItem(REMIND_KEY, "1");
          setOn(true);
          new Notification("CircleSave reminders are on", { body: "We'll nudge you here when a payment is due or a vote needs you." });
        }
      }}
    >
      {on ? "Browser alerts on" : "Turn on browser alerts"}
    </button>
  );
}

/** Shows a desktop notification the first time a due, overdue or vote task appears. */
function useBrowserReminders(tasks: Task[]) {
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (localStorage.getItem(REMIND_KEY) !== "1") return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    } catch {}
    const fresh = tasks.filter((t) => ["overdue", "due", "vote", "good"].includes(t.tone) && !seen.includes(t.id));
    for (const t of fresh.slice(0, 3)) {
      new Notification(t.title, { body: `${t.circleName}. ${t.detail}`, tag: t.id });
    }
    if (fresh.length) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((f) => f.id)].slice(-200)));
  }, [tasks]);
}
