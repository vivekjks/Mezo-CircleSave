# CircleSave security review (v2)

Before the v2 redeploy on Mezo Testnet, the contracts were reviewed independently: every function, state
transition and money path. Each finding below was confirmed with a proof-of-concept Foundry test before
it was fixed, and each fix has a regression test in [`contracts/test/AuditFixes.t.sol`](../contracts/test/AuditFixes.t.sol).

**Result:** no accounting bug that lets anyone take funds by itself. The real problems were in governance and
the economic rules. All of them are fixed or mitigated in v2 (`SavingsCircle` `0x8330…be0f`,
`CircleFactory` `0x08ED…684c`, `CircleGovernor` `0xe689…5BB3`).

| ID | Severity | Finding | Fix in v2 | Regression test |
| --- | --- | --- | --- | --- |
| H-1 | High | A headcount majority of sybils could join a public emergency pool, contribute nothing and vote the honest members' deposits out. | Emergency pools must be invite-only. Only members who are up to date on every past round (and have paid in) can propose or vote. One request can take at most 50% of the pool. | `test_H1_*` (4 tests) |
| M-1 | Medium | A member who still owed debt could claim from the make-whole reserve, diluting the honest members it exists to repay. | `reserveClaimable` returns 0 while the member has debt. After repaying, they claim normally. | `test_M1_noReserveClaimWhileInDebt` |
| M-2 | Medium | The "random" payout order was seeded from values the caller of `start()` knows or controls. | **Mezo has no on-chain randomness**: `BLOCKHASH` and `PREVRANDAO` both return zero on Mezo Testnet (checked against the live RPC). A future-block draw is impossible, so the Random option is rejected. Circles use join order, or an order the creator sets that members can see before the start and leave over with a full refund. | `test_randomOrder_isRejected_noRandomnessOnMezo` |
| M-3 | Medium | Fixed-term penalties could be sniped with a large top-up just before closing, and pooled circles accepted money after maturity (a missed goal could even be flipped to "reached"). | No contributions or top-ups at or after maturity. No top-ups in fixed-term circles, so shares follow scheduled payments only. | `test_M3_*` (2 tests) |
| M-4 | Medium | In a rotating circle with no deposit, whoever is paid first can take the pot and stop paying. | Open (public) rotating circles must hold a deposit of at least one contribution per member. The deposit covers a missed round, and anything left becomes debt that is withheld from the defaulter's own payout. This risk is inherent to rotating circles and is stated in the app. | `test_M4_publicRotatingCirclesNeedADeposit` |
| L-1 | Low | An approved proposal never expired and could not be withdrawn, so it could sweep deposits made months later. | Approvals expire one voting period after the voting deadline. The requester can withdraw a pending or approved proposal. No proposals after maturity. Cap of 500 per circle. | `test_L1_*` (2 tests) |
| L-2 | Low | A pause did not move deadlines: right after an unpause, deposits of members who could not pay during the pause could be seized. | After an unpause, unpaid rounds can only be settled after a grace period (one period, at most 2 days). | `test_L2_membersGetGraceAfterUnpause` |
| L-3 | Low | The owner could pause forever, or renounce ownership while paused, freezing funds for good. | A pause lifts itself after 14 days, `renounceOwnership` is disabled, and claims stay open while paused. | `test_L3_*` (2 tests) |
| L-4 | Low | If every paying member left early, a member who paid nothing could collect all the penalties. | The equal-split fallback only counts members who paid in. If none remain, leftovers go to the treasury. | `test_L4_nonPayersNeverShareLeftovers` |
| L-5 | Low | A member removed by the creator could simply join again. | Removed addresses are banned from that circle. | `test_L5_removedMemberCannotRejoin` |
| L-6 | Low | A goal beneficiary could be the circle itself, the factory, the governor or the token, locking the pot forever. | Those addresses are rejected at creation. | `test_L6_beneficiaryCannotBeAProtocolAddress` |
| I-x | Info | `start()` had no deadline, the parent link was unchecked, and a huge contribution amount could overflow settlement. | Start only before joining closes. The parent must be a registered circle. Amounts are bounded (0.01 MUSD to 1e12 MUSD). | `test_info_*` (3 tests) |

## Checked and found safe

- **Initialization:** the implementation is locked with `_disableInitializers`, and every clone is initialised in the same transaction it is created.
- **Pulling funds:** `pullFunds` is `onlyCircle`, and every call site pulls only from `msg.sender`.
- **Access control:** governor-only hooks, and the governor can be set once.
- **Reentrancy:** every state-changing path is `nonReentrant`, and MUSD has no transfer callbacks.
- **No double payment or double claim:** guarded by one-way flags and monotonic round counters.
- **Collateral:** collateral, the reserve and pool balances stay separated. Each pot only uses that round's money plus seized collateral.
- **Loops are bounded:** at most 50 members and 120 rounds.
- **Invite signatures:** bound to chain id, circle and joiner. OpenZeppelin `ECDSA` enforces low-s.

## What a contract cannot do

It cannot make anyone pay a future round. Deposits, debt withholding, the make-whole reserve and the
on-chain savings record limit the damage and make defaults visible, but rotating circles still work best
among people who know each other. CircleSave is on testnet and has not had a paid third-party audit.

## Running the tests

```bash
cd contracts && forge test   # 59 tests: rotating, pooled, edge cases, audit regressions (incl. fuzz)
```
