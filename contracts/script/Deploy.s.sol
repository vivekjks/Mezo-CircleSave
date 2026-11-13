// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {CircleGovernor} from "../src/CircleGovernor.sol";
import {CircleLens} from "../src/CircleLens.sol";
import {MusdFaucet} from "../src/MusdFaucet.sol";

/// @notice Deploys the full CircleSave stack to Mezo.
///   PRIVATE_KEY=0x… forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast --slow
contract Deploy is Script {
    // Mezo Testnet MUSD (https://mezo.org/docs/users/resources/contracts-reference)
    address internal constant MUSD_TESTNET = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    uint16 internal constant FEE_BPS = 25; // 0.25% on payouts, refunds are always fee-free
    uint256 internal constant FAUCET_DRIP = 20e18;
    uint256 internal constant FAUCET_COOLDOWN = 12 hours;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address musd = vm.envOr("MUSD_ADDRESS", MUSD_TESTNET);
        uint256 faucetFunding = vm.envOr("FAUCET_FUNDING", uint256(0));
        address finalOwner = vm.envOr("OWNER_ADDRESS", deployer); // receives admin via Ownable2Step
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);

        vm.startBroadcast(pk);
        SavingsCircle implementation = new SavingsCircle();
        CircleFactory factory = new CircleFactory(IERC20(musd), address(implementation), deployer, feeRecipient, FEE_BPS);
        CircleGovernor governor = new CircleGovernor(factory);
        factory.setGovernor(address(governor));
        if (finalOwner != deployer) factory.transferOwnership(finalOwner); // pending until accepted
        CircleLens lens = new CircleLens();
        MusdFaucet faucet = new MusdFaucet(IERC20(musd), deployer, FAUCET_DRIP, FAUCET_COOLDOWN);
        if (faucetFunding != 0) IERC20(musd).transfer(address(faucet), faucetFunding);
        vm.stopBroadcast();

        console2.log("SavingsCircle impl:", address(implementation));
        console2.log("CircleFactory:     ", address(factory));
        console2.log("CircleGovernor:    ", address(governor));
        console2.log("CircleLens:        ", address(lens));
        console2.log("MusdFaucet:        ", address(faucet));

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "deployBlock", block.number);
        vm.serializeAddress(json, "musd", musd);
        vm.serializeAddress(json, "implementation", address(implementation));
        vm.serializeAddress(json, "factory", address(factory));
        vm.serializeAddress(json, "governor", address(governor));
        vm.serializeAddress(json, "lens", address(lens));
        string memory out = vm.serializeAddress(json, "faucet", address(faucet));
        vm.writeJson(out, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
