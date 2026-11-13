// End-to-end run against the live Mezo Testnet deployment, with three real wallets.
// Usage (from web/):  node scripts/e2e-testnet.ts
// Keys are read from ../contracts/.env.ops and ../contracts/.env.e2e (created if missing, never committed).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEventLogs,
  parseUnits,
  formatUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mezoTestnet } from "viem/chains";
import { circleFactoryAbi, circleGovernorAbi, circleLensAbi, musdFaucetAbi, savingsCircleAbi } from "../src/lib/contracts/abis.ts";
import { deployment } from "../src/lib/contracts/deployment.ts";

const root = join(import.meta.dirname, "..", "..", "contracts");
const env = (file: string) =>
  Object.fromEntries(
    readFileSync(join(root, file), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );

if (!existsSync(join(root, ".env.e2e"))) {
  writeFileSync(join(root, ".env.e2e"), `# CircleSave e2e test wallets (testnet only)\nJOHN_KEY=${generatePrivateKey()}\nSARAH_KEY=${generatePrivateKey()}\n`);
}
const ops = privateKeyToAccount(env(".env.ops").OPS_PRIVATE_KEY as Hex);
const e2e = env(".env.e2e");
const john = privateKeyToAccount(e2e.JOHN_KEY as Hex);
const sarah = privateKeyToAccount(e2e.SARAH_KEY as Hex);
const NAMES = new Map([
  [ops.address, "Alex (ops)"],
  [john.address, "John"],
  [sarah.address, "Sarah"],
]);

const statePath = join(root, "deployments", "demo-31611.json");
const state: Record<string, string> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

const pub = createPublicClient({ chain: mezoTestnet, transport: http("https://rpc.test.mezo.org") });
const wallet = (a: PrivateKeyAccount) => createWalletClient({ account: a, chain: mezoTestnet, transport: http("https://rpc.test.mezo.org") });
const MUSD = deployment.musd as Address;
const FACTORY = deployment.factory as Address;
const GOV = deployment.governor as Address;
const u = (v: string) => parseUnits(v, 18);
const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

async function tx(who: PrivateKeyAccount, address: Address, abi: Abi, functionName: string, args: unknown[] = [], label?: string) {
  const req = { address, abi, functionName, args, account: who } as const;
  const gas = await pub.estimateContractGas(req as never);
  const floors: Record<string, bigint> = { createCircle: 1_800_000n, start: 2_500_000n, settleRound: 2_200_000n, finalize: 1_800_000n, execute: 1_800_000n };
  const padded = (gas * 15n) / 10n + 50_000n;
  const floor = floors[functionName] ?? 500_000n;
  const hash = await wallet(who).writeContract({ ...(req as object), gas: padded > floor ? padded : floor } as never);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (r.status !== "success") throw new Error(`${label ?? functionName} reverted: ${hash}`);
  console.log(`  ✓ ${NAMES.get(who.address)}: ${label ?? functionName}  ${hash}`);
  return r;
}

async function chainNow() {
  return Number((await pub.getBlock()).timestamp);
}
async function waitUntil(ts: number, why: string) {
  let now = await chainNow();
  if (now >= ts) return;
  console.log(`  … waiting ${ts - now}s for ${why}`);
  while (now < ts) {
    await new Promise((r) => setTimeout(r, Math.min(15_000, (ts - now) * 1000 + 2000)));
    now = await chainNow();
  }
}

const bal = (a: Address) => pub.readContract({ address: MUSD, abi: erc20, functionName: "balanceOf", args: [a] });

function inviteMessage(creator: Address, nonce: number) {
  return [
    "CircleSave private invite key",
    "",
    "Signing creates the invite link for one of your circles.",
    "It does not move funds and costs no gas.",
    "",
    `Creator: ${creator}`,
    `Factory: ${FACTORY}`,
    `Circle number: ${nonce}`,
  ].join("\n");
}

type P = {
  model: number;
  payoutOrder?: number;
  contribution: string;
  collateral?: string;
  goal?: string;
  beneficiary?: Address;
  period: number;
  voting?: number;
  maxMembers: number;
  rounds?: number;
  approvalBps?: number;
  penaltyBps?: number;
  joinWindow: number;
  inviteSigner?: Address;
  creatorJoins?: boolean;
};

async function createCircle(key: string, name: string, description: string, rules: string, p: P): Promise<Address> {
  if (state[key]) {
    console.log(`• ${name}: already created at ${state[key]}`);
    return state[key] as Address;
  }
  console.log(`• Creating "${name}"`);
  const params = {
    model: p.model,
    payoutOrder: p.payoutOrder ?? 0,
    contributionAmount: u(p.contribution),
    collateralAmount: u(p.collateral ?? "0"),
    goalAmount: u(p.goal ?? "0"),
    beneficiary: p.beneficiary ?? "0x0000000000000000000000000000000000000000",
    periodDuration: p.period,
    votingPeriod: p.voting ?? 0,
    maxMembers: p.maxMembers,
    totalRounds: p.rounds ?? 0,
    approvalBps: p.approvalBps ?? 6000,
    earlyExitPenaltyBps: p.penaltyBps ?? 0,
    joinDeadline: BigInt((await chainNow()) + p.joinWindow),
    inviteSigner: p.inviteSigner ?? "0x0000000000000000000000000000000000000000",
    parent: "0x0000000000000000000000000000000000000000",
    creatorJoins: p.creatorJoins ?? true,
  };
  const r = await tx(ops, FACTORY, circleFactoryAbi as Abi, "createCircle", [params, { name, description, rules }], `create ${name}`);
  const [log] = parseEventLogs({ abi: circleFactoryAbi, logs: r.logs, eventName: "CircleCreated" });
  state[key] = log.args.circle;
  save();
  return log.args.circle;
}

const summary = (c: Address) => pub.readContract({ address: deployment.lens as Address, abi: circleLensAbi, functionName: "getSummary", args: [c] });
const isMember = (c: Address, a: Address) => pub.readContract({ address: c, abi: savingsCircleAbi, functionName: "isMember", args: [a] });
const bits = (c: Address, a: Address) => pub.readContract({ address: c, abi: savingsCircleAbi, functionName: "getPaymentBits", args: [a] });

async function payIfNeeded(c: Address, who: PrivateKeyAccount, round: number) {
  const [paid] = await bits(c, who.address);
  if ((paid >> BigInt(round)) & 1n) return;
  await tx(who, c, savingsCircleAbi as Abi, "contribute", [round], `pay round ${round + 1}`);
}

async function main() {
  console.log("Wallets:", [...NAMES].map(([a, n]) => `${n}=${a}`).join("  "));

  // ── funding & approvals
  for (const w of [john, sarah]) {
    const btc = await pub.getBalance({ address: w.address });
    if (btc < parseUnits("0.0001", 18)) {
      const hash = await wallet(ops).sendTransaction({ to: w.address, value: parseUnits("0.0003", 18) });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  ✓ gas for ${NAMES.get(w.address)}  ${hash}`);
    }
    if ((await bal(w.address)) < u("4")) await tx(ops, MUSD, erc20 as Abi, "transfer", [w.address, u("5")], `send 5 MUSD to ${NAMES.get(w.address)}`);
  }
  for (const w of [ops, john, sarah]) {
    const a = await pub.readContract({ address: MUSD, abi: erc20, functionName: "allowance", args: [w.address, FACTORY] });
    if (a < u("100")) await tx(w, MUSD, erc20 as Abi, "approve", [FACTORY, u("1000")], "approve CircleSave");
  }

  // ── 1. rotating circle, full cycle with a late payment and a missed round
  const rot = await createCircle(
    "rotating",
    "Friends Savings Circle",
    "Three friends saving together with five-minute rounds, to show a full rotation end to end.",
    "Pay before each deadline. A missed round is covered by your deposit.",
    { model: 0, contribution: "1", collateral: "1", period: 300, maxMembers: 3, joinWindow: 3600 },
  );
  for (const w of [john, sarah]) if (!(await isMember(rot, w.address))) await tx(w, rot, savingsCircleAbi as Abi, "join", ["0x"], "join rotating circle");
  let s = await summary(rot);
  if (s.status === 0) await tx(ops, rot, savingsCircleAbi as Abi, "start", [], "start rotating circle");
  s = await summary(rot);
  const start = Number(s.startTime);
  if (s.status === 1 && s.roundsSettled === 0) {
    for (const w of [ops, john, sarah]) await payIfNeeded(rot, w, 0);
    await tx(john, rot, savingsCircleAbi as Abi, "settleRound", [], "pay out round 1");
  }
  s = await summary(rot);
  if (s.status === 1 && s.roundsSettled === 1) {
    await waitUntil(start + 300, "round 2 to open");
    await payIfNeeded(rot, ops, 1);
    await payIfNeeded(rot, john, 1);
    await waitUntil(start + 601, "round 2 deadline (Sarah pays late)");
    await payIfNeeded(rot, sarah, 1);
    await tx(ops, rot, savingsCircleAbi as Abi, "settleRound", [], "pay out round 2");
  }
  s = await summary(rot);
  if (s.status === 1 && s.roundsSettled === 2) {
    await payIfNeeded(rot, ops, 2);
    await payIfNeeded(rot, john, 2);
    await waitUntil(start + 901, "round 3 deadline (Sarah misses)");
    await tx(john, rot, savingsCircleAbi as Abi, "settleRound", [], "pay out round 3, deposit covers Sarah");
  }
  s = await summary(rot);
  console.log(`  rotating status=${s.status} settled=${s.roundsSettled}/${s.totalRounds} paidOut=${formatUnits(s.totalPaidOut, 18)}`);
  if (s.status === 2) {
    for (const w of [ops, john]) {
      const m = await pub.readContract({ address: rot, abi: savingsCircleAbi, functionName: "getMember", args: [w.address] });
      if (m.collateral > 0n) await tx(w, rot, savingsCircleAbi as Abi, "withdraw", [], "withdraw deposit");
    }
  }

  // ── 2. private emergency pool with votes
  const created = await pub.readContract({ address: FACTORY, abi: circleFactoryAbi, functionName: "createdBy", args: [ops.address] });
  const nonce = state.emergency ? -1 : created.length;
  let inviteKey: Hex | undefined;
  if (nonce >= 0) {
    const sig = await ops.signMessage({ message: inviteMessage(ops.address, nonce) });
    inviteKey = keccak256(sig);
  }
  const emg = await createCircle(
    "emergency",
    "Family Safety Net",
    "A shared emergency fund for the three of us. Ask when something goes wrong; the others vote.",
    "Only for real emergencies. Say why in your request and vote within a day.",
    { model: 3, contribution: "1", period: 86400, voting: 86400, maxMembers: 4, rounds: 6, joinWindow: 3600, inviteSigner: inviteKey ? privateKeyToAccount(inviteKey).address : undefined },
  );
  if (inviteKey) {
    state.emergencyInvite = `/join/${emg}#k=${inviteKey}`;
    save();
  }
  const keyForJoin = inviteKey ?? (state.emergencyInvite?.split("#k=")[1] as Hex | undefined);
  for (const w of [john, sarah]) {
    if (await isMember(emg, w.address)) continue;
    const digest = await pub.readContract({ address: emg, abi: savingsCircleAbi, functionName: "inviteDigest", args: [w.address] });
    const sig = await privateKeyToAccount(keyForJoin!).signMessage({ message: { raw: digest } });
    await tx(w, emg, savingsCircleAbi as Abi, "join", [sig], "join emergency pool with invite");
  }
  s = await summary(emg);
  if (s.status === 0) await tx(ops, emg, savingsCircleAbi as Abi, "start", [], "start emergency pool");
  for (const w of [ops, john, sarah]) await payIfNeeded(emg, w, 0);
  const count = await pub.readContract({ address: GOV, abi: circleGovernorAbi, functionName: "proposalCount", args: [emg] });
  if (count === 0n) {
    await tx(john, GOV, circleGovernorAbi as Abi, "propose", [emg, 0, u("1"), "Car broke down on the way to work"], "request 1 MUSD");
    await tx(ops, GOV, circleGovernorAbi as Abi, "vote", [emg, 0n, true], "vote yes");
    await tx(sarah, GOV, circleGovernorAbi as Abi, "vote", [emg, 0n, true], "vote yes");
    await tx(sarah, GOV, circleGovernorAbi as Abi, "execute", [emg, 0n], "carry out request");
    await tx(sarah, GOV, circleGovernorAbi as Abi, "propose", [emg, 0, u("0.5"), "Pharmacy run for my son"], "request 0.5 MUSD");
    await tx(ops, GOV, circleGovernorAbi as Abi, "vote", [emg, 1n, true], "vote yes (still open)");
  }

  // ── 3. goal circle released to a beneficiary
  const goal = await createCircle(
    "goal",
    "Lisbon Trip Fund",
    "Saving for the September trip. Once we hit the target, Alex books the flat.",
    "No withdrawals until the goal. If we miss the deadline, everyone is refunded.",
    { model: 1, contribution: "1", goal: "3", beneficiary: ops.address, period: 86400, voting: 86400, maxMembers: 3, rounds: 3, joinWindow: 3600 },
  );
  if (!(await isMember(goal, john.address))) await tx(john, goal, savingsCircleAbi as Abi, "join", ["0x"], "join goal circle");
  s = await summary(goal);
  if (s.status === 0) await tx(ops, goal, savingsCircleAbi as Abi, "start", [], "start goal circle");
  s = await summary(goal);
  if (s.status === 1) {
    await payIfNeeded(goal, ops, 0);
    await payIfNeeded(goal, john, 0);
    if (!(await summary(goal)).goalReached) await tx(john, goal, savingsCircleAbi as Abi, "topUp", [u("1")], "top up 1 MUSD");
    await tx(john, goal, savingsCircleAbi as Abi, "finalize", [], "release goal to beneficiary");
  }

  // ── 4. open circles for visitors
  await createCircle(
    "openRotating",
    "Weekly Neighbourhood Tanda",
    "Open to anyone on testnet: six people, 2 MUSD a week, everyone takes the pot once.",
    "Pay every week before the deadline. Your 1 MUSD deposit covers a missed week.",
    { model: 0, contribution: "2", collateral: "1", period: 604800, maxMembers: 6, joinWindow: 14 * 86400, payoutOrder: 1 },
  );
  await createCircle(
    "openFixed",
    "Study Group Savings",
    "Put aside 1 MUSD a day for two weeks and take it all back at the end.",
    "Money stays in for the full term. Leaving early costs 5%, shared by those who stay.",
    { model: 2, contribution: "1", period: 86400, voting: 86400, maxMembers: 8, rounds: 14, penaltyBps: 500, joinWindow: 14 * 86400 },
  );

  // ── report
  for (const k of ["rotating", "emergency", "goal", "openRotating", "openFixed"]) {
    const x = await summary(state[k] as Address);
    console.log(`${k.padEnd(13)} ${x.circle} status=${x.status} members=${x.memberCount} contributed=${formatUnits(x.totalContributed, 18)} paidOut=${formatUnits(x.totalPaidOut, 18)}`);
  }
  for (const w of [ops, john, sarah]) console.log(`${NAMES.get(w.address)} MUSD=${formatUnits(await bal(w.address), 18)}`);
  const rep = await pub.readContract({ address: FACTORY, abi: circleFactoryAbi, functionName: "reputationOf", args: [sarah.address] });
  console.log("Sarah reputation:", rep);
  void musdFaucetAbi;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
