import type { Metadata } from "next";

export const metadata: Metadata = { title: "Circles on Mezo", description: "Browse every CircleSave savings circle on Mezo Testnet." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
