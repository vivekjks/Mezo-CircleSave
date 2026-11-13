# AKINDO submission: Mezo Buildathon, Wave 2

Answers for each field of the AKINDO form, ready to paste.

**Project name:** CircleSave

**Project category:** Group savings, MUSD payments, community finance

**TL;DR:** CircleSave runs savings circles (tandas, susus, chit funds) on Mezo. Members pay MUSD into a
smart contract every round, the pot goes to whoever's turn it is, and every payment, payout and vote is
recorded on-chain for the whole group to see.

**Live project (Mezo Testnet):** https://circlesave-mezo.vercel.app

**Public GitHub repository:** https://github.com/vivekjks/Mezo-CircleSave

**Track:** Track 2 (Access and Distribution for MUSD/MEZO). It also touches Track 1 through composability with Mezo Pools.

**Chain deployed on:** Mezo (Testnet, chain 31611)

**Project status:** Entirely new, built during the buildathon.

**Project readiness:** Testnet deployment. Contracts are source-verified, and the app is live and fully usable.

## How it works

**Problem.** Hundreds of millions of people save in rotating groups: tandas in Mexico, susus in West
Africa and the Caribbean, chit funds and committees in South Asia, chamas in Kenya. They run on trust in
one treasurer and a notebook. Payments get disputed, the treasurer can disappear with the pot, and nobody
can check the record.

**Solution.** CircleSave turns the circle into a smart contract on Mezo:

- **Four models:**
  - rotating (everyone takes the pot once)
  - goal (save toward a target, released to a recipient or back to members)
  - fixed term (locked until the end date, early exit pays a penalty to the stayers)
  - emergency pool (members ask for help and the group votes)
- **The contract enforces the rules:** deposits cover missed rounds, uncovered misses become debt that is withheld from the defaulter's own payout and returned to whoever came up short, and votes need a fixed majority of up-to-date members.
- **Everything is on-chain:**
  - circle settings and the group's written rules
  - a per-round payment ledger
  - payouts and votes
  - an activity log with explorer links
  - a portable on-chain savings record (on-time, late and missed payments) for every wallet

**How MUSD and MEZO are used.**

- **MUSD is the unit of account:** every contribution, deposit, payout, refund and fee is in MUSD.
- **One-transaction payments:** joining and paying use MUSD's EIP-2612 `permit` (`joinWithPermit`, `contributeWithPermit`), so there's no separate approval.
- **Mezo Pools integration:** users swap test **BTC or MEZO into MUSD inside the app** through Mezo's own router (MUSD/BTC and MUSD/MEZO pools). Anyone can go from the Mezo faucet to a funded circle in a minute, without the 2,000 MUSD minimum of a borrow position.
- **It extends MUSD's reach:** it turns MUSD from a borrowing output into everyday group savings money, aimed at the communities that already save together.

## Target group

Friends, families and community groups who already save together, starting with the rotating-savings
cultures above (Latin America, Africa, South Asia, diaspora communities sending money home). No DeFi
knowledge is needed: plain-language rules, invite links that work in WhatsApp, a mobile-friendly UI and
reminders with calendar export. Mobile and desktop.

## Tech stack

- **Contracts:** Solidity 0.8.28 (EVM `london` for Mezo), Foundry, OpenZeppelin 5.0.2, EIP-1167 clones. Four contracts: factory, savings circle, governor and lens, plus a test-MUSD faucet.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, wagmi 2 and viem 2 (EIP-6963 wallet discovery), TanStack Query, Motion.
- **Mezo:** MUSD (with `permit`), Mezo Pools router (BTC/MEZO to MUSD swaps), Mezo Testnet RPC and explorer.
- **Hosting:** Vercel (Node runtime), with dynamic link-preview images, a health endpoint and Vercel Analytics.

## What changed since Wave 1

- **Security review and v2 redeploy:** 12 findings fixed (one high), with 21 regression tests. 59 Foundry tests in total. See [`docs/SECURITY.md`](SECURITY.md).
- **Mezo Pools integration:** in-app BTC/MEZO to MUSD swaps, offered inline whenever a member is short of MUSD.
- **MUSD `permit`:** join and pay in one transaction.
- **Governance hardening:** invite-only emergency pools, up-to-date voters only, 50% cap per request, expiring approvals.
- **Mezo-specific finding:** Mezo exposes no on-chain randomness (`BLOCKHASH` and `PREVRANDAO` return 0), so the manipulable random payout order was replaced with verifiable orders.
- **Redesigned UI:** a live on-chain circle preview on the landing page, a dashboard-style circle page, identicons and share images for invite links.
- **New live run:** a fresh end-to-end run on Mezo Testnet with three real wallets, with all transactions linked in the README.

## Future milestones

1. **Mainnet beta (4–6 weeks after the buildathon):** a third-party audit, Mezo Mainnet deployment, Mezo Passport so Bitcoin wallets can sign in, and WalletConnect for mobile.
2. **Yield on idle pools (2–3 months):** route the balances of goal and fixed-term pools into MUSD savings vaults as they come online on Mezo, with the yield shared pro-rata.
3. **Reach (3–6 months):** Telegram and WhatsApp reminder bots, and partnerships with diaspora community groups and savings clubs.

## Team info

Fill in members, roles, and X or LinkedIn.
