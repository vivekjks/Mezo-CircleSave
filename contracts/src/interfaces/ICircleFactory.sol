// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Surface of the factory that savings circles call back into.
interface ICircleFactory {
    function paused() external view returns (bool);
    function feeRecipient() external view returns (address);
    function governor() external view returns (address);
    /// @notice When payments last resumed after a pause (0 if never paused).
    function unpausedAt() external view returns (uint64);

    /// @notice Moves `amount` MUSD from `from` into the calling circle (members approve the factory once).
    function pullFunds(address from, uint256 amount) external;

    function onMemberJoined(address member) external;
    function onMemberLeft(address member) external;
    /// @param kind 0 = on-time contribution, 1 = late contribution / debt repayment, 2 = voluntary top-up
    function onContribution(address member, uint256 amount, uint8 kind) external;
    function onMissed(address member) external;
    function onPayout(address member, uint256 amount) external;
    function onCircleCompleted(address[] calldata finishers) external;
}
