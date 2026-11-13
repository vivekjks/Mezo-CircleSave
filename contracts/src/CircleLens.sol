// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleTypes} from "./libraries/CircleTypes.sol";
import {SavingsCircle} from "./SavingsCircle.sol";
import {CircleFactory} from "./CircleFactory.sol";
import {CircleGovernor} from "./CircleGovernor.sol";

/// @title CircleLens
/// @notice Stateless read helper that aggregates circle state into single calls for the app.
contract CircleLens {
    struct Position {
        bool isMember;
        CircleTypes.Member member;
        uint256 paidBits;
        uint256 lateBits;
        uint256 missedBits;
        uint256 claimableGross;
        uint256 claimableFee;
        uint256 reserveClaimable;
        uint256 currentRoundDeadline;
        bool paidCurrentRound;
    }

    struct ProtocolStats {
        uint256 circleCount;
        uint256 totalValueContributed;
        uint256 totalValuePaidOut;
        uint16 feeBps;
        address feeRecipient;
        bool paused;
    }

    function getSummary(SavingsCircle c) public view returns (CircleTypes.Summary memory s) {
        s.circle = address(c);
        s.creator = c.creator();
        s.token = address(c.token());
        s.params = c.params();
        s.meta = CircleFactory(address(c.factory())).metaOf(address(c));
        s.status = c.status();
        s.feeBps = c.feeBps();
        s.createdAt = c.createdAt();
        s.startTime = c.startTime();
        s.endedAt = c.endedAt();
        s.totalRounds = c.totalRounds();
        s.roundsSettled = c.roundsSettled();
        s.currentRound = c.currentRound();
        s.memberCount = uint16(c.memberCount());
        s.goalAmount = c.goalAmount();
        s.goalReached = c.goalReached();
        s.finalized = c.finalized();
        s.refundMode = c.refundMode();
        s.totalContributed = c.totalContributed();
        s.totalPaidOut = c.totalPaidOut();
        s.poolBalance = c.poolBalance();
        s.collateralHeld = c.collateralHeld();
        s.makeWholeReserve = c.makeWholeReserve();
        s.distributable = c.distributable();
        address gov = CircleFactory(address(c.factory())).governor();
        if (gov != address(0)) s.proposalCount = CircleGovernor(gov).proposalCount(address(c));
        s.activityCount = c.activityCount();
        s.paused = c.factory().paused();
    }

    function getSummaries(SavingsCircle[] calldata circles) public view returns (CircleTypes.Summary[] memory out) {
        out = new CircleTypes.Summary[](circles.length);
        for (uint256 i; i < circles.length; ++i) {
            out[i] = getSummary(circles[i]);
        }
    }

    /// @notice Newest circles from the factory with their summaries.
    function getRecentCircles(CircleFactory factory, uint256 offset, uint256 limit)
        external
        view
        returns (CircleTypes.Summary[] memory out, uint256 total)
    {
        total = factory.circleCount();
        address[] memory list = factory.getCircles(offset, limit);
        out = new CircleTypes.Summary[](list.length);
        for (uint256 i; i < list.length; ++i) {
            out[i] = getSummary(SavingsCircle(list[i]));
        }
    }

    /// @notice Every circle `user` belongs to, plus circles they created but have not joined.
    function getUserCircles(CircleFactory factory, address user)
        external
        view
        returns (CircleTypes.Summary[] memory out)
    {
        address[] memory joined = factory.circlesOf(user);
        address[] memory created = factory.createdBy(user);
        address[] memory merged = new address[](joined.length + created.length);
        uint256 k;
        for (uint256 i; i < joined.length; ++i) {
            merged[k++] = joined[i];
        }
        for (uint256 i; i < created.length; ++i) {
            bool seen;
            for (uint256 j; j < joined.length; ++j) {
                if (joined[j] == created[i]) {
                    seen = true;
                    break;
                }
            }
            if (!seen) merged[k++] = created[i];
        }
        out = new CircleTypes.Summary[](k);
        for (uint256 i; i < k; ++i) {
            out[i] = getSummary(SavingsCircle(merged[i]));
        }
    }

    function getMembers(SavingsCircle c)
        external
        view
        returns (
            CircleTypes.MemberView[] memory views,
            uint256[] memory paid,
            uint256[] memory late,
            uint256[] memory missed
        )
    {
        address[] memory list = c.getMemberAddresses();
        uint256 n = list.length;
        views = new CircleTypes.MemberView[](n);
        paid = new uint256[](n);
        late = new uint256[](n);
        missed = new uint256[](n);
        uint256 currentBit = uint256(1) << c.currentRound();
        for (uint256 i; i < n; ++i) {
            (paid[i], late[i], missed[i]) = c.getPaymentBits(list[i]);
            views[i] = CircleTypes.MemberView({
                account: list[i],
                data: c.getMember(list[i]),
                paidCurrentRound: paid[i] & currentBit != 0
            });
        }
    }

    function getPosition(SavingsCircle c, address user) external view returns (Position memory pos) {
        pos.member = c.getMember(user);
        pos.isMember = pos.member.active;
        (pos.paidBits, pos.lateBits, pos.missedBits) = c.getPaymentBits(user);
        (pos.claimableGross, pos.claimableFee) = c.claimable(user);
        pos.reserveClaimable = c.reserveClaimable(user);
        uint16 r = c.currentRound();
        pos.currentRoundDeadline = c.roundDeadline(r);
        pos.paidCurrentRound = pos.paidBits & (uint256(1) << r) != 0;
    }

    /// @notice Activity log newest-first. `offset` counts back from the newest entry.
    function getActivities(SavingsCircle c, uint256 offset, uint256 limit)
        external
        view
        returns (CircleTypes.Activity[] memory out, uint256[] memory indexes, uint256 total)
    {
        total = c.activityCount();
        if (offset >= total) return (out, indexes, total);
        uint256 end = total - offset;
        uint256 size = end < limit ? end : limit;
        out = new CircleTypes.Activity[](size);
        indexes = new uint256[](size);
        for (uint256 i; i < size; ++i) {
            uint256 idx = end - 1 - i;
            out[i] = c.getActivity(idx);
            indexes[i] = idx;
        }
    }

    function getProtocolStats(CircleFactory factory) external view returns (ProtocolStats memory s) {
        s.circleCount = factory.circleCount();
        s.totalValueContributed = factory.totalValueContributed();
        s.totalValuePaidOut = factory.totalValuePaidOut();
        s.feeBps = factory.feeBps();
        s.feeRecipient = factory.feeRecipient();
        s.paused = factory.paused();
    }
}
