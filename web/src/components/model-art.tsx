import { LifeBuoy, LockKeyhole, Repeat2, Target } from "lucide-react";
import clsx from "clsx";

const ICONS = [Repeat2, Target, LockKeyhole, LifeBuoy];

/** Savings-model icon in a bordered tile. */
export function ModelIcon({ model, size = 40, className }: { model: number; size?: number; className?: string }) {
  const Icon = ICONS[model] ?? Repeat2;
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-[10px] border border-rule-strong bg-white text-blue", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={2} />
    </span>
  );
}

/** Kept for existing imports: renders the icon tile. */
export function ModelArt({ model, className }: { model: number; className?: string }) {
  void className;
  return <ModelIcon model={model} />;
}
