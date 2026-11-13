import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Start a circle",
  description: "Set the rules for your savings circle and invite your group.",
};

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-12" />}>
      <CreateWizard />
    </Suspense>
  );
}
