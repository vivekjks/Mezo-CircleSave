import { ogCard, OG_SIZE } from "@/lib/og";
import { fetchSummary } from "@/lib/server";
import { MODEL_INFO, statusInfo } from "@/lib/circle-logic";
import { periodLabel, toMusd } from "@/lib/format";

export const alt = "A CircleSave savings circle";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const s = await fetchSummary(address);
  if (!s) return ogCard({ kicker: "Savings circle", title: "A savings circle on CircleSave", lines: ["MUSD on Mezo"] });
  return ogCard({
    kicker: `${MODEL_INFO[s.params.model].name}, ${statusInfo(s).label.toLowerCase()}`,
    title: s.meta.name,
    lines: [
      `${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)}`,
      `${s.memberCount} members`,
      `${toMusd(s.totalPaidOut)} MUSD paid out`,
    ],
  });
}
