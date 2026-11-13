import type { Summary } from "./contracts";
import { roundDeadline } from "./circle-logic";
import { toMusd } from "./format";

const stamp = (sec: number) =>
  new Date(sec * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Calendar file with every contribution deadline and a reminder a day before. */
export function buildIcs(s: Summary, url: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CircleSave//Mezo//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(s.meta.name)}`,
  ];
  const created = stamp(Math.floor(Date.now() / 1000));
  for (let r = 0; r < s.totalRounds; r++) {
    const due = roundDeadline(s, r);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.circle.toLowerCase()}-round-${r}@circlesave`,
      `DTSTAMP:${created}`,
      `DTSTART:${stamp(due - 1800)}`,
      `DTEND:${stamp(due)}`,
      `SUMMARY:${escape(`${s.meta.name}: round ${r + 1} payment due`)}`,
      `DESCRIPTION:${escape(`Pay ${toMusd(s.params.contributionAmount)} MUSD before the deadline.\n${url}`)}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:CircleSave payment due tomorrow",
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(s: Summary, url: string) {
  const blob = new Blob([buildIcs(s, url)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${s.meta.name.replace(/[^\w]+/g, "-").toLowerCase()}-deadlines.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
