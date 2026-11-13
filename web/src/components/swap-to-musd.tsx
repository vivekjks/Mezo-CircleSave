"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { ArrowDown } from "lucide-react";
import { ADDR, erc20Abi } from "@/lib/contracts";
import { DEX, routeToMusd, routerAbi, SWAP_TOKENS, withSlippage, type SwapToken } from "@/lib/mezo-dex";
import { useMounted, useTx } from "@/lib/hooks";
import { toMusd } from "@/lib/format";
import { chain, explorerAddress } from "@/lib/wagmi";
import { ConnectButton } from "./wallet";
import { Button, Segmented, cx, inputClass } from "./ui";

const ONE = 10n ** 18n;
const GAS_RESERVE = 10n ** 14n; // keep 0.0001 BTC for gas

function parseAmount(v: string): bigint | null {
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") return null;
  try {
    return parseUnits(v, 18);
  } catch {
    return null;
  }
}

const fmt = (v: bigint | undefined, digits = 6) =>
  v === undefined ? "–" : Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * Swap BTC or MEZO into MUSD through Mezo Pools (the MUSD/BTC and MUSD/MEZO basic pools),
 * using Mezo's own router. `needMusd` pre-fills an input that covers that much MUSD.
 */
export function SwapToMusd({ needMusd, onDone }: { needMusd?: bigint; onDone?: () => void }) {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [token, setToken] = useState<SwapToken>("BTC");
  const [input, setInput] = useState("");
  const { send, busy } = useTx();
  const t = SWAP_TOKENS[token];

  const btc = useBalance({ address, chainId: chain.id, query: { enabled: !!address } });
  const mezo = useReadContract({ address: SWAP_TOKENS.MEZO.address, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const balance = token === "BTC" ? btc.data?.value : mezo.data;
  const spendable = balance === undefined ? undefined : token === "BTC" ? (balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n) : balance;

  const rate = useReadContract({
    address: DEX.router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [ONE, routeToMusd(token)],
    query: { refetchInterval: 20_000 },
  });
  const musdPerUnit = rate.data?.[1];

  // what the user typed, or what covers `needMusd` (+3% for price movement and the pool fee)
  const suggested = needMusd && musdPerUnit ? (needMusd * ONE * 103n) / (musdPerUnit * 100n) + 1n : undefined;
  const amountIn = input ? parseAmount(input) : (suggested ?? null);

  const quote = useReadContract({
    address: DEX.router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: amountIn && amountIn > 0n ? [amountIn, routeToMusd(token)] : undefined,
    query: { enabled: !!amountIn && amountIn > 0n, refetchInterval: 15_000 },
  });
  const out = quote.data?.[1];

  const allowance = useReadContract({
    address: t.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, DEX.router] : undefined,
    query: { enabled: !!address },
  });

  const tooMuch = amountIn !== null && spendable !== undefined && amountIn > spendable;
  const canSwap = !!address && !!amountIn && amountIn > 0n && !!out && out > 0n && !tooMuch;

  const swap = async () => {
    if (!address || !amountIn || !out) return;
    if ((allowance.data ?? 0n) < amountIn) {
      const ok = await send(
        "swap-approve",
        `Allow Mezo Pools to use ${t.symbol}`,
        { address: t.address, abi: erc20Abi, functionName: "approve", args: [DEX.router, amountIn] },
        { quiet: true, success: `${t.symbol} allowance set` },
      );
      if (!ok) return;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const r = await send(
      "swap",
      `Swap ${t.symbol} for MUSD`,
      {
        address: DEX.router,
        abi: routerAbi,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, withSlippage(out), routeToMusd(token), address, deadline],
      },
      { success: `Swapped for about ${toMusd(out)} MUSD` },
    );
    if (r) {
      setInput("");
      onDone?.();
    }
  };

  if (!mounted) return null;
  return (
    <div className="space-y-4">
      <Segmented
        name="Pay with"
        value={token}
        onChange={(v) => {
          setToken(v);
          setInput("");
        }}
        options={[
          { value: "BTC" as SwapToken, label: "BTC", sub: `Balance ${fmt(btc.data?.value)}` },
          { value: "MEZO" as SwapToken, label: "MEZO", sub: `Balance ${fmt(mezo.data, 2)}` },
        ]}
      />
      <div>
        <label htmlFor="swap-in" className="flex justify-between text-sm font-semibold text-ink">
          <span>You pay</span>
          {spendable !== undefined && spendable > 0n && (
            <button type="button" className="text-[13px] font-semibold text-blue hover:underline" onClick={() => setInput(formatUnits(spendable, 18))}>
              Use max
            </button>
          )}
        </label>
        <div className="relative mt-1.5">
          <input
            id="swap-in"
            inputMode="decimal"
            autoComplete="off"
            className={cx(inputClass, "tabular pr-16 text-lg font-semibold")}
            placeholder="0.0"
            value={input || (suggested ? formatUnits(suggested, 18).slice(0, 12) : "")}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              if ((v.match(/\./g) || []).length <= 1) setInput(v);
            }}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-ink-soft">{t.symbol}</span>
        </div>
        {tooMuch && (
          <p className="mt-1.5 text-[13px] text-ink">
            That&apos;s more than you can spend{token === "BTC" ? " (a little BTC is kept for gas)" : ""}.
          </p>
        )}
      </div>
      <div className="flex justify-center text-ink-faint" aria-hidden>
        <ArrowDown className="size-4" />
      </div>
      <div className="rounded-[var(--radius-control)] border border-rule px-3.5 py-3">
        <div className="text-sm text-ink-soft">You get about</div>
        <div className="tabular mt-0.5 text-lg font-semibold text-ink">{out ? `${toMusd(out)} MUSD` : "–"}</div>
        <div className="mt-1 text-[12px] text-ink-faint">
          {musdPerUnit ? `1 ${t.symbol} ≈ ${toMusd(musdPerUnit)} MUSD. ` : ""}At least {out ? toMusd(withSlippage(out)) : "–"} MUSD or the swap
          is undone (1% slippage).
        </div>
      </div>
      {!isConnected ? (
        <ConnectButton variant="primary" />
      ) : (
        <Button variant="primary" size="lg" className="w-full" disabled={!canSwap} loading={busy === "swap" || busy === "swap-approve"} onClick={swap}>
          Swap {t.symbol} for MUSD
        </Button>
      )}
      <p className="text-[12px] text-ink-faint">
        Routed through{" "}
        <a className="link-quiet" href={explorerAddress(DEX.router)} target="_blank" rel="noreferrer">
          Mezo Pools
        </a>
        , Mezo&apos;s own exchange, straight to your wallet ({ADDR.musd.slice(0, 6)}… is MUSD).
      </p>
    </div>
  );
}
