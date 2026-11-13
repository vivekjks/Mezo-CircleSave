import type { Address, ReadContractReturnType } from "viem";
import {
  circleFactoryAbi,
  circleGovernorAbi,
  circleLensAbi,
  musdFaucetAbi,
  savingsCircleAbi,
} from "./abis";
import { deployment } from "./deployment";

export { circleFactoryAbi, circleGovernorAbi, circleLensAbi, musdFaucetAbi, savingsCircleAbi, deployment };

export const ADDR = {
  musd: deployment.musd as Address,
  factory: deployment.factory as Address,
  governor: deployment.governor as Address,
  lens: deployment.lens as Address,
  faucet: deployment.faucet as Address,
};

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export type Summary = ReadContractReturnType<typeof circleLensAbi, "getSummary">;
export type CircleParams = Summary["params"];
export type MembersResult = ReadContractReturnType<typeof circleLensAbi, "getMembers">;
export type MemberView = MembersResult[0][number];
export type Position = ReadContractReturnType<typeof circleLensAbi, "getPosition">;
export type ProposalView = ReadContractReturnType<typeof circleGovernorAbi, "getProposals">[number];
export type ActivitiesResult = ReadContractReturnType<typeof circleLensAbi, "getActivities">;
export type Activity = ActivitiesResult[0][number];
export type Reputation = ReadContractReturnType<typeof circleFactoryAbi, "reputationOf">;

export const Model = { Rotating: 0, Goal: 1, FixedTerm: 2, Emergency: 3 } as const;
export const Status = { Open: 0, Active: 1, Completed: 2, Cancelled: 3 } as const;
export const PayoutOrder = { JoinOrder: 0, Random: 1, Custom: 2 } as const;
export const ProposalKind = { Withdrawal: 0, Dissolve: 1 } as const;
export const ProposalState = { Pending: 0, Approved: 1, Rejected: 2, Expired: 3, Executed: 4, Cancelled: 5 } as const;
export const ActivityKind = {
  Created: 0,
  Joined: 1,
  Left: 2,
  Removed: 3,
  Started: 4,
  Contributed: 5,
  Missed: 6,
  Payout: 7,
  GoalReached: 8,
  Withdrawn: 9,
  Claimed: 10,
  ExitedEarly: 11,
  ProposalCreated: 12,
  Voted: 13,
  ProposalExecuted: 14,
  Completed: 15,
  Cancelled: 16,
  DebtRepaid: 17,
  TopUp: 18,
} as const;

export const ZERO = "0x0000000000000000000000000000000000000000" as Address;
