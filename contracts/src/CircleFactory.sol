// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {CircleTypes} from "./libraries/CircleTypes.sol";
import {ICircleFactory} from "./interfaces/ICircleFactory.sol";
import {SavingsCircle} from "./SavingsCircle.sol";

/// @title CircleFactory
/// @notice Creates and indexes CircleSave savings circles, acts as the single MUSD spender
///         for every circle (one approval covers all groups), keeps on-chain member
///         reputation and holds the protocol-level emergency pause.
contract CircleFactory is Ownable2Step, Pausable, ICircleFactory {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 200; // 2% hard cap

    IERC20 public immutable token;
    address public immutable implementation;

    address public feeRecipient;
    uint16 public feeBps;
    address public governor;

    uint256 public totalValueContributed;
    uint256 public totalValuePaidOut;

    address[] internal _circles;
    mapping(address => bool) public isCircle;
    mapping(address => uint256) public circleCreatedBlock;
    mapping(address => address[]) internal _circlesOf;
    mapping(address => mapping(address => uint256)) internal _circleSlot; // member => circle => index + 1
    mapping(address => address[]) internal _createdBy;
    mapping(address => CircleTypes.Reputation) internal _reputation;
    mapping(address => CircleTypes.CircleMeta) internal _meta;

    event CircleCreated(
        address indexed circle,
        address indexed creator,
        CircleTypes.Model indexed model,
        string name,
        uint256 contributionAmount,
        uint16 maxMembers,
        address parent
    );
    event FeeUpdated(uint16 feeBps, address feeRecipient);
    event GovernorSet(address governor);

    error NotCircle();
    error FeeTooHigh();
    error ZeroAddress();
    error InvalidMeta();
    error GovernorAlreadySet();

    modifier onlyCircle() {
        if (!isCircle[msg.sender]) revert NotCircle();
        _;
    }

    constructor(IERC20 token_, address implementation_, address owner_, address feeRecipient_, uint16 feeBps_)
        Ownable(owner_)
    {
        if (address(token_) == address(0) || implementation_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        token = token_;
        implementation = implementation_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    // ─────────────────────────────────────────────────────────────── creation

    /// @notice Deploy a new savings circle. If `p.creatorJoins` the creator joins as the first
    ///         member (and must have approved the factory for any collateral).
    function createCircle(CircleTypes.CircleParams calldata p, CircleTypes.CircleMeta calldata meta)
        external
        whenNotPaused
        returns (address circle)
    {
        uint256 nameLen = bytes(meta.name).length;
        if (nameLen == 0 || nameLen > 64 || bytes(meta.description).length > 600 || bytes(meta.rules).length > 2000) {
            revert InvalidMeta();
        }
        circle = Clones.clone(implementation);
        _meta[circle] = meta;
        isCircle[circle] = true;
        circleCreatedBlock[circle] = block.number;
        _circles.push(circle);
        _createdBy[msg.sender].push(circle);
        emit CircleCreated(circle, msg.sender, p.model, meta.name, p.contributionAmount, p.maxMembers, p.parent);
        SavingsCircle(circle).initialize(p, msg.sender, feeBps, address(token));
    }

    // ─────────────────────────────────────────────────────────────── circle hooks

    function pullFunds(address from, uint256 amount) external onlyCircle {
        token.safeTransferFrom(from, msg.sender, amount);
    }

    function onMemberJoined(address member) external onlyCircle {
        _circlesOf[member].push(msg.sender);
        _circleSlot[member][msg.sender] = _circlesOf[member].length;
        _reputation[member].circlesJoined += 1;
    }

    function onMemberLeft(address member) external onlyCircle {
        uint256 slot = _circleSlot[member][msg.sender];
        if (slot != 0) {
            address[] storage list = _circlesOf[member];
            uint256 last = list.length - 1;
            if (slot - 1 != last) {
                address moved = list[last];
                list[slot - 1] = moved;
                _circleSlot[member][moved] = slot;
            }
            list.pop();
            delete _circleSlot[member][msg.sender];
        }
        CircleTypes.Reputation storage r = _reputation[member];
        if (r.circlesJoined != 0) r.circlesJoined -= 1;
    }

    function onContribution(address member, uint256 amount, uint8 kind) external onlyCircle {
        CircleTypes.Reputation storage r = _reputation[member];
        if (kind == 0) r.onTimePayments += 1;
        else if (kind == 1) r.latePayments += 1;
        r.totalContributed += uint128(amount);
        totalValueContributed += amount;
    }

    function onMissed(address member) external onlyCircle {
        _reputation[member].missedPayments += 1;
    }

    function onPayout(address member, uint256 amount) external onlyCircle {
        CircleTypes.Reputation storage r = _reputation[member];
        r.payoutsReceived += 1;
        r.totalReceived += uint128(amount);
        totalValuePaidOut += amount;
    }

    function onCircleCompleted(address[] calldata finishers) external onlyCircle {
        for (uint256 i; i < finishers.length; ++i) {
            _reputation[finishers[i]].circlesCompleted += 1;
        }
    }

    // ─────────────────────────────────────────────────────────────── views

    function circleCount() external view returns (uint256) {
        return _circles.length;
    }

    /// @notice Circles newest-first. `offset` counts back from the newest circle.
    function getCircles(uint256 offset, uint256 limit) external view returns (address[] memory out) {
        uint256 total = _circles.length;
        if (offset >= total) return out;
        uint256 end = total - offset;
        uint256 size = end < limit ? end : limit;
        out = new address[](size);
        for (uint256 i; i < size; ++i) {
            out[i] = _circles[end - 1 - i];
        }
    }

    function circlesOf(address member) external view returns (address[] memory) {
        return _circlesOf[member];
    }

    function createdBy(address account) external view returns (address[] memory) {
        return _createdBy[account];
    }

    function metaOf(address circle) external view returns (CircleTypes.CircleMeta memory) {
        return _meta[circle];
    }

    function reputationOf(address account) external view returns (CircleTypes.Reputation memory) {
        return _reputation[account];
    }

    function paused() public view override(Pausable, ICircleFactory) returns (bool) {
        return super.paused();
    }

    // ─────────────────────────────────────────────────────────────── admin

    /// @notice Updates the fee for circles created from now on. Existing circles keep the fee
    ///         they were created with.
    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }

    /// @notice One-time wiring of the shared proposal/voting module.
    function setGovernor(address governor_) external onlyOwner {
        if (governor != address(0)) revert GovernorAlreadySet();
        if (governor_ == address(0)) revert ZeroAddress();
        governor = governor_;
        emit GovernorSet(governor_);
    }

    /// @notice Emergency stop: freezes joins, contributions, payouts and votes in every circle.
    ///         Leaving open circles, cancelling and withdrawing collateral stay available.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
