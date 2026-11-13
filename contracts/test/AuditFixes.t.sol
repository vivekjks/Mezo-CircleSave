// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {CircleGovernor} from "../src/CircleGovernor.sol";
import {CircleTypes} from "../src/libraries/CircleTypes.sol";

/// @notice Regression tests for the v2 security review (H-1, M-1..M-4, L-1..L-6, info items).
contract AuditFixesTest is BaseTest {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function _pooled3(CircleTypes.CircleParams memory p) internal returns (SavingsCircle c) {
        c = _create(alice, p);
        _join(c, bob);
        _join(c, carol);
        vm.prank(alice);
        c.start();
    }

    // ─────────────────────────────────────────── H-1 emergency pools

    function test_H1_emergencyPoolsMustBeInviteOnly() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Emergency);
        p.inviteSigner = address(0);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidParams.selector);
        factory.createCircle(p, _meta("x"));
    }

    function test_H1_membersWhoHaveNotPaidCannotProposeOrVote() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        _pay(c, bob, 0);

        vm.prank(carol); // never paid
        vm.expectRevert(CircleGovernor.NotUpToDate.selector);
        governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 10 * UNIT, "");

        vm.prank(alice);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 50 * UNIT, "");
        vm.prank(carol);
        vm.expectRevert(CircleGovernor.NotUpToDate.selector);
        governor.vote(c, id, true);

        vm.prank(bob);
        governor.vote(c, id, true); // 1 of 2 eligible: not enough on its own
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Pending));

        _pay(c, carol, 0); // once carol pays in, she can vote
        vm.prank(carol);
        governor.vote(c, id, true);
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Approved));
    }

    function test_H1_memberBehindOnPastRoundsLosesVote() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);
        vm.warp(block.timestamp + WEEK + 1); // round 0 deadline passed, round 1 open
        _pay(c, alice, 1);
        _pay(c, bob, 1);
        vm.warp(block.timestamp + WEEK); // round 1 deadline passed: carol is behind
        assertFalse(c.isUpToDate(carol));
        assertTrue(c.isUpToDate(alice));
        vm.prank(carol);
        vm.expectRevert(CircleGovernor.NotUpToDate.selector);
        governor.propose(c, CircleTypes.ProposalKind.Dissolve, 0, "");
    }

    function test_H1_requestCappedAtHalfThePool() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        _pay(c, bob, 0); // pool 200
        vm.prank(alice);
        vm.expectRevert(CircleGovernor.InvalidAmount.selector);
        governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 100 * UNIT + 1, "");
        vm.prank(alice);
        governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 100 * UNIT, "");
    }

    // ─────────────────────────────────────────── M-1 reserve and debt

    function test_M1_noReserveClaimWhileInDebt() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.maxMembers = 3;
        SavingsCircle c = _pooled3(p);
        // round 0 (alice): bob misses → alice short 100, bob owes 100
        _pay(c, alice, 0);
        _pay(c, carol, 0);
        vm.warp(block.timestamp + WEEK + 1);
        c.settleRound();
        // round 1 (bob): bob's debt is withheld → reserve 100
        _pay(c, alice, 1);
        _pay(c, bob, 1);
        _pay(c, carol, 1);
        c.settleRound();
        // round 2 (carol): alice, already paid out, misses → carol short 100, alice owes 100
        vm.warp(block.timestamp + WEEK);
        _pay(c, bob, 2);
        _pay(c, carol, 2);
        vm.warp(block.timestamp + WEEK);
        c.settleRound();
        assertEq(uint8(c.status()), uint8(CircleTypes.Status.Completed));

        assertEq(c.getMember(alice).debt, 100 * UNIT);
        assertEq(c.reserveClaimable(alice), 0); // in debt: nothing from the reserve
        assertEq(c.reserveClaimable(carol), 50 * UNIT);
        vm.prank(carol);
        c.withdraw();

        vm.prank(alice);
        c.repayDebt(); // reserve now 200
        assertEq(c.reserveClaimable(carol), 50 * UNIT); // carol is made whole
        assertEq(c.reserveClaimable(alice), 100 * UNIT);
    }

    // ─────────────────────────────────────────── M-3 maturity lock

    function test_M3_noTopUpsInFixedTerm() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.FixedTerm));
        _pay(c, alice, 0);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.WrongModel.selector);
        c.topUp(1_000 * UNIT);
    }

    function test_M3_noContributionsAtOrAfterMaturity_goalCannotFlip() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Goal);
        p.totalRounds = 1;
        p.beneficiary = dave;
        SavingsCircle c = _pooled3(p);
        _pay(c, alice, 0);
        vm.warp(block.timestamp + WEEK); // maturity
        vm.prank(bob);
        vm.expectRevert(SavingsCircle.AlreadyMatured.selector);
        c.contribute(0);
        vm.prank(bob);
        vm.expectRevert(SavingsCircle.AlreadyMatured.selector);
        c.topUp(1_000 * UNIT);
        c.finalize(); // goal missed → fee-free refund, not a release to dave
        assertTrue(c.refundMode());
        assertEq(musd.balanceOf(dave), 0);
    }

    // ─────────────────────────────────────────── M-4 public rotating deposits

    function test_M4_publicRotatingCirclesNeedADeposit() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.inviteSigner = address(0);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidParams.selector);
        factory.createCircle(p, _meta("x"));
        p.collateralAmount = p.contributionAmount;
        vm.prank(alice);
        factory.createCircle(p, _meta("x"));
    }

    // ─────────────────────────────────────────── L-1 proposal lifetime

    function test_L1_approvedProposalExpiresAndCanBeWithdrawn() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.Emergency));
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        _pay(c, carol, 0);
        vm.prank(bob);
        uint256 id = governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 100 * UNIT, "");
        vm.prank(alice);
        governor.vote(c, id, true);
        vm.prank(carol);
        governor.vote(c, id, true);
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Approved));

        vm.warp(block.timestamp + 4 days + 1); // voting period (2d) + execution window (2d)
        assertEq(uint8(governor.proposalState(c, id)), uint8(CircleTypes.ProposalState.Expired));
        vm.expectRevert(CircleGovernor.ProposalNotApproved.selector);
        governor.execute(c, id);

        vm.prank(bob);
        uint256 id2 = governor.propose(c, CircleTypes.ProposalKind.Withdrawal, 50 * UNIT, "");
        vm.prank(alice);
        governor.vote(c, id2, true);
        vm.prank(carol);
        governor.vote(c, id2, true);
        vm.prank(bob);
        governor.cancel(c, id2); // the requester can withdraw an approved request
        assertEq(uint8(governor.proposalState(c, id2)), uint8(CircleTypes.ProposalState.Cancelled));
    }

    function test_L1_noProposalsAfterMaturity() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.FixedTerm));
        _pay(c, alice, 0);
        vm.warp(block.timestamp + 4 * WEEK);
        vm.prank(alice);
        vm.expectRevert(CircleGovernor.AlreadyMatured.selector);
        governor.propose(c, CircleTypes.ProposalKind.Dissolve, 0, "");
    }

    // ─────────────────────────────────────────── L-2 grace after a pause

    function test_L2_membersGetGraceAfterUnpause() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = 100 * UNIT;
        p.maxMembers = 3;
        SavingsCircle c = _pooled3(p);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.prank(owner);
        factory.pause();
        vm.warp(block.timestamp + WEEK + 1); // deadline passes while carol cannot pay
        vm.prank(owner);
        factory.unpause();
        vm.expectRevert(SavingsCircle.RoundNotDue.selector);
        c.settleRound(); // carol's deposit is not seized straight away
        vm.warp(block.timestamp + 2 days + 1);
        c.settleRound();
        assertEq(c.getMember(carol).missedCount, 1);
    }

    // ─────────────────────────────────────────── L-3 owner powers

    function test_L3_ownerCannotRenounceAndPauseExpires() public {
        vm.prank(owner);
        vm.expectRevert(CircleFactory.RenounceDisabled.selector);
        factory.renounceOwnership();

        vm.prank(owner);
        factory.pause();
        assertTrue(factory.paused());
        vm.warp(block.timestamp + 14 days);
        assertFalse(factory.paused()); // a pause can never freeze funds for good
        assertEq(factory.unpausedAt(), uint64(block.timestamp));
    }

    function test_L3_claimsWorkWhilePaused() public {
        SavingsCircle c = _pooled3(_baseParams(CircleTypes.Model.FixedTerm));
        for (uint16 r; r < 4; ++r) {
            _pay(c, alice, r);
            _pay(c, bob, r);
            vm.warp(block.timestamp + WEEK);
        }
        c.finalize();
        vm.prank(owner);
        factory.pause();
        vm.prank(alice);
        c.claim();
        assertTrue(c.getMember(alice).claimed);
    }

    // ─────────────────────────────────────────── L-4 equal split

    function test_L4_nonPayersNeverShareLeftovers() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.FixedTerm);
        p.earlyExitPenaltyBps = 1_000;
        SavingsCircle c = _pooled3(p);
        _pay(c, alice, 0);
        _pay(c, bob, 0);
        vm.prank(alice);
        c.exitEarly();
        vm.prank(bob);
        c.exitEarly(); // 20 MUSD of penalties left, carol never paid
        vm.warp(block.timestamp + 4 * WEEK);
        uint256 t0 = musd.balanceOf(treasury);
        c.finalize();
        assertEq(musd.balanceOf(treasury) - t0, 20 * UNIT);
        vm.prank(carol);
        vm.expectRevert(SavingsCircle.NothingToClaim.selector);
        c.claim();
    }

    // ─────────────────────────────────────────── L-5 removals stick

    function test_L5_removedMemberCannotRejoin() public {
        SavingsCircle c = _create(alice, _baseParams(CircleTypes.Model.Rotating));
        _join(c, bob);
        vm.prank(alice);
        c.removeMember(bob);
        assertTrue(c.banned(bob));
        bytes memory sig = _inviteSig(c, inviteKey, bob);
        vm.prank(bob);
        vm.expectRevert(SavingsCircle.Banned.selector);
        c.join(sig);
    }

    // ─────────────────────────────────────────── L-6 beneficiary

    function test_L6_beneficiaryCannotBeAProtocolAddress() public {
        address predicted = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
        address[4] memory bad = [address(factory), address(musd), address(governor), predicted];
        for (uint256 i; i < bad.length; ++i) {
            CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Goal);
            p.beneficiary = bad[i];
            vm.prank(alice);
            vm.expectRevert(SavingsCircle.InvalidParams.selector);
            factory.createCircle(p, _meta("x"));
        }
    }

    // ─────────────────────────────────────────── info items

    function test_info_startOnlyBeforeJoiningCloses() public {
        SavingsCircle c = _create(alice, _baseParams(CircleTypes.Model.Rotating));
        _join(c, bob);
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.JoinClosed.selector);
        c.start();
        vm.prank(erin);
        c.cancel();
    }

    function test_info_parentMustBeACircle() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.parent = address(0xBEEF);
        vm.prank(alice);
        vm.expectRevert(CircleFactory.InvalidParent.selector);
        factory.createCircle(p, _meta("x"));
    }

    function test_info_amountBounds() public {
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.contributionAmount = 1e30 + 1;
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidParams.selector);
        factory.createCircle(p, _meta("x"));
        p.contributionAmount = 1e16 - 1; // below 0.01 MUSD
        vm.prank(alice);
        vm.expectRevert(SavingsCircle.InvalidParams.selector);
        factory.createCircle(p, _meta("x"));
    }

    // ─────────────────────────────────────────── MUSD permit (one transaction)

    function _permitSig(uint256 key, address owner_, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner_, address(factory), value, musd.nonces(owner_), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", musd.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }

    function test_permit_joinAndPayWithoutAnApproval() public {
        (address user, uint256 key) = makeAddrAndKey("permit-user");
        musd.mint(user, 1_000 * UNIT);
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.collateralAmount = 50 * UNIT;
        p.maxMembers = 2;
        SavingsCircle c = _create(alice, p);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(key, user, 50 * UNIT, deadline);
        bytes memory invite = _inviteSig(c, inviteKey, user);
        vm.prank(user);
        c.joinWithPermit(invite, 50 * UNIT, deadline, v, r, s);
        assertTrue(c.isMember(user));
        assertEq(c.getMember(user).collateral, 50 * UNIT);

        vm.prank(alice);
        c.start();
        (v, r, s) = _permitSig(key, user, 100 * UNIT, deadline);
        vm.prank(user);
        c.contributeWithPermit(0, 100 * UNIT, deadline, v, r, s);
        (uint256 paid,,) = c.getPaymentBits(user);
        assertEq(paid & 1, 1);
        assertEq(musd.balanceOf(user), 850 * UNIT);
    }

    function test_permit_frontRunPermitStillLetsThePaymentThrough() public {
        (address user, uint256 key) = makeAddrAndKey("permit-user");
        musd.mint(user, 1_000 * UNIT);
        CircleTypes.CircleParams memory p = _baseParams(CircleTypes.Model.Rotating);
        p.maxMembers = 2;
        SavingsCircle c = _create(alice, p);
        _join(c, user);
        vm.prank(alice);
        c.start();
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(key, user, 100 * UNIT, deadline);
        musd.permit(user, address(factory), 100 * UNIT, deadline, v, r, s); // someone submits it first
        vm.prank(user);
        c.contributeWithPermit(0, 100 * UNIT, deadline, v, r, s);
        (uint256 paid,,) = c.getPaymentBits(user);
        assertEq(paid & 1, 1);
    }
}
