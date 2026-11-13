// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CircleTypes
/// @notice Shared enums and structs used by the CircleSave protocol.
library CircleTypes {
    /// @notice Savings model a circle follows.
    /// Rotating   – every period one member receives the whole pot (ROSCA).
    /// Goal       – members save towards a shared target, released to a beneficiary or back to members.
    /// FixedTerm  – funds are locked until maturity, then returned pro-rata.
    /// Emergency  – a mutual-aid pool; withdrawals require a member vote.
    enum Model {
        Rotating,
        Goal,
        FixedTerm,
        Emergency
    }

    enum Status {
        Open, // accepting members
        Active, // savings cycle running
        Completed, // cycle closed, funds distributed / claimable
        Cancelled // never started, collateral refundable
    }

    /// @dev `Random` is kept for ABI stability but rejected: Mezo exposes no on-chain
    ///      randomness (BLOCKHASH and PREVRANDAO return zero), so a "random" order could be
    ///      predicted or steered by whoever starts the circle.
    enum PayoutOrder {
        JoinOrder,
        Random,
        Custom
    }

    enum ProposalKind {
        Withdrawal, // Emergency pools: pay `amount` to the proposer
        Dissolve // Goal / FixedTerm / Emergency: close early and refund pro-rata, fee-free
    }

    enum ProposalState {
        Pending,
        Approved,
        Rejected,
        Expired,
        Executed,
        Cancelled
    }

    enum ActivityKind {
        Created,
        Joined,
        Left,
        Removed,
        Started,
        Contributed,
        Missed,
        Payout,
        GoalReached,
        Withdrawn,
        Claimed,
        ExitedEarly,
        ProposalCreated,
        Voted,
        ProposalExecuted,
        Completed,
        Cancelled,
        DebtRepaid,
        TopUp
    }

    /// @notice Parameters supplied when a circle is created. Immutable afterwards.
    /// @notice Human-readable circle metadata, stored on-chain by the factory.
    struct CircleMeta {
        string name;
        string description;
        string rules;
    }

    struct CircleParams {
        Model model;
        PayoutOrder payoutOrder;
        uint256 contributionAmount; // per member, per period
        uint256 collateralAmount; // Rotating only: security deposit that covers missed contributions
        uint256 goalAmount; // Goal only: 0 = contributionAmount * members * rounds
        address beneficiary; // Goal only: 0 = members claim their share back
        uint32 periodDuration; // seconds between contribution deadlines
        uint32 votingPeriod; // seconds a proposal stays open
        uint16 maxMembers;
        uint16 totalRounds; // ignored for Rotating (rounds = members at start)
        uint16 approvalBps; // share of eligible voters needed to approve a proposal
        uint16 earlyExitPenaltyBps; // FixedTerm only: penalty kept by the pool on early exit
        uint64 joinDeadline; // after this, anyone can cancel a circle that never started
        address inviteSigner; // 0 = public circle; otherwise joiners need a signature from this key
        address parent; // previous circle when a group starts a new round
        bool creatorJoins; // creator becomes the first member at creation
    }

    struct Member {
        bool active;
        bool exited;
        bool claimed;
        bool collateralWithdrawn;
        uint16 index;
        uint16 payoutRound; // Rotating: 1-based round in which the member is paid (0 = unassigned)
        uint16 paidCount;
        uint16 lateCount;
        uint16 missedCount;
        uint64 joinedAt;
        uint256 contributed; // total MUSD paid in
        uint256 received; // total MUSD paid out to the member (net of fees)
        uint256 drawn; // Emergency: gross amount drawn from the pool through proposals
        uint256 collateral; // remaining security deposit
        uint256 debt; // Rotating: missed contributions not covered by collateral
        uint256 shortfallSuffered; // Rotating: how much smaller this member's pot was than expected
        uint256 reserveClaimed; // Rotating: amount already claimed from the make-whole reserve
    }

    struct MemberView {
        address account;
        Member data;
        bool paidCurrentRound;
    }

    struct Proposal {
        ProposalKind kind;
        address proposer;
        uint64 createdAt;
        uint64 deadline;
        uint16 eligibleVoters;
        uint16 yesVotes;
        uint16 noVotes;
        bool executed;
        bool cancelled;
        uint256 amount;
        string reason;
    }

    struct ProposalView {
        uint256 id;
        Proposal data;
        ProposalState state;
        uint8 viewerVote; // 0 = none, 1 = yes, 2 = no
    }

    struct Activity {
        ActivityKind kind;
        address actor;
        uint16 round;
        uint64 timestamp;
        uint64 blockNumber;
        uint256 amount;
    }

    struct Summary {
        address circle;
        address creator;
        address token;
        CircleMeta meta;
        CircleParams params;
        Status status;
        uint16 feeBps;
        uint64 createdAt;
        uint64 startTime;
        uint64 endedAt;
        uint16 totalRounds;
        uint16 roundsSettled;
        uint16 currentRound;
        uint16 memberCount;
        uint256 goalAmount;
        bool goalReached;
        bool finalized;
        bool refundMode;
        uint256 totalContributed;
        uint256 totalPaidOut;
        uint256 poolBalance;
        uint256 collateralHeld;
        uint256 makeWholeReserve;
        uint256 distributable;
        uint256 proposalCount;
        uint256 activityCount;
        bool paused;
    }

    struct Reputation {
        uint32 circlesJoined;
        uint32 circlesCompleted;
        uint32 onTimePayments;
        uint32 latePayments;
        uint32 missedPayments;
        uint32 payoutsReceived;
        uint128 totalContributed;
        uint128 totalReceived;
    }
}
