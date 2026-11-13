// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {CircleTypes} from "../src/libraries/CircleTypes.sol";

contract RotatingTest is BaseTest {
    function _rotating(uint256 collateral) internal returns (SavingsCircle c) {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = collateral;
        p.maxMembers = 3;
        c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);
        vm.prank(alice);
        c.start();
    }

    function test_createJoinStart_recordsEverything() public {
        SavingsCircle c = _rotating(100 * UNIT);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Active));
        assertEq(c.memberCount(), 3);
        assertEq(c.totalRounds(), 3);
        assertEq(c.collateralHeld(), 300 * UNIT);
        address[] memory order = c.getPayoutOrder();
        assertEq(order[0], alice);
        assertEq(order[1], bob);
        assertEq(order[2], carol);
        assertEq(c.getMember(carol).payoutRound, 3);
        assertEq(factory.circlesOf(bob)[0], address(c));
        assertEq(factory.reputationOf(bob).circlesJoined, 1);
        assertEq(factory.metaOf(address(c)).name, "Friends Savings Circle");
    }

    function test_fullCycle_everyonePaysAndReceivesOnce() public {
        SavingsCircle c = _rotating(100 * UNIT);
        address[3] memory ms = [alice, bob, carol];
        uint256[3] memory before;
        for (uint256 i; i < 3; ++i) {
            before[i] = musd.balanceOf(ms[i]);
        }

        for (uint16 r; r < 3; ++r) {
            for (uint256 i; i < 3; ++i) {
                _pay(c, ms[i], r);
            }
            c.settleRound(); // everyone paid → settles before the deadline
            vm.warp(block.timestamp + WEEK);
        }

        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Completed));
        uint256 net = 300 * UNIT - (300 * UNIT * FEE_BPS) / 10_000;
        for (uint256 i; i < 3; ++i) {
            vm.prank(ms[i]);
            c.withdraw(); // collateral back
            // paid 300 in contributions, received one pot net of fee
            assertEq(musd.balanceOf(ms[i]), before[i] + 100 * UNIT - 300 * UNIT + net); // + collateral back
            assertEq(c.getMember(ms[i]).received, net);
            assertEq(factory.reputationOf(ms[i]).onTimePayments, 3);
            assertEq(factory.reputationOf(ms[i]).circlesCompleted, 1);
        }
        assertEq(musd.balanceOf(treasury), 3 * (300 * UNIT * FEE_BPS) / 10_000);
        assertEq(musd.balanceOf(address(c)), 0);
    }

    function test_settle_revertsBeforeDeadlineIfUnpaid() public {
        SavingsCircle c = _rotating(0);
        _pay(c, alice, 0);
        vm.expectRevert(SavingsCircle.RoundNotDue.selector);
        c.settleRound();
    }

    function test_contribute_guards() public {
        SavingsCircle c = _rotating(0);
        _pay(c, alice, 0);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.AlreadyPaid.selector);
        c.contribute(0);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidRound.selector); // cannot prepay a future round
        c.contribute(1);
        vm.prank(dave);
        vm.expectRevert(SavingsCircle.NotMember.selector);
        c.contribute(0);
    }

    function test_latePayment_isFlagged() public {
        SavingsCircle c = _rotating(0);
        vm.warp(block.timestamp + WEEK + 1);
        _pay(c, bob, 0);
        (uint256 paid, uint256 late,) = c.getPaymentBits(bob);
        assertEq(paid & 1, 1);
        assertEq(late & 1, 1);
        assertEq(factory.reputationOf(bob).latePayments, 1);
    }

    function test_defaults_collateralCovers_thenDebtWithheld_thenReserveMakesWhole() public {
        SavingsCircle c = _rotating(100 * UNIT);
        uint256 fee = (300 * UNIT * FEE_BPS) / 10_000;

        // round 0: carol misses, her collateral covers it → alice gets a full pot
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.warp(block.timestamp + WEEK + 1);
        c.settleRound();
        assertEq(c.getMember(alice).received, 300 * UNIT - fee);
        assertEq(c.getMember(carol).collateral, 0);
        assertEq(c.getMember(carol).missedCount, 1);

        // round 1: carol misses again, no collateral left → bob's pot is short 100, carol owes 100
        _pay(c, alice, 1);
        _pay(c, bob, 1);
        vm.warp(block.timestamp + WEEK);
        c.settleRound();
        assertEq(c.getMember(carol).debt, 100 * UNIT);
        assertEq(c.getMember(bob).shortfallSuffered, 100 * UNIT);
        uint256 fee200 = (200 * UNIT * FEE_BPS) / 10_000;
        assertEq(c.getMember(bob).received, 200 * UNIT - fee200);

        // round 2: carol is the recipient but skips again → her debt is withheld from her payout
        _pay(c, alice, 2);
        _pay(c, bob, 2);
        vm.warp(block.timestamp + WEEK);
        uint256 carolBefore = musd.balanceOf(carol);
        c.settleRound();
        assertEq(musd.balanceOf(carol) - carolBefore, 200 * UNIT - fee200 - 100 * UNIT);
        assertEq(c.makeWholeReserve(), 100 * UNIT);
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Completed));

        // bob is made whole from the reserve, alice withdraws her collateral
        assertEq(c.reserveClaimable(bob), 100 * UNIT);
        uint256 bobBefore = musd.balanceOf(bob);
        vm.prank(bob);
        c.withdraw();
        assertEq(musd.balanceOf(bob) - bobBefore, 200 * UNIT); // 100 collateral + 100 reserve
        vm.prank(alice);
        c.withdraw();
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.NothingToClaim.selector);
        c.withdraw();
        assertEq(musd.balanceOf(address(c)), 0);
        assertEq(factory.reputationOf(carol).missedPayments, 3);
    }

    function test_repayDebt_feedsReserve() public {
        SavingsCircle c = _rotating(0);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.warp(block.timestamp + WEEK + 1);
        c.settleRound(); // carol misses, no collateral → debt 100
        assertEq(c.getMember(carol).debt, 100 * UNIT);
        vm.prank(carol);
        c.repayDebt();
        assertEq(c.getMember(carol).debt, 0);
        assertEq(c.makeWholeReserve(), 100 * UNIT);
        assertEq(c.poolBalance(), 0);
    }

    function test_customPayoutOrder() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.payoutOrder = CircleTypes.PayoutOrder.Custom;
        p.maxMembers = 3;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);

        vm.prank(alice);
        vm.expectRevert(SavingsCircle.PayoutOrderNotSet.selector);
        c.start();

        address[] memory order = new address[](3);
        order[0] = carol;
        order[1] = alice;
        order[2] = bob;
        vm.prank(alice);
        c.setPayoutOrder(order);
        vm.prank(alice);
        c.start();
        assertEq(c.getPayoutOrder()[0], carol);
        assertEq(c.getMember(bob).payoutRound, 3);
    }

    function test_randomOrder_isRejected_noRandomnessOnMezo() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.payoutOrder = CircleTypes.PayoutOrder.Random;
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidParams.selector);
        factory.createCircle(p, _meta("x"));
    }

    function test_fullCircle_anyMemberCanStart() public {
        SavingsCircle c = _create(alice, _baseParams(CircleTypes.Model.Rotating));
        _join(c, bob);
        _join(c, carol);
        _join(c, dave);
        vm.prank(erin);
        vm.expectRevert(SavingsCircle.NotMember.selector);
        c.leave();
        _join(c, erin);
        vm.prank(erin);
        c.start();
        assertEq(c.getPayoutOrder()[4], erin);
    }

    function test_privateCircle_requiresInviteSignature() public {
        (address signer, uint256 key) = makeAddrAndKey("invite");
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.inviteSigner = signer;
        SavingsCircle c = _create(alice, p);

        vm.prank(bob);
        vm.expectRevert(SavingsCircle.InvalidInvite.selector);
        c.join("");

        // a signature for bob cannot be replayed by carol
        bytes memory sigBob = _inviteSig(c, key, bob);
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.InvalidInvite.selector);
        c.join(sigBob);

        vm.prank(bob);
        c.join(sigBob);
        assertTrue(c.isMember(bob));
    }

    function test_leaveRemoveCancel_refundCollateral() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = 50 * UNIT;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);
        _join(c, dave);

        uint256 bobBefore = musd.balanceOf(bob);
        vm.prank(bob);
        c.leave();
        assertEq(musd.balanceOf(bob) - bobBefore, 50 * UNIT);
        assertEq(c.getMemberAddresses()[1], carol); // join order preserved
        assertEq(factory.circlesOf(bob).length, 0);

        vm.prank(bob);
        vm.expectRevert(SavingsCircle.NotAuthorized.selector);
        c.removeMember(carol);
        vm.prank(alice);
        c.removeMember(carol);
        assertFalse(c.isMember(carol));

        // after the join deadline anyone may cancel; dave withdraws his collateral
        vm.warp(block.timestamp + 4 days);
        vm.prank(erin);
        c.cancel();
        uint256 daveBefore = musd.balanceOf(dave);
        vm.prank(dave);
        c.withdraw();
        assertEq(musd.balanceOf(dave) - daveBefore, 50 * UNIT);
    }

    function test_joinGuards() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.maxMembers = 2;
        SavingsCircle c = _create(alice, p);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.AlreadyMember.selector);
        c.join("");
        _join(c, bob);
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.CircleFull.selector);
        c.join("");
    }

    function test_pause_blocksMoneyMovementButAllowsExit() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = 10 * UNIT;
        SavingsCircle c = _create(alice, p);
        _join(c, bob);
        vm.prank(owner);
        factory.pause();
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.ProtocolPaused.selector);
        c.join("");
        vm.prank(bob);
        c.leave(); // exits stay open
        vm.prank(alice);
        vm.expectRevert();
        factory.createCircle(p, _meta("x"));
    }

    function test_onlyCirclesCanPull() public {
        vm.expectRevert(CircleFactory.NotCircle.selector);
        factory.pullFunds(alice, 1);
    }

    function test_onlyGovernorHooks() public {
        SavingsCircle c = _rotating(0);
        vm.expectRevert(SavingsCircle.NotAuthorized.selector);
        c.executeWithdrawal(alice, 1, 0);
        vm.expectRevert(SavingsCircle.NotAuthorized.selector);
        c.logGovernance(CircleTypes.ActivityKind.Voted, alice, 0, 0);
    }

    function test_invalidParamsRejected() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.goalAmount = 1;
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidParams.selector);
        factory.createCircle(p, _meta("x"));

        p = _baseParams(CircleTypes.Model.Rotating);
        vm.prank(alice);
        vm.expectRevert(CircleFactory.InvalidMeta.selector);
        factory.createCircle(p, _meta(""));
    }

    function test_lensViews() public {
        SavingsCircle c = _rotating(100 * UNIT);
        _pay(c, alice, 0);
        CircleTypes.Summary memory s = lens.getSummary(c);
        assertEq(s.memberCount, 3);
        assertEq(s.meta.name, "Friends Savings Circle");
        assertEq(s.totalContributed, 100 * UNIT);
        (CircleTypes.MemberView[] memory views, uint256[] memory paid,,) = lens.getMembers(c);
        assertEq(views.length, 3);
        assertTrue(views[0].paidCurrentRound);
        assertEq(paid[0], 1);
        (CircleTypes.Activity[] memory acts,, uint256 total) = lens.getActivities(c, 0, 3);
        assertEq(uint8(acts[0].kind), uint8(CircleTypes.ActivityKind.Contributed));
        assertGt(total, 5);
        CircleTypes.Summary[] memory mine = lens.getUserCircles(factory, bob);
        assertEq(mine.length, 1);
        (CircleTypes.Summary[] memory recent, uint256 count) = lens.getRecentCircles(factory, 0, 10);
        assertEq(count, 1);
        assertEq(recent[0].circle, address(c));
    }
}
