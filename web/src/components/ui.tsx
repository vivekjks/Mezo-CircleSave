"use client";

import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, X } from "lucide-react";
import clsx from "clsx";
import type { Tone } from "@/lib/circle-logic";

export { clsx as cx };

// ───────────────────────────────────────────── button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ink" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-blue text-white hover:bg-blue-hover",
  ink: "bg-ink text-white hover:bg-ink/85",
  outline: "border border-ink/25 bg-surface text-ink hover:border-ink/60",
  ghost: "text-ink-soft hover:text-ink hover:bg-ink/5",
  danger: "border border-ink bg-surface text-ink hover:bg-mist",
};

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[8px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-control)]",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-[12px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ───────────────────────────────────────────── chips & tones

const TONES: Record<Tone, string> = {
  sky: "border border-blue text-blue",
  jade: "bg-blue text-white",
  marigold: "bg-blue text-white",
  margin: "bg-ink text-white",
  ink: "border border-rule-strong text-ink-soft",
};

export function Chip({ tone = "ink", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

// ───────────────────────────────────────────── panels

export function Panel({
  children,
  className,
  as: As = "section",
  ...rest
}: { children: ReactNode; className?: string; as?: "section" | "div" | "aside" | "article" } & Record<string, unknown>) {
  return (
    <As className={clsx("rounded-[var(--radius-panel)] border border-rule bg-surface", className)} {...rest}>
      {children}
    </As>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse-soft rounded-md bg-ink/[0.07]", className)} aria-hidden />;
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="text-[13px] text-ink-soft">{label}</div>
      <div className="tabular mt-1 truncate text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}

export function Progress({ value, tone = "jade", className, label }: { value: number; tone?: "jade" | "marigold" | "sky"; className?: string; label?: string }) {
  const color = tone === "jade" ? "bg-blue" : tone === "marigold" ? "bg-blue" : "bg-blue";
  return (
    <div
      className={clsx("h-2 w-full overflow-hidden rounded-full bg-ink/[0.08]", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={clsx("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${value}%` }} />
    </div>
  );
}

// ───────────────────────────────────────────── form fields

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  aside,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? <p className="text-[13px] text-ink">{error}</p> : hint ? <p className="text-[13px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint transition-colors focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0";

export function AmountInput({
  value,
  onChange,
  id,
  placeholder = "0",
  suffix = "MUSD",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={clsx(inputClass, "tabular pr-16 text-lg font-semibold")}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, "");
          if ((v.match(/\./g) || []).length <= 1) onChange(v);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-ink-soft">
        {suffix}
      </span>
    </div>
  );
}

/** Segmented choice: a row of options where exactly one is selected. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  name,
  columns,
}: {
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={clsx(
              "rounded-[var(--radius-control)] border px-3 py-2.5 text-left transition-colors",
              active ? "border-ink bg-ink text-white" : "border-rule-strong bg-surface text-ink hover:border-ink/60",
            )}
          >
            <div className="text-sm font-semibold">{o.label}</div>
            {o.sub && <div className={clsx("mt-0.5 text-xs", active ? "text-white/70" : "text-ink-soft")}>{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-ink-soft">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-blue" : "bg-ink/20",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

// ───────────────────────────────────────────── dialog

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={clsx(
              "relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[16px] border border-ink bg-surface p-6 sm:rounded-[16px]",
              width,
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 id={titleId} className="font-display text-2xl text-ink">
                {title}
              </h2>
              <button onClick={onClose} className="-mt-1 -mr-2 rounded-full p-2 text-ink-soft hover:bg-ink/5 hover:text-ink" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────────────────────────────────────────── empty state

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-6 py-12 text-center">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-5 flex justify-center gap-3">{action}</div>}
    </div>
  );
}
