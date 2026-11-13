import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your circles", description: "What's due, what you're owed and every circle you belong to." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
