import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress, type Address } from "viem";
import { JoinView } from "@/components/circle/join-view";
import { fetchSummary } from "@/lib/server";
import { periodLabel, toMusd } from "@/lib/format";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const s = await fetchSummary(address);
  if (!s) return { title: "You're invited" };
  const title = `Join ${s.meta.name}`;
  const description = `You're invited to save ${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)} with ${s.params.maxMembers - 1} others on CircleSave.`;
  return { title, description, openGraph: { title, description } };
}

export default async function JoinPage({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  return <JoinView address={address as Address} />;
}
