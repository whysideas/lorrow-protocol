// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;
import {ILorrowPolicy} from "../src/LorrowEscrow.sol";

// TEST ONLY. Anybody can mutate this policy; it is deliberately NOT a loan implementation.
contract MockPolicy is ILorrowPolicy {
    bool public allowed = true;
    bytes32 public stateHash = keccak256("initial loan state");
    uint256 public cap = type(uint256).max;
    function set(bool a, bytes32 h, uint256 c) external { allowed = a; stateHash = h; cap = c; }
    function settlementState(address, uint256 amount) external view returns (bool, bytes32) {
        return (allowed && amount <= cap, stateHash);
    }
}

interface IVault { function claim() external; }
contract ReentrantRecipient {
    IVault public vault;
    bool public attempted;
    function setVault(IVault v) external { vault = v; }
    function claim() external { vault.claim(); }
    receive() external payable { attempted = true; try vault.claim() {} catch {} }
}
contract RejectingRecipient {
    function claim(IVault v) external { v.claim(); }
    receive() external payable { revert("reject"); }
}
contract ForceETH {
    constructor(address payable recipient) payable { selfdestruct(recipient); }
}
