// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleLens} from "../src/CircleLens.sol";
import {CircleTypes} from "../src/libraries/CircleTypes.sol";

contract EdgeCasesTest is BaseTest {
    function _rotating3(uint256 collateral) internal returns (SavingsCircle c) {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = collateral;
        p.maxMembers = 3;
        c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);
        vm.prank(alice);
        c.start();
    }

    function test_leaveThenRejoin_startsClean() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = 10 * UNIT;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        vm.prank(bob);
        c.leave();
        _join(c, bob);
        CircleTypes.Member memory m = c.getMember(bob);
        assertTrue(m.active);
        assertEq(m.collateral, 10 * UNIT);
        assertEq(m.index, 1);
        assertEq(c.collateralHeld(), 20 * UNIT);
        assertEq(factory.circlesOf(bob).length, 1);
        assertEq(factory.reputationOf(bob).circlesJoined, 1);
    }

    function test_creatorCancel_refundsEveryDeposit() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = 25 * UNIT;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        vm.prank(bob);
        vm.expectRevert(SavingsCircle.NotAuthorized.selector);
        c.cancel(); // only the creator before the deadline
        vm.prank(alice);
        c.cancel();
        for (uint256 i; i < 2; ++i) {
            address who = [alice, bob][i];
            uint256 b0 = musd.balanceOf(who);
            vm.prank(who);
            c.withdraw();
            assertEq(musd.balanceOf(who) - b0, 25 * UNIT);
        }
        assertEq(musd.balanceOf(address(c)), 0);
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.WrongStatus.selector);
        c.join("");
    }

    function test_pause_blocksPayoutsButNotWithdrawals() public {
        SavingsCircle c = _rotating3(10 * UNIT);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);
        vm.prank(owner);
        factory.pause();
        vm.expectRevert(SavingsCircle.ProtocolPaused.selector);
        c.settleRound();
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.ProtocolPaused.selector);
        c.contribute(0);
        vm.prank(owner);
        factory.unpause();
        c.settleRound(); // anyone can settle once unpaused
        assertEq(c.roundsSettled(), 1);
    }

    function test_settle_isPermissionless() public {
        SavingsCircle c = _rotating3(0);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);
        vm.prank(erin); // not a member
        c.settleRound();
        assertEq(c.getMember(alice).received, 300 * UNIT - (300 * UNIT * FEE_BPS) / 10_000);
    }

    function test_debtWithheldFromPayout_reachesShortedMember() public {
        SavingsCircle c = _rotating3(0);
        // round 1: carol misses → alice's pot is short by 100, carol owes 100
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.warp(block.timestamp + WEEK + 1);
        c.settleRound();
        assertEq(c.getMember(alice).shortfallSuffered, 100 * UNIT);
        // rounds 2 and 3 complete normally
        for (uint16 r = 1; r < 3; ++r) {
            _pay(c, alice, r);
            _pay(c, bob, r);
            _pay(c, carol, r);
            c.settleRound();
            vm.warp(block.timestamp + WEEK);
        }
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Completed));
        // carol's debt was withheld from her own payout in round 3
        assertEq(c.getMember(carol).debt, 0);
        assertEq(c.reserveClaimable(alice), 100 * UNIT);
        uint256 a0 = musd.balanceOf(alice);
        vm.prank(alice);
        c.withdraw();
        assertEq(musd.balanceOf(alice) - a0, 100 * UNIT);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.NothingToClaim.selector);
        c.withdraw();
    }

    function test_goal_beneficiaryWhoIsMember_isCreditedOnce() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Goal);
        p.totalRounds = 1;
        p.beneficiary = alice;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        vm.prank(alice);
        c.start();
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        assertTrue(c.goalReached());
        c.finalize();
        uint256 net = 200 * UNIT - (200 * UNIT * FEE_BPS) / 10_000;
        assertEq(c.getMember(alice).received, net);
        (uint256 gross,) = c.claimable(bob);
        assertEq(gross, 0); // released to the beneficiary, nothing left to claim
    }

    function test_dissolve_excludesMembersWhoExited() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.FixedTerm);
        p.earlyExitPenaltyBps = 1_000;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);
        vm.prank(alice);
        c.start();
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);
        vm.prank(carol);
        c.exitEarly(); // 10 MUSD penalty stays in the pool

        vm.prank(alice);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Dissolve, 0, "");
        assertEq(governor.getProposal(address(c), id).eligibleVoters, 2);
        vm.prank(bob);
        governor.vote(c, id, true);
        governor.execute(c, id);

        (uint256 aliceGross, uint256 aliceFee) = c.claimable(alice);
        assertEq(aliceGross, 105 * UNIT); // 100 own + half the penalty
        assertEq(aliceFee, 0); // dissolving is fee-free
        (uint256 carolGross,) = c.claimable(carol);
        assertEq(carolGross, 0);
    }

    function test_lensPosition_reflectsMember() public {
        SavingsCircle c = _rotating3(10 * UNIT);
        _pay(c, bob, 0);
        CircleLens.Position memory pos = lens.getPosition(c, bob);
        assertTrue(pos.isMember);
        assertTrue(pos.paidCurrentRound);
        assertEq(pos.member.collateral, 10 * UNIT);
        assertEq(pos.currentRoundDeadline, c.roundDeadline(0));
        CircleLens.Position memory stranger = lens.getPosition(c, erin);
        assertFalse(stranger.isMember);
    }

    function test_reputation_tracksOnTimeLateAndMissed() public {
        SavingsCircle c = _rotating3(100 * UNIT);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.warp(block.timestamp + WEEK + 1);
        _pay(c, carol, 0); // late, round 0 not settled yet
        c.settleRound();
        _pay(c, alice, 1);
        _pay(c, bob, 1);
        vm.warp(block.timestamp + WEEK);
        c.settleRound(); // carol misses round 1, her deposit covers it
        CircleTypes.Reputation memory r = factory.reputationOf(carol);
        assertEq(r.onTimePayments, 0);
        assertEq(r.latePayments, 1);
        assertEq(r.missedPayments, 1);
        assertEq(factory.reputationOf(alice).payoutsReceived, 1);
    }
}
