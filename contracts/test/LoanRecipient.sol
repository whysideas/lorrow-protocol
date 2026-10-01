// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;
interface IPayment { function claimPayment() external; }
// TEST ONLY: a recipient that rejects ETH or tries a nested payment claim.
contract LoanRecipient {
    IPayment public loan;
    bool public reject;
    bool public reenter;
    bool public attempted;
    function configure(IPayment l, bool r, bool e) external { loan = l; reject = r; reenter = e; }
    function fund(address target) external payable {
        (bool ok,) = target.call{value:msg.value}(abi.encodeWithSignature("fund()"));
        require(ok, "fund failed");
    }
    function claim() external { loan.claimPayment(); }
    receive() external payable {
        require(!reject, "reject");
        if (reenter) { attempted = true; try loan.claimPayment() {} catch {} }
    }
}
