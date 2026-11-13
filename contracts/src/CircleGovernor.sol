// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleTypes} from "./libraries/CircleTypes.sol";
import {SavingsCircle} from "./SavingsCircle.sol";
import {CircleFactory} from "./CircleFactory.sol";

/// @title CircleGovernor
/// @notice Shared group-voting module for every CircleSave circle.
///         Emergency pools: members request withdrawals that the rest of the group approves.
///         Goal / FixedTerm / Emergency: any member can propose dissolving the circle early
///         (fee-free pro-rata refund). Thresholds and voting windows come from each circle's
///         immutable parameters.
contract CircleGovernor {
    uint256 private constant BPS = 10_000;
    uint256 public constant MAX_REASON_LENGTH = 280;

    CircleFactory public immutable factory;

    mapping(address => CircleTypes.Proposal[]) internal _proposals;
    mapping(address => mapping(uint256 => mapping(address => uint8))) public voteOf; // 1 = yes, 2 = no

    event ProposalCreated(
        address indexed circle,
        uint256 indexed id,
        address indexed proposer,
        CircleTypes.ProposalKind kind,
        uint256 amount,
        string reason
    );
    event VoteCast(address indexed circle, uint256 indexed id, address indexed voter, bool support);
    event ProposalExecuted(address indexed circle, uint256 indexed id);
    event ProposalCancelled(address indexed circle, uint256 indexed id);

    error NotCircle();
    error ProtocolPaused();
    error WrongStatus();
    error WrongModel();
    error NotMember();
    error NotAuthorized();
    error InvalidAmount();
    error InvalidProposal();
    error ProposalNotPending();
    error ProposalNotApproved();
    error AlreadyVoted();
    error CannotVoteOwnRequest();

    constructor(CircleFactory factory_) {
        factory = factory_;
    }

    // ─────────────────────────────────────────────────────────────── actions

    function propose(SavingsCircle circle, CircleTypes.ProposalKind kind, uint256 amount, string calldata reason)
        external
        returns (uint256 id)
    {
        CircleTypes.CircleParams memory p = _checkActive(circle);
        _checkVoter(circle, msg.sender);
        if (p.model == CircleTypes.Model.Rotating) revert WrongModel();
        if (bytes(reason).length > MAX_REASON_LENGTH) revert InvalidProposal();

        uint256 voters = circle.activeParticipants();
        bool isDissolve = kind == CircleTypes.ProposalKind.Dissolve;
        if (!isDissolve) {
            if (p.model != CircleTypes.Model.Emergency) revert WrongModel();
            if (amount == 0 || amount > circle.poolBalance()) revert InvalidAmount();
            voters -= 1; // requesters do not vote on their own request
        } else {
            amount = 0;
        }

        CircleTypes.Proposal[] storage list = _proposals[address(circle)];
        id = list.length;
        CircleTypes.Proposal storage prop = list.push();
        prop.kind = kind;
        prop.proposer = msg.sender;
        prop.createdAt = uint64(block.timestamp);
        prop.deadline = uint64(block.timestamp + p.votingPeriod);
        prop.eligibleVoters = uint16(voters);
        prop.amount = amount;
        prop.reason = reason;
        if (isDissolve) {
            voteOf[address(circle)][id][msg.sender] = 1;
            prop.yesVotes = 1;
        }

        emit ProposalCreated(address(circle), id, msg.sender, kind, amount, reason);
        circle.logGovernance(CircleTypes.ActivityKind.ProposalCreated, msg.sender, id, amount);
    }

    function vote(SavingsCircle circle, uint256 id, bool support) external {
        _checkActive(circle);
        _checkVoter(circle, msg.sender);
        if (proposalState(circle, id) != CircleTypes.ProposalState.Pending) revert ProposalNotPending();
        CircleTypes.Proposal storage prop = _proposals[address(circle)][id];
        if (prop.kind == CircleTypes.ProposalKind.Withdrawal && msg.sender == prop.proposer) {
            revert CannotVoteOwnRequest();
        }
        mapping(address => uint8) storage votes = voteOf[address(circle)][id];
        if (votes[msg.sender] != 0) revert AlreadyVoted();
        votes[msg.sender] = support ? 1 : 2;
        if (support) prop.yesVotes += 1;
        else prop.noVotes += 1;

        emit VoteCast(address(circle), id, msg.sender, support);
        circle.logGovernance(CircleTypes.ActivityKind.Voted, msg.sender, id, support ? 1 : 0);
    }

    /// @notice Anyone can execute an approved proposal while the circle is active.
    function execute(SavingsCircle circle, uint256 id) external {
        _checkActive(circle);
        if (proposalState(circle, id) != CircleTypes.ProposalState.Approved) revert ProposalNotApproved();
        CircleTypes.Proposal storage prop = _proposals[address(circle)][id];
        prop.executed = true;
        emit ProposalExecuted(address(circle), id);
        if (prop.kind == CircleTypes.ProposalKind.Withdrawal) {
            circle.executeWithdrawal(prop.proposer, prop.amount, id);
        } else {
            circle.dissolve(id);
        }
    }

    function cancel(SavingsCircle circle, uint256 id) external {
        if (proposalState(circle, id) != CircleTypes.ProposalState.Pending) revert ProposalNotPending();
        CircleTypes.Proposal storage prop = _proposals[address(circle)][id];
        if (msg.sender != prop.proposer) revert NotAuthorized();
        prop.cancelled = true;
        emit ProposalCancelled(address(circle), id);
    }

    // ─────────────────────────────────────────────────────────────── views

    function proposalState(SavingsCircle circle, uint256 id) public view returns (CircleTypes.ProposalState) {
        CircleTypes.Proposal[] storage list = _proposals[address(circle)];
        if (id >= list.length) revert InvalidProposal();
        CircleTypes.Proposal storage prop = list[id];
        if (prop.executed) return CircleTypes.ProposalState.Executed;
        if (prop.cancelled) return CircleTypes.ProposalState.Cancelled;
        uint256 needed = uint256(circle.params().approvalBps) * prop.eligibleVoters;
        if (uint256(prop.yesVotes) * BPS >= needed) return CircleTypes.ProposalState.Approved;
        if (circle.status() != CircleTypes.Status.Active) return CircleTypes.ProposalState.Expired;
        if (uint256(prop.eligibleVoters - prop.noVotes) * BPS < needed) return CircleTypes.ProposalState.Rejected;
        if (block.timestamp > prop.deadline) return CircleTypes.ProposalState.Expired;
        return CircleTypes.ProposalState.Pending;
    }

    function proposalCount(address circle) external view returns (uint256) {
        return _proposals[circle].length;
    }

    function getProposal(address circle, uint256 id) external view returns (CircleTypes.Proposal memory) {
        return _proposals[circle][id];
    }

    /// @notice All proposals of a circle, newest first, with live state and `viewer`'s vote.
    function getProposals(SavingsCircle circle, address viewer)
        external
        view
        returns (CircleTypes.ProposalView[] memory out)
    {
        CircleTypes.Proposal[] storage list = _proposals[address(circle)];
        uint256 n = list.length;
        out = new CircleTypes.ProposalView[](n);
        for (uint256 i; i < n; ++i) {
            out[n - 1 - i] = CircleTypes.ProposalView({
                id: i,
                data: list[i],
                state: proposalState(circle, i),
                viewerVote: voteOf[address(circle)][i][viewer]
            });
        }
    }

    // ─────────────────────────────────────────────────────────────── internals

    function _checkActive(SavingsCircle circle) internal view returns (CircleTypes.CircleParams memory) {
        if (!factory.isCircle(address(circle))) revert NotCircle();
        if (factory.paused()) revert ProtocolPaused();
        if (circle.status() != CircleTypes.Status.Active) revert WrongStatus();
        return circle.params();
    }

    function _checkVoter(SavingsCircle circle, address account) internal view {
        CircleTypes.Member memory m = circle.getMember(account);
        if (!m.active || m.exited) revert NotMember();
    }
}
