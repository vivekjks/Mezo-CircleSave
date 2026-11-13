import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress, type Address } from "viem";
import { CircleView } from "@/components/circle/circle-view";
import { fetchSummary } from "@/lib/server";
import { MODEL_INFO } from "@/lib/circle-logic";
import { periodLabel, toMusd } from "@/lib/format";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const s = await fetchSummary(address);
  if (!s) return { title: "Circle" };
  const description = `${MODEL_INFO[s.params.model].name}: ${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)}, ${s.memberCount} of ${s.params.maxMembers} members. ${s.meta.description}`.trim();
  return { title: s.meta.name, description, openGraph: { title: s.meta.name, description } };
}

export default async function CirclePage({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  return <CircleView address={address as Address} />;
}
