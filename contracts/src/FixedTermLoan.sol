// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {LorrowEscrow, ILorrowPolicy} from "./LorrowEscrow.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Research loan: native ETH principal and collateral, fixed total interest.
/// No oracle, partial payments, late cure, fees, upgrades or privileged override.
contract FixedTermLoan is ILorrowPolicy, ReentrancyGuard {
    address public immutable borrower;
    address public immutable lender;
    uint256 public immutable principal;
    uint256 public immutable debt;
    uint256 public immutable duration;
    uint256 public immutable grace;
    uint256 public immutable fundingDeadline;
    uint256 public immutable exitDelay;
    uint256 public immutable approvalThreshold;
    uint256 public immutable vetoThreshold;
    bytes32 public immutable termsHash;
    address[] private witnesses;
    LorrowEscrow public vault;
    uint256 public fundedAt;
    uint256 public dueAt;
    bool public funded;
    bool public repaid;
    mapping(address => uint256) public paymentCredit;

    event VaultOpened(address indexed vault, uint256 collateral);
    event Funded(uint256 principal, uint256 dueAt);
    event Repaid(uint256 debt);
    event PaymentClaimed(address indexed recipient, uint256 amount);

    struct Terms {
        address lender;
        uint256 principal;
        uint256 interest;
        uint256 duration;
        uint256 grace;
        uint256 fundingDeadline;
        uint256 exitDelay;
        uint256 approvalThreshold;
        uint256 vetoThreshold;
    }

    constructor(Terms memory t, address[] memory witnesses_) {
        require(t.lender != address(0) && t.lender != msg.sender, "parties");
        require(t.principal > 0 && t.duration > 0 && t.grace > 0, "loan terms");
        require(t.fundingDeadline > block.timestamp && t.exitDelay > 0, "time terms");
        require(t.approvalThreshold > 0 && t.approvalThreshold <= witnesses_.length, "quorum");
        require(t.vetoThreshold > 0 && t.vetoThreshold <= t.approvalThreshold, "veto quorum");
        address previous;
        for (uint256 i; i < witnesses_.length; ++i) {
            require(witnesses_[i] > previous, "sorted unique witnesses");
            previous = witnesses_[i];
        }
        borrower = msg.sender; lender = t.lender;
        principal = t.principal; debt = t.principal + t.interest;
        duration = t.duration; grace = t.grace; fundingDeadline = t.fundingDeadline;
        // Fail deployment if even the latest permitted funding would overflow time math.
        require(t.fundingDeadline + t.duration + t.grace < type(uint256).max - t.exitDelay, "time range");
        exitDelay = t.exitDelay; approvalThreshold = t.approvalThreshold;
        vetoThreshold = t.vetoThreshold; witnesses = witnesses_;
        termsHash = keccak256(abi.encode("LorrowFixedTermLoan/0.1", block.chainid,
            address(this), msg.sender, t, witnesses_));
    }

    /// @dev Separate step: policy code must exist before the escrow validates it.
    /// Collateral is bound by the resulting vault and cannot be topped up or changed.
    function openVault() external payable {
        require(msg.sender == borrower && address(vault) == address(0), "borrower/once");
        require(block.timestamp <= fundingDeadline && msg.value >= debt, "time/collateral");
        vault = new LorrowEscrow{value: msg.value}(borrower, lender, this, termsHash,
            witnesses, approvalThreshold, vetoThreshold, exitDelay);
        emit VaultOpened(address(vault), msg.value);
    }

    /// @notice The named lender consents by funding the exact principal.
    /// Funds become a borrower credit without calling the recipient during funding.
    function fund() external payable {
        require(msg.sender == lender && address(vault) != address(0), "lender/vault");
        require(!funded && !vault.settled() && block.timestamp <= fundingDeadline, "funding closed");
        require(msg.value == principal, "principal");
        funded = true; fundedAt = block.timestamp; dueAt = block.timestamp + duration;
        paymentCredit[borrower] = principal;
        emit Funded(principal, dueAt);
    }

    /// @notice Full repayment is accepted through the last second of grace.
    /// Default eligibility starts strictly AFTER that point; late payments revert.
    function repay() external payable {
        require(msg.sender == borrower && funded && !repaid && !vault.settled(), "borrower/active");
        require(block.timestamp <= dueAt + grace && msg.value == debt, "time/debt");
        repaid = true; paymentCredit[lender] = debt;
        emit Repaid(debt);
    }

    function claimPayment() external nonReentrant {
        uint256 amount = paymentCredit[msg.sender];
        require(amount > 0, "no credit");
        paymentCredit[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "send failed");
        emit PaymentClaimed(msg.sender, amount);
    }

    function settlementState(address vault_, uint256 lenderAmount)
        external view returns (bool allowed, bytes32 stateHash)
    {
        if (address(vault) == address(0) || vault_ != address(vault)) return (false, bytes32(0));
        uint256 mode;
        if (!funded && block.timestamp > fundingDeadline) mode = 1; // never funded
        else if (repaid) mode = 2;
        else if (funded && block.timestamp > dueAt + grace) mode = 3;
        uint256 expected = mode == 3 ? debt : 0;
        allowed = mode != 0 && lenderAmount == expected;
        // Excludes withdrawal credits and current timestamp: claims and elapsed time
        // must not invalidate an otherwise identical settlement authorization.
        stateHash = keccak256(abi.encode(termsHash, vault_, vault.collateral(),
            fundedAt, dueAt, funded, repaid, mode, expected));
    }
}
