import { formatUnits, parseUnits } from "viem";

export const MUSD_DECIMALS = 18;

export function toMusd(value: bigint | undefined, maxFraction = 2): string {
  if (value === undefined) return "–";
  const n = Number(formatUnits(value, MUSD_DECIMALS));
  // small amounts always keep cents so 1.5 never reads as 2
  const abs = Math.abs(n);
  const fraction = n !== 0 && abs < 1 ? Math.max(maxFraction, 4) : abs < 1000 ? Math.max(maxFraction, 2) : maxFraction;
  // truncate, never round up: a 1.995 MUSD payout (2 MUSD less the fee) must not read as 2, and a
  // 2.985 balance must not read as 2.99 when the user tries to pay exactly that
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fraction,
    roundingMode: "trunc",
  } as Intl.NumberFormatOptions);
}

export function parseMusd(input: string): bigint | null {
  const clean = input.replace(/,/g, "").trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return null;
  try {
    return parseUnits(clean, MUSD_DECIMALS);
  } catch {
    return null;
  }
}

export function shortAddress(address?: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function periodLabel(seconds: number): string {
  const map: Record<number, string> = {
    300: "every 5 minutes",
    600: "every 10 minutes",
    3600: "every hour",
    86400: "daily",
    604800: "weekly",
    1209600: "every 2 weeks",
    2592000: "monthly",
  };
  if (map[seconds]) return map[seconds];
  return `every ${durationLabel(seconds)}`;
}

export function periodNoun(seconds: number): string {
  const map: Record<number, string> = {
    86400: "day",
    604800: "week",
    1209600: "fortnight",
    2592000: "month",
  };
  return map[seconds] ?? "round";
}

export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(s / 3600);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(s / 86400);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"}`;
  const w = Math.round(d / 7);
  if (d < 60) return `${w} week${w === 1 ? "" : "s"}`;
  const mo = Math.round(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"}`;
}

/** "in 2 days 4 hours" / "3 hours ago" */
export function relativeTime(targetSec: number, nowSec: number): string {
  const diff = targetSec - nowSec;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < 60) text = "less than a minute";
  else if (abs < 3600) text = durationLabel(abs);
  else if (abs < 86400) {
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    text = `${h}h ${m}m`;
  } else {
    const d = Math.floor(abs / 86400);
    const h = Math.floor((abs % 86400) / 3600);
    text = h ? `${d}d ${h}h` : `${d} day${d === 1 ? "" : "s"}`;
  }
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export function formatDate(sec: number | bigint, withTime = true): string {
  const d = new Date(Number(sec) * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined,
  });
}

export function bpsToPercent(bps: number | bigint): string {
  const n = Number(bps) / 100;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function pct(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  const p = Number((part * 10000n) / whole) / 100;
  return Math.min(100, Math.max(0, p));
}
