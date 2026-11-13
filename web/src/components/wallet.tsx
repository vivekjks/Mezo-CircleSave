"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { ChevronDown, ExternalLink, LogOut, UserRound, Wallet, Copy, Check, AlertTriangle } from "lucide-react";
import { Button, Dialog, cx } from "./ui";
import { MemberMark } from "./identity";
import { chain, explorerAddress } from "@/lib/wagmi";
import { useMounted, useMusdBalance } from "@/lib/hooks";
import { shortAddress, toMusd } from "@/lib/format";
import { humanizeError } from "@/lib/errors";

const ConnectCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useConnectDialog = () => useContext(ConnectCtx);

export function ConnectProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <ConnectCtx.Provider value={value}>
      {children}
      <ConnectDialog open={isOpen} onClose={() => setOpen(false)} />
    </ConnectCtx.Provider>
  );
}

function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connectors = useConnectors();
  const { connectAsync, isPending, variables } = useConnect();
  const { isConnected } = useAccount();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && open) onClose();
  }, [isConnected, open, onClose]);

  const detected = connectors.filter((c) => c.id !== "injected");
  const list = detected.length ? detected : connectors;
  const hasWallet = typeof window !== "undefined" && (detected.length > 0 || "ethereum" in window);

  return (
    <Dialog open={open} onClose={onClose} title="Connect a wallet">
      <p className="-mt-2 mb-5 text-sm text-ink-soft">
        CircleSave runs on Mezo Testnet. Your wallet signs every contribution and payout; nobody else can move your
        MUSD.
      </p>
      {hasWallet ? (
        <ul className="space-y-2">
          {list.map((c) => {
            const pending = isPending && variables?.connector && "id" in variables.connector && variables.connector.id === c.id;
            return (
              <li key={c.uid}>
                <button
                  onClick={async () => {
                    setError(null);
                    try {
                      await connectAsync({ connector: c, chainId: chain.id });
                    } catch (e) {
                      setError(humanizeError(e));
                    }
                  }}
                  disabled={isPending}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-rule-strong bg-surface px-4 py-3 text-left transition-colors hover:border-ink disabled:opacity-60"
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" className="size-8 rounded-lg" />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-lg bg-ink/5">
                      <Wallet className="size-4 text-ink-soft" />
                    </span>
                  )}
                  <span className="flex-1 font-semibold text-ink">{c.id === "injected" ? "Browser wallet" : c.name}</span>
                  {pending && <span className="text-[13px] text-ink-soft">Check your wallet</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-[12px] border border-rule p-4 text-sm text-ink-soft">
          No browser wallet found. Install{" "}
          <a className="link-quiet font-semibold text-ink" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          or{" "}
          <a className="link-quiet font-semibold text-ink" href="https://rabby.io" target="_blank" rel="noreferrer">
            Rabby
          </a>
          , then come back to this page.
        </div>
      )}
      {error && <p className="mt-4 text-sm text-ink">{error}</p>}
      <p className="mt-5 text-[13px] text-ink-soft">
        We&apos;ll ask your wallet to add Mezo Testnet (chain 31611) if it isn&apos;t there yet. On a phone, open this
        page in your wallet app&apos;s built-in browser.
      </p>
    </Dialog>
  );
}

export function ConnectButton({ size = "md", label = "Connect wallet", variant = "ink" as const }: { size?: "sm" | "md" | "lg"; label?: string; variant?: "ink" | "primary" | "outline" }) {
  const { open } = useConnectDialog();
  return (
    <Button variant={variant} size={size} onClick={open} icon={<Wallet className="size-4" />}>
      {label}
    </Button>
  );
}

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const balance = useMusdBalance(address);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  if (!mounted) return <div className="h-10 w-[140px]" />;
  if (!isConnected || !address) return <ConnectButton />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2.5 rounded-[var(--radius-control)] border border-ink/20 bg-surface pr-2.5 pl-1.5 text-sm font-semibold text-ink transition-colors hover:border-ink/50"
      >
        <MemberMark address={address} size={26} />
        <span className="tabular hidden sm:inline">{toMusd(balance.data)} MUSD</span>
        <span className="hidden h-4 w-px bg-rule-strong sm:inline-block" aria-hidden />
        <span className="tabular font-medium text-ink-soft">{shortAddress(address, 3)}</span>
        <ChevronDown className="size-4 text-ink-soft" />
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-[14px] border border-rule bg-surface p-1.5">
          <div className="px-3 py-2.5">
            <div className="text-[13px] text-ink-soft">Connected to Mezo Testnet</div>
            <div className="mt-0.5 font-semibold text-ink">{shortAddress(address, 6)}</div>
            <div className="tabular mt-1 text-sm text-ink-soft">{toMusd(balance.data)} MUSD</div>
          </div>
          <div className="my-1 h-px bg-rule" />
          <MenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            icon={copied ? <Check className="size-4 text-blue" /> : <Copy className="size-4" />}
          >
            {copied ? "Address copied" : "Copy address"}
          </MenuItem>
          <MenuLink href={`/u/${address}`} icon={<UserRound className="size-4" />} onClick={() => setMenu(false)}>
            Savings record
          </MenuLink>
          <a role="menuitem" href={explorerAddress(address)} target="_blank" rel="noreferrer" className={menuItemClass}>
            <ExternalLink className="size-4" /> View on explorer
          </a>
          <MenuItem
            onClick={() => {
              disconnect();
              setMenu(false);
            }}
            icon={<LogOut className="size-4" />}
          >
            Disconnect
          </MenuItem>
        </div>
      )}
    </div>
  );
}

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-sm font-medium text-ink hover:bg-ink/5";

function MenuItem({ children, icon, onClick }: { children: ReactNode; icon: ReactNode; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} className={menuItemClass}>
      {icon}
      {children}
    </button>
  );
}

function MenuLink({ children, icon, href, onClick }: { children: ReactNode; icon: ReactNode; href: string; onClick: () => void }) {
  return (
    <Link role="menuitem" href={href} onClick={onClick} className={menuItemClass}>
      {icon}
      {children}
    </Link>
  );
}

export function NetworkBanner() {
  const mounted = useMounted();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!mounted || !isConnected || chainId === chain.id) return null;
  return (
    <div className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4" />
          Your wallet is on another network. CircleSave runs on Mezo Testnet.
        </span>
        <Button size="sm" variant="primary" loading={isPending} onClick={() => switchChain({ chainId: chain.id })}>
          Switch to Mezo Testnet
        </Button>
      </div>
    </div>
  );
}

/** Small network indicator shown while connected to Mezo Testnet. */
export function NetworkBadge() {
  const mounted = useMounted();
  const { isConnected, chainId } = useAccount();
  if (!mounted || !isConnected || chainId !== chain.id) return null;
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-rule-strong px-2.5 py-1 text-[12px] font-semibold text-ink-soft lg:inline-flex">
      <span className="size-1.5 rounded-full bg-blue" aria-hidden />
      Mezo Testnet
    </span>
  );
}

/** Requires a connected wallet; otherwise shows a calm prompt in place of the content. */
export function RequireWallet({ children, title, body }: { children: ReactNode; title: string; body: string }) {
  const mounted = useMounted();
  const { isConnected } = useAccount();
  if (!mounted) return null;
  if (!isConnected)
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-3xl text-ink">{title}</h1>
        <p className="mt-3 text-ink-soft">{body}</p>
        <div className="mt-7 flex justify-center">
          <ConnectButton size="lg" variant="primary" />
        </div>
      </div>
    );
  return <>{children}</>;
}

export { cx };
