// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {CircleTypes} from "./libraries/CircleTypes.sol";
import {ICircleFactory} from "./interfaces/ICircleFactory.sol";

/// @title SavingsCircle
/// @notice A single CircleSave group. Deployed as an EIP-1167 clone by {CircleFactory}.
/// @dev All accounting lives on-chain: membership, per-round payment bitmaps, payouts,
///      collateral, votes and a full activity log. Funds only leave the contract through
///      the rule-checked paths below. Aggregated read views live in {CircleLens}.
contract SavingsCircle is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────── constants

    uint256 private constant BPS = 10_000;
    uint16 public constant MAX_MEMBERS = 50;
    uint16 public constant MAX_ROUNDS = 120;
    uint32 public constant MIN_PERIOD = 5 minutes;
    uint32 internal constant MAX_PERIOD = 365 days;
    uint32 internal constant MIN_VOTING_PERIOD = 5 minutes;
    uint32 internal constant MAX_VOTING_PERIOD = 30 days;
    uint16 public constant MAX_EXIT_PENALTY_BPS = 5_000;
    uint256 public constant MIN_CONTRIBUTION = 1e16; // 0.01 MUSD
    uint256 public constant MAX_AMOUNT = 1e30; // keeps every product of amounts far from overflow
    uint256 internal constant MAX_RESUME_GRACE = 2 days;

    // ─────────────────────────────────────────────────────────────── storage

    ICircleFactory public factory;
    IERC20 public token;
    address public creator;
    uint16 public feeBps;

    CircleTypes.CircleParams internal _params;
    CircleTypes.Status public status;

    uint64 public createdAt;
    uint64 public startTime;
    uint64 public endedAt;
    uint16 public totalRounds;
    uint16 public roundsSettled;

    uint256 public goalAmount;
    bool public goalReached;
    bool public finalized;
    bool public refundMode;
    bool internal equalSplit;

    uint256 public totalContributed;
    uint256 public totalPaidOut;
    uint256 public collateralHeld;
    uint256 public makeWholeReserve; // cumulative MUSD withheld from defaulters / repaid debt
    uint256 internal reserveClaimed;
    uint256 internal totalShortfall;
    uint256 public distributable;
    uint256 internal distributionWeight;

    address[] internal _members;
    mapping(address => CircleTypes.Member) internal _member;
    mapping(address => uint256) internal _paidBits; // bit r set = paid round r
    mapping(address => uint256) internal _lateBits; // bit r set = paid round r after its deadline
    mapping(address => uint256) internal _missedBits; // bit r set = round r settled without payment
    address[] internal _payoutOrder;

    mapping(uint256 => uint256) internal roundCollected;
    mapping(uint256 => uint16) internal roundPaidCount;

    CircleTypes.Activity[] internal _activities;

    /// @notice Addresses the creator removed; they cannot join this circle again.
    mapping(address => bool) public banned;

    // ─────────────────────────────────────────────────────────────── events

    /// @notice Single event for every state change; `round` doubles as proposal id for
    ///         proposal activity. The same data is stored on-chain in the activity log.
    event ActivityLogged(
        uint256 indexed index,
        CircleTypes.ActivityKind indexed kind,
        address indexed actor,
        uint16 round,
        uint256 amount
    );

    // ─────────────────────────────────────────────────────────────── errors

    error InvalidParams();
    error WrongStatus();
    error WrongModel();
    error NotMember();
    error NotAuthorized();
    error AlreadyMember();
    error CircleFull();
    error JoinClosed();
    error InvalidInvite();
    error NotEnoughMembers();
    error PayoutOrderNotSet();
    error InvalidOrder();
    error InvalidRound();
    error AlreadyPaid();
    error RoundNotDue();
    error GoalAlreadyReached();
    error NotMatured();
    error AlreadyMatured();
    error MemberExited();
    error NothingToClaim();
    error InvalidAmount();
    error InsufficientPool();
    error ProtocolPaused();
    error NoDebt();
    error Banned();

    constructor() {
        _disableInitializers();
    }

    // ─────────────────────────────────────────────────────────────── guards

    function _notPaused() internal view {
        if (factory.paused()) revert ProtocolPaused();
    }

    function _onlyStatus(CircleTypes.Status s) internal view {
        if (status != s) revert WrongStatus();
    }

    function _activeMember() internal view returns (CircleTypes.Member storage m) {
        m = _member[msg.sender];
        if (!m.active) revert NotMember();
        if (m.exited) revert MemberExited();
    }

    function _isRotating() internal view returns (bool) {
        return _params.model == CircleTypes.Model.Rotating;
    }

    // ─────────────────────────────────────────────────────────────── setup

    /// @notice Called once by the factory right after cloning.
    function initialize(CircleTypes.CircleParams calldata p, address creator_, uint16 feeBps_, address token_)
        external
        initializer
    {
        _validate(p, token_);
        factory = ICircleFactory(msg.sender);
        token = IERC20(token_);
        creator = creator_;
        feeBps = feeBps_;
        _params = p;
        createdAt = uint64(block.timestamp);
        _log(CircleTypes.ActivityKind.Created, creator_, 0, 0);
        if (p.creatorJoins) _addMember(creator_);
    }

    function _validate(CircleTypes.CircleParams calldata p, address token_) internal view {
        address ben = p.beneficiary;
        bool bad = p.contributionAmount < MIN_CONTRIBUTION || p.contributionAmount > MAX_AMOUNT
            || p.collateralAmount > MAX_AMOUNT || p.goalAmount > MAX_AMOUNT
            || p.payoutOrder == CircleTypes.PayoutOrder.Random
            || (ben != address(0)
                && (ben == address(this) || ben == msg.sender || ben == token_ || ben == ICircleFactory(msg.sender).governor()))
            || p.maxMembers < 2 || p.maxMembers > MAX_MEMBERS
            || p.periodDuration < MIN_PERIOD || p.periodDuration > MAX_PERIOD || p.joinDeadline <= block.timestamp
            || p.approvalBps <= 5_000 || p.approvalBps > BPS;

        if (p.model == CircleTypes.Model.Rotating) {
            // public rotating circles must hold at least one round of deposit per member
            bad = bad || p.goalAmount != 0 || ben != address(0) || p.earlyExitPenaltyBps != 0
                || (p.inviteSigner == address(0) && p.collateralAmount < p.contributionAmount);
        } else {
            bad = bad || p.totalRounds == 0 || p.totalRounds > MAX_ROUNDS || p.collateralAmount != 0
                || p.votingPeriod < MIN_VOTING_PERIOD || p.votingPeriod > MAX_VOTING_PERIOD
                || (p.model != CircleTypes.Model.Goal && (p.goalAmount != 0 || p.beneficiary != address(0)))
                || (p.model == CircleTypes.Model.FixedTerm
                    ? p.earlyExitPenaltyBps > MAX_EXIT_PENALTY_BPS
                    : p.earlyExitPenaltyBps != 0)
                // emergency pools vote on withdrawals, so they must be invite-only (no sybils)
                || (p.model == CircleTypes.Model.Emergency && p.inviteSigner == address(0));
        }
        if (bad) revert InvalidParams();
    }

    // ─────────────────────────────────────────────────────────────── membership

    /// @notice Join an open circle. Private circles need a signature from the invite key
    ///         over {inviteDigest}(msg.sender); the key lives in the creator's invite link.
    function join(bytes calldata inviteSignature) public nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Open);
        if (banned[msg.sender]) revert Banned();
        if (block.timestamp > _params.joinDeadline) revert JoinClosed();
        if (_member[msg.sender].active) revert AlreadyMember();
        if (_members.length >= _params.maxMembers) revert CircleFull();
        address signer = _params.inviteSigner;
        if (signer != address(0) && msg.sender != creator) {
            bytes32 digest = MessageHashUtils.toEthSignedMessageHash(inviteDigest(msg.sender));
            (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, inviteSignature);
            if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidInvite();
        }
        _addMember(msg.sender);
    }

    /// @notice Leave before the cycle starts. Collateral is refunded immediately.
    function leave() external nonReentrant {
        _onlyStatus(CircleTypes.Status.Open);
        _activeMember();
        _removeMember(msg.sender, false);
    }

    /// @notice Creator can remove a member before the cycle starts (collateral refunded).
    function removeMember(address account) external nonReentrant {
        _onlyStatus(CircleTypes.Status.Open);
        if (msg.sender != creator || account == creator) revert NotAuthorized();
        if (!_member[account].active) revert NotMember();
        banned[account] = true;
        _removeMember(account, true);
    }

    /// @notice Rotating circles with a custom order: creator fixes who is paid in which round.
    function setPayoutOrder(address[] calldata order) external {
        _onlyStatus(CircleTypes.Status.Open);
        if (msg.sender != creator) revert NotAuthorized();
        if (!_isRotating() || _params.payoutOrder != CircleTypes.PayoutOrder.Custom) revert WrongModel();
        uint256 n = _members.length;
        if (order.length != n) revert InvalidOrder();
        _clearPayoutOrder();
        for (uint256 i; i < n; ++i) {
            CircleTypes.Member storage m = _member[order[i]];
            if (!m.active || m.payoutRound != 0) revert InvalidOrder();
            m.payoutRound = uint16(i + 1);
            _payoutOrder.push(order[i]);
        }
    }

    /// @notice Start the savings cycle. The creator can start with 2+ members; once the
    ///         circle is full any member can start it.
    function start() external nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Open);
        if (block.timestamp > _params.joinDeadline) revert JoinClosed();
        uint256 count = _members.length;
        if (count < 2) revert NotEnoughMembers();
        if (msg.sender != creator && (!_member[msg.sender].active || count < _params.maxMembers)) {
            revert NotAuthorized();
        }

        status = CircleTypes.Status.Active;
        startTime = uint64(block.timestamp);

        if (_isRotating()) {
            totalRounds = uint16(count);
            _assignPayoutOrder(count);
        } else {
            totalRounds = _params.totalRounds;
            if (_params.model == CircleTypes.Model.Goal) {
                goalAmount = _params.goalAmount != 0
                    ? _params.goalAmount
                    : _params.contributionAmount * count * _params.totalRounds;
            }
        }
        _log(CircleTypes.ActivityKind.Started, msg.sender, totalRounds, count);
    }

    /// @notice Cancel a circle that never started. The creator can cancel any time while
    ///         open; anyone can cancel once the join deadline has passed.
    function cancel() external nonReentrant {
        _onlyStatus(CircleTypes.Status.Open);
        if (msg.sender != creator && block.timestamp <= _params.joinDeadline) revert NotAuthorized();
        status = CircleTypes.Status.Cancelled;
        endedAt = uint64(block.timestamp);
        _log(CircleTypes.ActivityKind.Cancelled, msg.sender, 0, 0);
    }

    // ─────────────────────────────────────────────────────────────── contributions

    /// @notice Pay the scheduled contribution for `round` (current or an earlier unpaid one).
    /// @dev Funds are pulled through the factory, so members approve MUSD once for all circles.
    function contribute(uint16 round) public nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        CircleTypes.Member storage m = _activeMember();
        if (round >= totalRounds || round > _elapsedRounds()) revert InvalidRound();
        if (_isRotating()) {
            if (round < roundsSettled) revert InvalidRound();
        } else {
            if (goalReached) revert GoalAlreadyReached();
            if (block.timestamp >= maturity()) revert AlreadyMatured();
        }
        uint256 bit = uint256(1) << round;
        if (_paidBits[msg.sender] & bit != 0) revert AlreadyPaid();

        uint256 amount = _params.contributionAmount;
        bool late = block.timestamp > roundDeadline(round);

        _paidBits[msg.sender] |= bit;
        if (late) {
            _lateBits[msg.sender] |= bit;
            m.lateCount += 1;
        }
        m.paidCount += 1;
        m.contributed += amount;
        roundCollected[round] += amount;
        roundPaidCount[round] += 1;
        totalContributed += amount;

        _log(CircleTypes.ActivityKind.Contributed, msg.sender, round, amount);
        factory.pullFunds(msg.sender, amount);
        factory.onContribution(msg.sender, amount, late ? 1 : 0);
        _checkGoal();
    }

    /// @notice Voluntary extra savings for Goal, FixedTerm and Emergency pools.
    function topUp(uint256 amount) external nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        CircleTypes.Member storage m = _activeMember();
        // fixed-term shares are by scheduled payments only, so late top-ups cannot snipe penalties
        if (_isRotating() || _params.model == CircleTypes.Model.FixedTerm) revert WrongModel();
        if (amount == 0 || amount > MAX_AMOUNT) revert InvalidAmount();
        if (goalReached) revert GoalAlreadyReached();
        if (block.timestamp >= maturity()) revert AlreadyMatured();

        m.contributed += amount;
        totalContributed += amount;
        _log(CircleTypes.ActivityKind.TopUp, msg.sender, 0, amount);
        factory.pullFunds(msg.sender, amount);
        factory.onContribution(msg.sender, amount, 2);
        _checkGoal();
    }

    function _checkGoal() internal {
        if (_params.model == CircleTypes.Model.Goal && !goalReached && totalContributed >= goalAmount) {
            goalReached = true;
            _log(CircleTypes.ActivityKind.GoalReached, address(0), 0, totalContributed);
        }
    }

    // ─────────────────────────────────────────────────────────────── rotating payouts

    /// @notice Settle the next rotating round: pays the scheduled recipient once every member
    ///         has paid, or after the round deadline using defaulters' collateral.
    function settleRound() external nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        if (!_isRotating()) revert WrongModel();
        uint16 r = roundsSettled;
        uint256 count = _members.length;
        if (_payoutOrder.length != count) revert PayoutOrderNotSet();
        if (roundPaidCount[r] < count && block.timestamp <= settleNotBefore(r)) revert RoundNotDue();

        uint256 amount = _params.contributionAmount;
        uint256 pot = roundCollected[r];
        address recipient = _payoutOrder[r];
        uint256 recipientOwnShort;
        uint256 bit = uint256(1) << r;

        for (uint256 i; i < count; ++i) {
            address a = _members[i];
            if (_paidBits[a] & bit != 0) continue;
            CircleTypes.Member storage m = _member[a];
            uint256 cover = m.collateral < amount ? m.collateral : amount;
            uint256 shortBy = amount - cover;
            if (cover != 0) {
                m.collateral -= cover;
                collateralHeld -= cover;
                pot += cover;
            }
            if (shortBy != 0) {
                // a recipient skipping their own round only shrinks their own payout
                if (a == recipient) recipientOwnShort = shortBy;
                else m.debt += shortBy;
            }
            m.missedCount += 1;
            _missedBits[a] |= bit;
            _log(CircleTypes.ActivityKind.Missed, a, r, cover);
            factory.onMissed(a);
        }

        CircleTypes.Member storage rm = _member[recipient];
        uint256 expected = amount * count;
        if (pot + recipientOwnShort < expected) {
            uint256 s = expected - pot - recipientOwnShort;
            rm.shortfallSuffered += s;
            totalShortfall += s;
        }

        uint256 fee = (pot * feeBps) / BPS;
        uint256 net = pot - fee;
        if (rm.debt != 0) {
            uint256 withheld = rm.debt < net ? rm.debt : net;
            rm.debt -= withheld;
            net -= withheld;
            makeWholeReserve += withheld;
        }

        roundsSettled = r + 1;
        _payTo(recipient, net, fee, r, CircleTypes.ActivityKind.Payout);
        if (roundsSettled == totalRounds) _complete();
    }

    /// @notice Pay back missed contributions that collateral did not cover. The money goes to
    ///         the make-whole reserve and is claimable by members whose payouts were short.
    function repayDebt() external nonReentrant {
        _notPaused();
        CircleTypes.Member storage m = _member[msg.sender];
        uint256 debt = m.debt;
        if (debt == 0) revert NoDebt();
        m.debt = 0;
        m.contributed += debt;
        makeWholeReserve += debt;
        totalContributed += debt;
        _log(CircleTypes.ActivityKind.DebtRepaid, msg.sender, 0, debt);
        factory.pullFunds(msg.sender, debt);
        factory.onContribution(msg.sender, debt, 1);
    }

    /// @notice After the circle ends (or is cancelled) members withdraw their remaining
    ///         collateral and any make-whole reserve share.
    function withdraw() external nonReentrant {
        if (status != CircleTypes.Status.Completed && status != CircleTypes.Status.Cancelled) revert WrongStatus();
        CircleTypes.Member storage m = _member[msg.sender];
        if (!m.active) revert NotMember();
        uint256 col = m.collateral;
        if (col != 0) {
            m.collateral = 0;
            m.collateralWithdrawn = true;
            collateralHeld -= col;
        }
        uint256 share = reserveClaimable(msg.sender);
        if (share != 0) {
            m.reserveClaimed += share;
            m.received += share;
            reserveClaimed += share;
            totalPaidOut += share;
        }
        uint256 total = col + share;
        if (total == 0) revert NothingToClaim();
        _log(CircleTypes.ActivityKind.Withdrawn, msg.sender, 0, total);
        token.safeTransfer(msg.sender, total);
    }

    // ─────────────────────────────────────────────────────────────── pooled models

    /// @notice Close a Goal / FixedTerm / Emergency circle once its rules allow it.
    ///         Goal reached + beneficiary  → pot released to the beneficiary.
    ///         Goal reached, no beneficiary → members claim pro-rata.
    ///         Goal missed at maturity       → fee-free pro-rata refund.
    ///         FixedTerm at maturity         → members claim pro-rata (penalties included).
    ///         Emergency at maturity         → fee-free pro-rata refund of what is left.
    function finalize() external nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        CircleTypes.Model model = _params.model;
        if (model == CircleTypes.Model.Rotating) revert WrongModel();
        if (model == CircleTypes.Model.Goal && goalReached) {
            address beneficiary = _params.beneficiary;
            if (beneficiary != address(0)) {
                uint256 pot = poolBalance();
                uint256 fee = (pot * feeBps) / BPS;
                finalized = true;
                _payTo(beneficiary, pot - fee, fee, 0, CircleTypes.ActivityKind.Payout);
                _complete();
            } else {
                _startDistribution(false);
            }
            return;
        }
        if (block.timestamp < maturity()) revert NotMatured();
        _startDistribution(model != CircleTypes.Model.FixedTerm);
    }

    /// @notice Claim your share after finalization.
    /// @dev Deliberately not blocked by the protocol pause: shares are fixed at finalization.
    function claim() external nonReentrant {
        if (!finalized) revert WrongStatus();
        (uint256 gross, uint256 fee) = claimable(msg.sender);
        if (gross == 0) revert NothingToClaim();
        _member[msg.sender].claimed = true;
        _payTo(msg.sender, gross - fee, fee, 0, CircleTypes.ActivityKind.Claimed);
    }

    /// @notice FixedTerm only: leave before maturity. The penalty stays in the pool and is
    ///         shared by the members who stay to the end.
    function exitEarly() external nonReentrant {
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        CircleTypes.Member storage m = _activeMember();
        if (_params.model != CircleTypes.Model.FixedTerm) revert WrongModel();
        if (block.timestamp >= maturity()) revert AlreadyMatured();
        uint256 gross = m.contributed;
        uint256 refund = gross - (gross * _params.earlyExitPenaltyBps) / BPS;
        m.exited = true;
        m.received += refund;
        totalPaidOut += refund;
        _log(CircleTypes.ActivityKind.ExitedEarly, msg.sender, 0, refund);
        if (refund != 0) token.safeTransfer(msg.sender, refund);
    }

    function _startDistribution(bool refund) internal {
        finalized = true;
        refundMode = refund;
        uint256 pot = poolBalance();
        distributable = pot;
        uint256 weight;
        uint256 participants;
        uint256 n = _members.length;
        for (uint256 i; i < n; ++i) {
            CircleTypes.Member storage m = _member[_members[i]];
            if (m.exited) continue;
            weight += _weight(m);
            if (m.contributed != 0) participants += 1;
        }
        if (weight == 0 && participants != 0) {
            equalSplit = true;
            weight = participants;
        }
        distributionWeight = weight;
        if (participants == 0 && pot != 0) {
            distributable = 0;
            token.safeTransfer(factory.feeRecipient(), pot);
        }
        _complete();
    }

    function _weight(CircleTypes.Member storage m) internal view returns (uint256) {
        if (_params.model == CircleTypes.Model.Emergency) {
            return m.contributed > m.drawn ? m.contributed - m.drawn : 0;
        }
        return m.contributed;
    }

    // ─────────────────────────────────────────────────────────────── governance hooks

    /// @dev Proposals and votes live in the shared {CircleGovernor}; it calls back here to
    ///      execute approved outcomes and to keep this circle's activity log complete.
    function _onlyGovernor() internal view {
        if (msg.sender != factory.governor()) revert NotAuthorized();
    }

    /// @notice Pays an approved Emergency withdrawal request.
    function executeWithdrawal(address to, uint256 amount, uint256 proposalId) external nonReentrant {
        _onlyGovernor();
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        if (_params.model != CircleTypes.Model.Emergency) revert WrongModel();
        if (amount == 0 || amount > poolBalance()) revert InsufficientPool();
        uint256 fee = (amount * feeBps) / BPS;
        _member[to].drawn += amount;
        _payTo(to, amount - fee, fee, proposalId, CircleTypes.ActivityKind.ProposalExecuted);
    }

    /// @notice Closes the circle after an approved Dissolve vote: fee-free pro-rata refund.
    function dissolve(uint256 proposalId) external nonReentrant {
        _onlyGovernor();
        _notPaused();
        _onlyStatus(CircleTypes.Status.Active);
        if (_isRotating()) revert WrongModel();
        _log(CircleTypes.ActivityKind.ProposalExecuted, address(0), proposalId, 0);
        _startDistribution(true);
    }

    /// @notice Lets the governor record proposal and vote activity in this circle's log.
    function logGovernance(CircleTypes.ActivityKind kind, address actor, uint256 proposalId, uint256 amount)
        external
    {
        _onlyGovernor();
        _log(kind, actor, proposalId, amount);
    }

    // ─────────────────────────────────────────────────────────────── MUSD permit

    /// @notice Join in one transaction: an EIP-2612 permit for the factory (the single MUSD
    ///         spender) is applied first, so no separate approval is needed for the deposit.
    function joinWithPermit(
        bytes calldata inviteSignature,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _permit(value, deadline, v, r, s);
        join(inviteSignature);
    }

    /// @notice Pay a round in one transaction using an EIP-2612 permit (see {joinWithPermit}).
    function contributeWithPermit(uint16 round, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        _permit(value, deadline, v, r, s);
        contribute(round);
    }

    /// @dev Tolerates a front-run permit: if it was already used, the allowance is in place.
    function _permit(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        try IERC20Permit(address(token)).permit(msg.sender, address(factory), value, deadline, v, r, s) {} catch {}
    }

    // ─────────────────────────────────────────────────────────────── internals

    /// @dev Sends `net` to `to` (and `fee` to the treasury), recording it everywhere.
    function _payTo(address to, uint256 net, uint256 fee, uint256 round, CircleTypes.ActivityKind kind) internal {
        CircleTypes.Member storage m = _member[to];
        if (m.active) m.received += net;
        totalPaidOut += net;
        _log(kind, to, round, net);
        if (fee != 0) token.safeTransfer(factory.feeRecipient(), fee);
        if (net != 0) token.safeTransfer(to, net);
        factory.onPayout(to, net);
    }

    function _addMember(address account) internal {
        CircleTypes.Member storage m = _member[account];
        uint256 collateral = _params.collateralAmount;
        m.active = true;
        m.index = uint16(_members.length);
        m.joinedAt = uint64(block.timestamp);
        m.collateral = collateral;
        _members.push(account);
        collateralHeld += collateral;
        _clearPayoutOrder();
        _log(CircleTypes.ActivityKind.Joined, account, 0, collateral);
        factory.onMemberJoined(account);
        if (collateral != 0) factory.pullFunds(account, collateral);
    }

    function _removeMember(address account, bool removed) internal {
        CircleTypes.Member storage m = _member[account];
        uint256 refund = m.collateral;
        uint256 n = _members.length;
        // ordered removal keeps join order meaningful for JoinOrder payouts
        for (uint256 i = m.index; i + 1 < n; ++i) {
            address moved = _members[i + 1];
            _members[i] = moved;
            _member[moved].index = uint16(i);
        }
        _members.pop();
        delete _member[account];
        collateralHeld -= refund;
        _clearPayoutOrder();
        _log(removed ? CircleTypes.ActivityKind.Removed : CircleTypes.ActivityKind.Left, account, 0, refund);
        factory.onMemberLeft(account);
        if (refund != 0) token.safeTransfer(account, refund);
    }

    function _clearPayoutOrder() internal {
        uint256 n = _payoutOrder.length;
        if (n == 0) return;
        for (uint256 i; i < n; ++i) {
            _member[_payoutOrder[i]].payoutRound = 0;
        }
        delete _payoutOrder;
    }

    function _assignPayoutOrder(uint256 count) internal {
        CircleTypes.PayoutOrder mode = _params.payoutOrder;
        if (mode == CircleTypes.PayoutOrder.Custom) {
            if (_payoutOrder.length != count) revert PayoutOrderNotSet();
            return;
        }
        address[] memory order = _members;
        for (uint256 i; i < count; ++i) {
            _payoutOrder.push(order[i]);
            _member[order[i]].payoutRound = uint16(i + 1);
        }
    }

    function _complete() internal {
        status = CircleTypes.Status.Completed;
        endedAt = uint64(block.timestamp);
        _log(CircleTypes.ActivityKind.Completed, address(0), totalRounds, totalPaidOut);
        uint256 n = _members.length;
        address[] memory finishers = new address[](n);
        uint256 k;
        for (uint256 i; i < n; ++i) {
            if (!_member[_members[i]].exited) finishers[k++] = _members[i];
        }
        assembly ("memory-safe") {
            mstore(finishers, k)
        }
        factory.onCircleCompleted(finishers);
    }

    function activeParticipants() public view returns (uint256 count) {
        uint256 n = _members.length;
        for (uint256 i; i < n; ++i) {
            if (!_member[_members[i]].exited) count += 1;
        }
    }

    function _elapsedRounds() internal view returns (uint256) {
        if (startTime == 0) return 0;
        return (block.timestamp - startTime) / _params.periodDuration;
    }

    function _log(CircleTypes.ActivityKind kind, address actor, uint256 round, uint256 amount) internal {
        uint256 idx = _activities.length;
        _activities.push(
            CircleTypes.Activity({
                kind: kind,
                actor: actor,
                round: uint16(round),
                timestamp: uint64(block.timestamp),
                blockNumber: uint64(block.number),
                amount: amount
            })
        );
        emit ActivityLogged(idx, kind, actor, uint16(round), amount);
    }

    // ─────────────────────────────────────────────────────────────── views

    /// @notice Message the invite key signs for `account` (EIP-191 personal_sign).
    function inviteDigest(address account) public view returns (bytes32) {
        return keccak256(abi.encodePacked("CircleSave invite", block.chainid, address(this), account));
    }

    function params() external view returns (CircleTypes.CircleParams memory) {
        return _params;
    }

    /// @notice Index of the current contribution round (== totalRounds once all periods elapsed).
    function currentRound() public view returns (uint16) {
        uint256 r = _elapsedRounds();
        return r >= totalRounds ? totalRounds : uint16(r);
    }

    function roundDeadline(uint256 round) public view returns (uint256) {
        if (startTime == 0) return 0;
        return uint256(startTime) + (round + 1) * _params.periodDuration;
    }

    /// @notice Earliest time an unpaid round can be settled. After a protocol pause, members
    ///         get a grace period (one period, at most two days) to catch up first.
    function settleNotBefore(uint256 round) public view returns (uint256 t) {
        t = roundDeadline(round);
        uint256 grace = _params.periodDuration < MAX_RESUME_GRACE ? _params.periodDuration : MAX_RESUME_GRACE;
        uint256 resumed = uint256(factory.unpausedAt()) + grace;
        if (resumed > t) t = resumed;
    }

    /// @notice True for an active member who has paid something and every round whose
    ///         deadline has passed. Only such members can propose and vote.
    function isUpToDate(address account) external view returns (bool) {
        CircleTypes.Member storage m = _member[account];
        if (!m.active || m.exited || m.contributed == 0) return false;
        uint256 due = _elapsedRounds();
        if (due > totalRounds) due = totalRounds;
        uint256 mask = (uint256(1) << due) - 1;
        return _paidBits[account] & mask == mask;
    }

    function maturity() public view returns (uint256) {
        if (startTime == 0) return 0;
        return uint256(startTime) + uint256(totalRounds) * _params.periodDuration;
    }

    /// @notice MUSD available to the group (excludes collateral and the make-whole reserve).
    function poolBalance() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        uint256 locked = collateralHeld + (makeWholeReserve - reserveClaimed);
        return bal > locked ? bal - locked : 0;
    }

    function claimable(address account) public view returns (uint256 gross, uint256 fee) {
        if (!finalized || distributionWeight == 0) return (0, 0);
        CircleTypes.Member storage m = _member[account];
        if (!m.active || m.exited || m.claimed) return (0, 0);
        uint256 w = equalSplit ? (m.contributed != 0 ? 1 : 0) : _weight(m);
        gross = (distributable * w) / distributionWeight;
        fee = refundMode ? 0 : (gross * feeBps) / BPS;
    }

    function reserveClaimable(address account) public view returns (uint256) {
        if (status != CircleTypes.Status.Completed || totalShortfall == 0) return 0;
        CircleTypes.Member storage m = _member[account];
        if (m.debt != 0) return 0; // repay what you owe before taking from the reserve
        uint256 entitled = (makeWholeReserve * m.shortfallSuffered) / totalShortfall;
        if (entitled > m.shortfallSuffered) entitled = m.shortfallSuffered;
        return entitled > m.reserveClaimed ? entitled - m.reserveClaimed : 0;
    }

    function isMember(address account) external view returns (bool) {
        return _member[account].active;
    }

    function memberCount() external view returns (uint256) {
        return _members.length;
    }

    function getMemberAddresses() external view returns (address[] memory) {
        return _members;
    }

    function getPayoutOrder() external view returns (address[] memory) {
        return _payoutOrder;
    }

    function getMember(address account) external view returns (CircleTypes.Member memory) {
        return _member[account];
    }

    /// @notice Per-member payment bitmaps: bit r of paid / late / missed describes round r.
    function getPaymentBits(address account) external view returns (uint256 paid, uint256 late, uint256 missed) {
        return (_paidBits[account], _lateBits[account], _missedBits[account]);
    }

    function activityCount() external view returns (uint256) {
        return _activities.length;
    }

    function getActivity(uint256 index) external view returns (CircleTypes.Activity memory) {
        return _activities[index];
    }
}
