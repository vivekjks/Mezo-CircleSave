"use client";

import { useAccount, useBalance } from "wagmi";
import { toast } from "sonner";
import { ADDR, musdFaucetAbi } from "@/lib/contracts";
import { useFaucet, useMounted, useMusdBalance, useNow, useTx } from "@/lib/hooks";
import { relativeTime, toMusd } from "@/lib/format";
import { chain, explorerAddress } from "@/lib/wagmi";
import { ConnectButton } from "@/components/wallet";
import { Button, Panel } from "@/components/ui";
import { SwapToMusd } from "@/components/swap-to-musd";

export default function GetMusdPage() {
  const mounted = useMounted();
  const { address, isConnected, connector } = useAccount();
  const musd = useMusdBalance(address);
  const btc = useBalance({ address, chainId: chain.id });
  const faucet = useFaucet(address);
  const { send, busy } = useTx();
  const t = useNow();

  const next = Number(faucet.nextClaimAt ?? 0n);
  const cooling = t > 0 && next > t;
  const empty = faucet.available !== undefined && faucet.drip !== undefined && faucet.available < faucet.drip;

  const addToken = async () => {
    try {
      const provider = (await connector?.getProvider()) as { request: (a: unknown) => Promise<unknown> } | undefined;
      await provider?.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: ADDR.musd, symbol: "MUSD", decimals: 18 } },
      });
    } catch {
      toast.error("Your wallet didn't add the token. You can add it manually with the address below.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="font-display text-[40px] leading-tight text-ink">Get MUSD for testing</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Circles are paid in MUSD, Mezo&apos;s Bitcoin-backed dollar. The quickest way in: take test BTC or MEZO from
        the Mezo faucet and swap it for MUSD right here on Mezo Pools. You can also use our faucet or borrow MUSD on Mezo.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Panel className="grid gap-8 p-6 sm:p-8 lg:col-span-2 lg:grid-cols-[1fr_420px]">
          <div>
            <h2 className="font-display text-2xl text-ink">Swap BTC or MEZO for MUSD</h2>
            <p className="mt-2 max-w-md text-[15px] text-ink-soft">
              CircleSave routes the swap through Mezo Pools, Mezo&apos;s own exchange, using the MUSD/BTC and MUSD/MEZO
              pools. The MUSD lands in your wallet, ready for your next round.
            </p>
            <ol className="mt-6 space-y-3 text-[15px] text-ink">
              <li>
                <span className="font-semibold">1.</span> Get test BTC and MEZO from the{" "}
                <a className="link-quiet font-semibold" href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">
                  Mezo faucet
                </a>
                .
              </li>
              <li>
                <span className="font-semibold">2.</span> Choose how much to swap. You see the MUSD you&apos;ll get before you sign.
              </li>
              <li>
                <span className="font-semibold">3.</span> Approve once, then swap. A little BTC is always kept back for gas.
              </li>
            </ol>
          </div>
          <SwapToMusd />
        </Panel>
        <Panel className="p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">CircleSave faucet</h2>
          <p className="mt-2 text-[15px] text-ink-soft">
            Real testnet MUSD, {faucet.drip ? toMusd(faucet.drip, 0) : "20"} at a time, once every 12 hours per wallet.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-ink-soft">Your MUSD</dt>
              <dd className="tabular mt-1 text-xl font-semibold text-ink">{mounted && address ? toMusd(musd.data) : "–"}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Your testnet BTC</dt>
              <dd className="tabular mt-1 text-xl font-semibold text-ink">
                {mounted && btc.data ? Number(btc.data.formatted).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-soft">Left in the faucet</dt>
              <dd className="tabular mt-1 text-xl font-semibold text-ink">{toMusd(faucet.available, 0)}</dd>
            </div>
          </dl>
          <div className="mt-7">
            {!mounted ? null : !isConnected ? (
              <ConnectButton variant="primary" />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={cooling || empty}
                  loading={busy === "faucet"}
                  onClick={() =>
                    send(
                      "faucet",
                      "Claim test MUSD",
                      { address: ADDR.faucet, abi: musdFaucetAbi, functionName: "claim" },
                      { success: `${toMusd(faucet.drip, 0)} MUSD sent to your wallet` },
                    )
                  }
                >
                  Claim {toMusd(faucet.drip, 0)} MUSD
                </Button>
                <Button variant="ghost" onClick={addToken}>
                  Add MUSD to wallet
                </Button>
              </div>
            )}
            {cooling && <p className="mt-3 text-sm text-ink-soft">You can claim again {relativeTime(next, t)}.</p>}
            {empty && <p className="mt-3 text-sm text-ink">The faucet is empty right now. Use the Mezo borrow route instead.</p>}
            {mounted && btc.data && btc.data.value === 0n && (
              <p className="mt-3 text-sm text-ink">
                You&apos;ll need a little testnet BTC for gas first. Get some from the{" "}
                <a className="link-quiet font-semibold" href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">
                  Mezo faucet
                </a>
                .
              </p>
            )}
          </div>
        </Panel>

        <Panel className="p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">Borrow MUSD on Mezo</h2>
          <p className="mt-2 text-[15px] text-ink-soft">This is how MUSD is made: you lock BTC and mint MUSD against it.</p>
          <ol className="mt-6 space-y-5">
            {[
              {
                t: "Get testnet BTC",
                b: (
                  <>
                    Request BTC from the{" "}
                    <a className="link-quiet font-semibold text-ink" href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">
                      Mezo faucet
                    </a>
                    . It also pays your gas on CircleSave.
                  </>
                ),
              },
              {
                t: "Open a loan",
                b: (
                  <>
                    Go to{" "}
                    <a className="link-quiet font-semibold text-ink" href="https://mezo.org/feature/borrow" target="_blank" rel="noreferrer">
                      mezo.org/feature/borrow
                    </a>{" "}
                    on testnet. The minimum loan is 2,000 MUSD.
                  </>
                ),
              },
              { t: "Come back and save", b: "Your MUSD balance shows in the top bar once it lands." },
            ].map((s, i) => (
              <li key={s.t} className="grid grid-cols-[32px_1fr] gap-3">
                <span className="flex size-8 items-center justify-center rounded-full border border-rule-strong font-display text-ink">{i + 1}</span>
                <div>
                  <div className="font-semibold text-ink">{s.t}</div>
                  <p className="mt-0.5 text-[15px] text-ink-soft">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-7 rounded-[12px] border border-rule p-4 text-[13px] text-ink-soft">
            <div className="font-semibold text-ink">Testnet MUSD token</div>
            <a href={explorerAddress(ADDR.musd)} target="_blank" rel="noreferrer" className="tabular link-quiet mt-1 block break-all">
              {ADDR.musd}
            </a>
            <div className="mt-2">18 decimals. Network: Mezo Testnet, chain 31611.</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
