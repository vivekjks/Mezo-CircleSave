// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {CircleFactory} from "../src/CircleFactory.sol";
import {CircleGovernor} from "../src/CircleGovernor.sol";
import {CircleLens} from "../src/CircleLens.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleTypes} from "../src/libraries/CircleTypes.sol";
import {MockMUSD} from "./mocks/MockMUSD.sol";

abstract contract BaseTest is Test {
    uint256 internal constant UNIT = 1e18;
    uint16 internal constant FEE_BPS = 50; // 0.5%
    uint32 internal constant WEEK = 7 days;

    MockMUSD internal musd;
    CircleFactory internal factory;
    CircleGovernor internal governor;
    CircleLens internal lens;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal erin = makeAddr("erin");

    // test circles are invite-only by default; helpers sign invites with this key
    address internal inviteSigner;
    uint256 internal inviteKey;

    function setUp() public virtual {
        vm.warp(1_750_000_000);
        (inviteSigner, inviteKey) = makeAddrAndKey("circle-invite");
        musd = new MockMUSD();
        SavingsCircle impl = new SavingsCircle();
        factory = new CircleFactory(IERC20(address(musd)), address(impl), owner, treasury, FEE_BPS);
        governor = new CircleGovernor(factory);
        vm.prank(owner);
        factory.setGovernor(address(governor));
        lens = new CircleLens();

        address[5] memory users = [alice, bob, carol, dave, erin];
        for (uint256 i; i < users.length; ++i) {
            musd.mint(users[i], 100_000 * UNIT);
            vm.prank(users[i]);
            musd.approve(address(factory), type(uint256).max);
        }
    }

    function _meta(string memory name) internal pure returns (CircleTypes.CircleMeta memory) {
        return CircleTypes.CircleMeta({name: name, description: "Saving together", rules: "Pay on time."});
    }

    function _baseParams(CircleTypes.Model model) internal view returns (CircleTypes.CircleParams memory p) {
        p.model = model;
        p.payoutOrder = CircleTypes.PayoutOrder.JoinOrder;
        p.contributionAmount = 100 * UNIT;
        p.periodDuration = WEEK;
        p.votingPeriod = 2 days;
        p.maxMembers = 5;
        p.totalRounds = model == CircleTypes.Model.Rotating ? 0 : 4;
        p.approvalBps = 6_000;
        p.joinDeadline = uint64(block.timestamp + 3 days);
        p.inviteSigner = inviteSigner;
        p.creatorJoins = true;
    }

    function _create(address creator, CircleTypes.CircleParams memory p) internal returns (SavingsCircle c) {
        vm.prank(creator);
        c = SavingsCircle(factory.createCircle(p, _meta("Friends Savings Circle")));
    }

    function _join(SavingsCircle c, address who) internal {
        bytes memory sig = c.params().inviteSigner == address(0) ? bytes("") : _inviteSig(c, inviteKey, who);
        vm.prank(who);
        c.join(sig);
    }

    function _pay(SavingsCircle c, address who, uint16 round) internal {
        vm.prank(who);
        c.contribute(round);
    }

    function _inviteSig(SavingsCircle c, uint256 inviteKey, address joiner) internal view returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(c.inviteDigest(joiner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(inviteKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
