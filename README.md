# CircleSave

Group savings circles on Mezo, paid in MUSD. Friends, families and communities save together in a
smart contract. Every contribution, payout and vote is recorded on-chain, so nobody has to keep the
book or trust a treasurer.

- **Network:** Mezo Testnet (chain 31611)
- **Asset:** MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- **App:** Next.js 16 + wagmi/viem, deployed on Vercel
- **Contracts:** Solidity 0.8.28 (EVM `london`, as Mezo recommends), Foundry

## Deployed contracts (Mezo Testnet, all source-verified)

| Contract | Address | Role |
| --- | --- | --- |
| `CircleFactory` | [`0x0C19cc4166aBC4E67556992C5BfD84A2c147C995`](https://explorer.test.mezo.org/address/0x0C19cc4166aBC4E67556992C5BfD84A2c147C995) | Creates circles (EIP-1167 clones), single MUSD spender, reputation, fees, emergency pause |
| `SavingsCircle` (implementation) | [`0xEC300fF5A99A499454C13082f7Aa86E8C9b3691E`](https://explorer.test.mezo.org/address/0xEC300fF5A99A499454C13082f7Aa86E8C9b3691E) | Logic for every circle: membership, contributions, payouts, collateral, activity log |
| `CircleGovernor` | [`0x1FA98390A2E566c7F687834b9baF2396ADDCBf98`](https://explorer.test.mezo.org/address/0x1FA98390A2E566c7F687834b9baF2396ADDCBf98) | Group voting: emergency withdrawal requests and early dissolution |
| `CircleLens` | [`0x81AB031F71e76E13438B68da61458Bbbf10102E6`](https://explorer.test.mezo.org/address/0x81AB031F71e76E13438B68da61458Bbbf10102E6) | Read-only aggregator used by the app |
| `MusdFaucet` | [`0x1B2cF8203b05FBB30efEe84531Af42317C793aef`](https://explorer.test.mezo.org/address/0x1B2cF8203b05FBB30efEe84531Af42317C793aef) | Testnet helper that drips real testnet MUSD |

Factory owner and fee recipient: `0x10ac9924a78051BdD770978740C5084205cdB628`. Protocol fee: 0.25% of
payouts, fixed per circle at creation, hard-capped at 2%. Refunds are always fee-free.

## Savings models

| Model | How money moves | Safeguards |
| --- | --- | --- |
| **Rotating** (tanda, susu, chit fund) | Everyone pays each round; one member takes the whole pot, in join order, a random draw, or a creator-set order | Optional collateral covers missed rounds. Uncovered amounts become debt, withheld from the defaulter's own payout and returned to whoever came up short (make-whole reserve). Debts can be repaid any time. |
| **Goal** | Members save toward a target (scheduled + optional top-ups) | On reaching the goal the pot goes to a beneficiary or back to members pro-rata. Missed deadline means a fee-free refund. |
| **Fixed term** | Funds are locked until maturity, then claimed pro-rata | Early exit allowed with a penalty that stays in the pool for those who stay. |
| **Emergency pool** | Members request withdrawals; the group votes | Approval threshold and voting window fixed at creation; requester can't vote; leftover refunded by net contribution. |

Every non-rotating circle can also be dissolved early by a vote (fee-free pro-rata refund).

## What's on-chain

Everything that matters is stored in contract state:

- circle settings and the group's written rules (name, description and rules live in the factory)
- membership, join order and payout order
- a per-member, per-round payment bitmap (paid, paid late, missed)
- contributions, payouts, collateral, debts and the make-whole reserve
- proposals, votes and their outcomes
- a full activity log; the app resolves each entry's transaction hash for explorer links
- a reputation record per wallet (on-time, late and missed payments, circles completed)

Private circles store only an invite-signer address. The invite key is derived from a signature
by the creator's wallet, travels in the link's URL fragment (never sent to a server), and is used to sign
each joiner's own address, so a link can't be replayed from on-chain data.

## Security notes

- `ReentrancyGuard` on every state-changing entry point, `SafeERC20` for all transfers
- funds leave only through rule-checked paths; no admin withdrawal of member funds
- duplicate contributions and payouts are prevented by payment bitmaps and round counters
- the factory is the only MUSD spender, and only registered circles can pull funds, only from the caller
- the protocol pause blocks joins, contributions, payouts and votes; leaving open circles,
  cancelling and withdrawing collateral stay available
- limits: 50 members, 120 rounds, periods of 5 minutes to 365 days
- not audited yet. Testnet only.

## Repository layout

```
contracts/   Foundry project: src/, test/ (28 tests incl. fuzz), script/Deploy.s.sol, deployments/
web/         Next.js app: landing, explore, dashboard, create wizard, circle pages, invites, profiles, faucet
```

## Run it

```bash
# contracts
cd contracts
npm install                 # OpenZeppelin 5.0.2
forge test                  # 28 passing
PRIVATE_KEY=0x… forge script script/Deploy.s.sol --rpc-url https://rpc.test.mezo.org --broadcast --slow

# web
cd web
npm install
node scripts/sync-abis.mjs  # after redeploying contracts
npm run dev                 # http://localhost:3000
```

`web/scripts/e2e-testnet.ts` runs a full scenario against the live deployment with three real wallets:
a complete rotating cycle with a late payment and a collateral-covered miss, a private emergency pool
with votes and an executed withdrawal, and a goal circle released to its beneficiary. It also leaves
two public circles open for visitors.

## Live on testnet

These circles were run end to end on Mezo Testnet with three separate wallets (`web/scripts/e2e-testnet.ts`,
full transcript in `contracts/deployments/e2e-run*.log`):

| Circle | What happened on-chain |
| --- | --- |
| [Friends Savings Circle](https://circlesave-mezo.vercel.app/circle/0xBe5Cac8e3Ec0b58B1f59f7C9D9184b8fE76527ba) | Rotating, 3 members, 1 MUSD rounds. All three rounds paid out (8.98 MUSD). One member paid round 2 late, then missed round 3; her deposit covered it so the pot was still full. Deposits withdrawn. |
| [Family Safety Net](https://circlesave-mezo.vercel.app/circle/0xBC5CD26c2e43590f2Fb10f3aAf392fFA34165bE6) | Private emergency pool joined with signed invites. A 1 MUSD request was approved 2/2 and paid out; a second request is open for voting. |
| [Lisbon Trip Fund](https://circlesave-mezo.vercel.app/circle/0x895663c16c1a4A14AAe2F9A425Aee96ff061c5A9) | Goal circle. Scheduled payments plus a top-up reached the 3 MUSD target and the pot was released to the beneficiary. |
| [Weekly Neighbourhood Tanda](https://circlesave-mezo.vercel.app/join/0xd493aEff73C2382545433eA74F0E8B1E73C14B81) | Public rotating circle, open for anyone to join. |
| [Study Group Savings](https://circlesave-mezo.vercel.app/join/0x08f25A7E39212dfC00D48736EDa4485473732187) | Public fixed-term circle, open for anyone to join. |

The UI itself was also driven through every main flow against a fork of Mezo Testnet with a test wallet:
creating a private circle, sharing and opening the invite link, joining with the signed invite, approving
MUSD, paying, paying out, requesting emergency help, voting and executing.

## Getting test MUSD

Use the in-app faucet (`/get-musd`) or borrow MUSD against testnet BTC at
[mezo.org/feature/borrow](https://mezo.org/feature/borrow). Testnet BTC for gas comes from
[faucet.test.mezo.org](https://faucet.test.mezo.org).
