import type { Metadata } from "next";

export const metadata: Metadata = { title: "Get test MUSD", description: "Claim testnet MUSD or borrow it against testnet BTC on Mezo." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
