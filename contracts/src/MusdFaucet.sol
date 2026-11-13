// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MusdFaucet
/// @notice Testnet helper that drips a small amount of real testnet MUSD so people can try
///         CircleSave without opening a trove first. Not deployed on mainnet.
contract MusdFaucet is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public dripAmount;
    uint256 public cooldown;
    mapping(address => uint256) public lastClaimAt;

    event Dripped(address indexed to, uint256 amount);
    event ConfigUpdated(uint256 dripAmount, uint256 cooldown);

    error CoolingDown(uint256 availableAt);
    error FaucetEmpty();

    constructor(IERC20 token_, address owner_, uint256 dripAmount_, uint256 cooldown_) Ownable(owner_) {
        token = token_;
        dripAmount = dripAmount_;
        cooldown = cooldown_;
    }

    function claim() external nonReentrant {
        uint256 next = nextClaimAt(msg.sender);
        if (block.timestamp < next) revert CoolingDown(next);
        uint256 amount = dripAmount;
        if (token.balanceOf(address(this)) < amount) revert FaucetEmpty();
        lastClaimAt[msg.sender] = block.timestamp;
        token.safeTransfer(msg.sender, amount);
        emit Dripped(msg.sender, amount);
    }

    function nextClaimAt(address account) public view returns (uint256) {
        uint256 last = lastClaimAt[account];
        return last == 0 ? 0 : last + cooldown;
    }

    function available() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function setConfig(uint256 dripAmount_, uint256 cooldown_) external onlyOwner {
        dripAmount = dripAmount_;
        cooldown = cooldown_;
        emit ConfigUpdated(dripAmount_, cooldown_);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
