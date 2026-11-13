import { ogCard, OG_SIZE } from "@/lib/og";
import { fetchSummary } from "@/lib/server";
import { MODEL_INFO } from "@/lib/circle-logic";
import { periodLabel, toMusd } from "@/lib/format";

export const alt = "Invitation to a CircleSave circle";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const s = await fetchSummary(address);
  if (!s) return ogCard({ kicker: "You're invited", title: "Join a savings circle on CircleSave", lines: ["MUSD on Mezo"] });
  return ogCard({
    kicker: "You're invited to join",
    title: s.meta.name,
    lines: [
      `${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)}`,
      MODEL_INFO[s.params.model].name,
      `${s.memberCount} of ${s.params.maxMembers} joined`,
    ],
  });
}
