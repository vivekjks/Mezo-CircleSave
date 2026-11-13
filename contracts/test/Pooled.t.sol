// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleGovernor} from "../src/CircleGovernor.sol";
import {CircleTypes} from "../src/libraries/CircleTypes.sol";

contract PooledTest is BaseTest {
    function _pooled(CircleTypes.CircleParams memory p) internal returns (SavingsCircle c) {
        c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);
        vm.prank(alice);
        c.start();
    }

    function _fee(uint256 x) internal pure returns (uint256) {
        return (x * FEE_BPS) / 10_000;
    }

    // ───────────────────────────────────────────── goal

    function test_goal_releasedToBeneficiary() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Goal);
        p.totalRounds = 2;
        p.beneficiary = dave;
        SavingsCircle c = _pooled(p);
        assertEq(c.goalAmount(), 600 * UNIT);

        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);
        vm.warp(block.timestamp + WEEK);
        _pay(c, alice, 1);
        _pay(c, bob, 1);
        _pay(c, carol, 1);
        assertTrue(c.goalReached());

        vm.prank(alice);
        vm.expectRevert(SavingsCircle.GoalAlreadyReached.selector);
        c.topUp(1);

        uint256 before = musd.balanceOf(dave);
        c.finalize();
        assertEq(musd.balanceOf(dave) - before, 600 * UNIT - _fee(600 * UNIT));
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Completed));
    }

    function test_goal_customTarget_withTopUp_membersClaim() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Goal);
        p.goalAmount = 250 * UNIT;
        SavingsCircle c = _pooled(p);
        _pay(c, bob, 0);
        vm.prank(alice);
        c.topUp(150 * UNIT);
        assertTrue(c.goalReached());
        c.finalize();
        (uint256 gross, uint256 fee) = c.claimable(alice);
        assertEq(gross, 150 * UNIT);
        assertEq(fee, _fee(150 * UNIT));
        vm.prank(alice);
        c.claim();
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.NothingToClaim.selector);
        c.claim();
    }

    function test_goal_missed_refundsFeeFree() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Goal);
        p.totalRounds = 2;
        SavingsCircle c = _pooled(p);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.warp(block.timestamp + WEEK);
        _pay(c, alice, 1);

        vm.expectRevert(SavingsCircle.NotMatured.selector);
        c.finalize();
        vm.warp(block.timestamp + WEEK);
        c.finalize();
        assertTrue(c.refundMode());

        uint256 a0 = musd.balanceOf(alice);
        vm.prank(alice);
        c.claim();
        assertEq(musd.balanceOf(alice) - a0, 200 * UNIT);
        uint256 b0 = musd.balanceOf(bob);
        vm.prank(bob);
        c.claim();
        assertEq(musd.balanceOf(bob) - b0, 100 * UNIT);
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.NothingToClaim.selector);
        c.claim();
    }

    // ───────────────────────────────────────────── fixed term

    function test_fixedTerm_earlyExitPenaltyRewardsStayers() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.FixedTerm);
        p.earlyExitPenaltyBps = 1_000; // 10%
        SavingsCircle c = _pooled(p);
        for (uint16 r; r < 2; ++r) {
            _pay(c, alice, r);
            _pay(c, bob, r);
            _pay(c, carol, r);
            vm.warp(block.timestamp + WEEK);
        }
        uint256 c0 = musd.balanceOf(carol);
        vm.prank(carol);
        c.exitEarly();
        assertEq(musd.balanceOf(carol) - c0, 180 * UNIT);

        vm.prank(carol);
        vm.expectRevert(SavingsCircle.MemberExited.selector);
        c.contribute(2);

        for (uint16 r = 2; r < 4; ++r) {
            _pay(c, alice, r);
            _pay(c, bob, r);
            vm.warp(block.timestamp + WEEK);
        }
        c.finalize();
        (uint256 gross, uint256 fee) = c.claimable(alice);
        assertEq(gross, 410 * UNIT); // 400 own + half of the 20 penalty
        assertEq(fee, _fee(410 * UNIT));
        vm.prank(alice);
        c.claim();
        vm.prank(bob);
        c.claim();
        assertLe(musd.balanceOf(address(c)), 1);
    }

    function test_fixedTerm_cannotFinalizeEarly() public {
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.FixedTerm));
        vm.expectRevert(SavingsCircle.NotMatured.selector);
        c.finalize();
    }

    // ───────────────────────────────────────────── emergency + governance

    function test_emergency_withdrawalVoteFlow() public {
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);

        vm.prank(bob);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 150 * UNIT, "Medical bill");
        assertEq(id, 0);

        vm.prank(bob);
        vm.expectRevert(CircleGovernor.CannotVoteOwnRequest.selector);
        governor.vote(c, id, true);

        vm.prank(alice);
        governor.vote(c, id, true);
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Pending));
        vm.prank(carol);
        governor.vote(c, id, true);
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Approved));

        uint256 b0 = musd.balanceOf(bob);
        governor.execute(c, id);
        assertEq(musd.balanceOf(bob) - b0, 150 * UNIT - _fee(150 * UNIT));
        assertEq(c.getMember(bob).drawn, 150 * UNIT);

        // second request is voted down
        vm.prank(carol);
        uint256 id2 = governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 50 * UNIT, "Car repair");
        vm.prank(alice);
        governor.vote(c, id2, false);
        assertEq(uint8(governor.proposalState(c, id2)), uint8(CircleTypes.ProposalState.Rejected));
        vm.expectRevert(CircleGovernor.ProposalNotApproved.selector);
        governor.execute(c, id2);

        // at maturity the remaining 150 is refunded by net contribution (bob drew more than he paid)
        vm.warp(block.timestamp + 4 * WEEK);
        c.finalize();
        (uint256 aliceGross, uint256 aliceFee) = c.claimable(alice);
        assertEq(aliceGross, 75 * UNIT);
        assertEq(aliceFee, 0);
        (uint256 bobGross,) = c.claimable(bob);
        assertEq(bobGross, 0);

        CircleTypes.ProposalView[] memory views = governor.getProposals(c, alice);
        assertEq(views.length, 2);
        assertEq(views[0].id, 1); // newest first
        assertEq(views[0].viewerVote, 2);
    }

    function test_proposalExpires() public {
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        vm.prank(alice);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 50 * UNIT, "");
        vm.warp(block.timestamp + 3 days);
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Expired));
        vm.prank(bob);
        vm.expectRevert(CircleGovernor.ProposalNotPending.selector);
        governor.vote(c, id, true);
    }

    function test_withdrawalOnlyForEmergencyPools() public {
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.FixedTerm));
        _pay(c, alice, 0);
        vm.prank(alice);
        vm.expectRevert(CircleGovernor.WrongModel.selector);
        governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 50 * UNIT, "");
        vm.prank(dave);
        vm.expectRevert(CircleGovernor.NotMember.selector);
        governor.propose(c, CircleTypes.ProposalKind.Dissolve, 0, "");
    }

    function test_dissolve_refundsEveryoneFeeFree() public {
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.FixedTerm));
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);

        vm.prank(alice);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Dissolve, 0, "Plans changed");
        vm.prank(bob);
        governor.vote(c, id, true); // 2 of 3 ≥ 60%
        governor.execute(c, id);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Completed));
        assertTrue(c.refundMode());

        for (uint256 i; i < 3; ++i) {
            address who = [alice, bob, carol][i];
            uint256 b0 = musd.balanceOf(who);
            vm.prank(who);
            c.claim();
            assertEq(musd.balanceOf(who) - b0, 100 * UNIT);
        }
    }

    function test_cancelProposal() public {
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.Goal));
        _pay(c, alice, 0);
        vm.prank(alice);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Dissolve, 0, "");
        vm.prank(bob);
        vm.expectRevert(CircleGovernor.NotAuthorized.selector);
        governor.cancel(c, id);
        vm.prank(alice);
        governor.cancel(c, id);
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Cancelled));
    }

    function testFuzz_emergency_claimsNeverExceedPool(uint96 extraA, uint96 extraB) public {
        uint256 a = bound(uint256(extraA), 1, 10_000 * UNIT);
        uint256 b = bound(uint256(extraB), 1, 10_000 * UNIT);
        SavingsCircle c = _pooled(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.prank(alice);
        c.topUp(a);
        vm.prank(bob);
        c.topUp(b);
        vm.warp(block.timestamp + 4 * WEEK);
        c.finalize();
        vm.prank(alice);
        c.claim();
        vm.prank(bob);
        c.claim();
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.NothingToClaim.selector);
        c.claim();
        assertLe(musd.balanceOf(address(c)), 2);
    }
}
