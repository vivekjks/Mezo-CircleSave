import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const MESSAGES: Record<string, string> = {
  InvalidParams: "Some circle settings aren't allowed. Check the amounts (at least 0.01 MUSD), schedule and member limits. Emergency pools must be invite only, and open rotating circles need a deposit of at least one contribution.",
  InvalidMeta: "The name must be 1–64 characters, the description under 600 and the rules under 2,000.",
  WrongStatus: "The circle isn't in the right stage for that action. Refresh to see its latest state.",
  WrongModel: "That action isn't available for this savings model.",
  NotMember: "Only members of this circle can do that.",
  NotAuthorized: "Only the circle's creator can do that right now.",
  JoinClosed: "The joining window has closed. The circle can no longer start, so anyone can cancel it and deposits are returned.",
  AlreadyMember: "You're already a member of this circle.",
  CircleFull: "This circle is full.",
  InvalidInvite: "This invite link doesn't match the circle. Ask the creator for a fresh link.",
  NotEnoughMembers: "A circle needs at least 2 members to start.",
  PayoutOrderNotSet: "Set the payout order for every member before starting.",
  InvalidOrder: "The payout order must list each member exactly once.",
  InvalidRound: "That round isn't open for payment.",
  AlreadyPaid: "You've already paid this round.",
  RoundNotDue: "This round can be paid out once everyone has paid or its deadline passes.",
  GoalAlreadyReached: "The goal is already reached, so contributions are closed.",
  NotMatured: "The savings term hasn't ended yet.",
  AlreadyMatured: "The term has ended, so payments and proposals are closed. Close the circle to collect.",
  MemberExited: "You've already left this circle early.",
  NothingToClaim: "There's nothing for you to collect here.",
  InvalidAmount: "Enter an amount above zero. A single request can take at most half of the pool.",
  InsufficientPool: "The pool doesn't hold enough MUSD for this request.",
  ProtocolPaused: "CircleSave is paused for maintenance. Withdrawals of collateral still work.",
  NoDebt: "You have no outstanding contributions to repay.",
  InvalidProposal: "That proposal doesn't exist or its reason is too long (280 characters max).",
  ProposalNotPending: "Voting on this proposal has closed.",
  ProposalNotApproved: "This proposal hasn't reached its approval threshold.",
  AlreadyVoted: "You've already voted on this proposal.",
  CannotVoteOwnRequest: "You can't vote on your own withdrawal request.",
  NotCircle: "That address isn't a CircleSave circle.",
  CoolingDown: "You've claimed from the faucet recently. Try again later.",
  FaucetEmpty: "The test MUSD faucet is empty right now.",
  Banned: "The creator removed you from this circle, so you can't rejoin it.",
  NotUpToDate: "Pay your overdue rounds first. Only members who are up to date can propose or vote.",
  TooManyProposals: "This circle has reached its proposal limit.",
  InvalidParent: "The previous circle link isn't a CircleSave circle.",
  RenounceDisabled: "The protocol owner can't be removed.",
  ERC20InsufficientBalance: "Your balance is too low for this payment.",
  ERC20InsufficientAllowance: "Allow CircleSave to use your MUSD first.",
};

export function humanizeError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You cancelled the request in your wallet.";
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (revert.reason) return revert.reason;
    }
    const msg = error.shortMessage || error.message;
    if (/insufficient funds/i.test(msg)) return "Your wallet needs a little testnet BTC to pay for gas.";
    if (/user rejected|denied/i.test(msg)) return "You cancelled the request in your wallet.";
    return msg;
  }
  if (error instanceof Error) {
    if (/user rejected|denied/i.test(error.message)) return "You cancelled the request in your wallet.";
    return error.message;
  }
  return "Something went wrong. Try again.";
}
