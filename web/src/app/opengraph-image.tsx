import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "CircleSave: group savings circles on Mezo";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({
    kicker: "Save together in MUSD",
    title: "Group savings circles, run by a smart contract.",
    lines: ["Rotating", "Goal", "Fixed term", "Emergency pool"],
  });
}
