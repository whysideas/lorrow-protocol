// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Production policy MUST enforce debt, repayment, oracle, grace and breach rules.
/// It MUST be immutable, dedicated to this loan, and bind its state hash to these terms.
interface ILorrowPolicy {
    function settlementState(address vault, uint256 lenderAmount)
        external view returns (bool allowed, bytes32 stateHash);
}

/// @notice RESEARCH PROTOTYPE: native-ETH collateral vault; not a complete loan.
/// Witnesses veto/approve allocation, never choose arbitrary payout addresses.
/// A policy or witness outage can lock collateral. There is no bypass or recovery admin.
contract LorrowEscrow is EIP712, ReentrancyGuard {
    address public immutable borrower;
    address public immutable lender;
    ILorrowPolicy public immutable policy;
    bytes32 public immutable termsHash;
    uint256 public immutable collateral;
    uint256 public immutable exitDelay;
    uint256 public immutable approvalThreshold;
    uint256 public immutable vetoThreshold;
    mapping(address => bool) public witness;

    struct Exit {
        uint256 nonce;
        uint256 lenderAmount;
        bytes32 stateHash;
        uint256 readyAt;
        uint256 deadline;
    }
    Exit public pending;
    uint256 public nonce;
    bool public settled;
    mapping(address => uint256) public credit;

    bytes32 private constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(uint256 nonce,uint256 lenderAmount,bytes32 stateHash,uint256 deadline,bytes32 termsHash)"
    );
    bytes32 private constant VETO_TYPEHASH = keccak256("Veto(uint256 nonce)");

    event Queued(uint256 indexed nonce, uint256 lenderAmount, bytes32 stateHash,
        uint256 readyAt, uint256 deadline);
    event Vetoed(uint256 indexed nonce);
    event Cleared(uint256 indexed nonce);
    event Settled(uint256 indexed nonce, uint256 lenderAmount, uint256 borrowerAmount);
    event Claimed(address indexed recipient, uint256 amount);

    constructor(address borrower_, address lender_, ILorrowPolicy policy_,
        bytes32 termsHash_, address[] memory witnesses_, uint256 approvalThreshold_,
        uint256 vetoThreshold_, uint256 exitDelay_)
        payable EIP712("LorrowEscrow", "0.0.1")
    {
        require(borrower_ != address(0) && lender_ != address(0) && borrower_ != lender_, "parties");
        require(borrower_ != address(this) && lender_ != address(this), "self");
        require(address(policy_).code.length > 0 && termsHash_ != bytes32(0), "policy/terms");
        require(msg.value > 0 && exitDelay_ > 0, "collateral/delay");
        require(approvalThreshold_ > 0 && approvalThreshold_ <= witnesses_.length, "quorum");
        require(vetoThreshold_ > 0 && vetoThreshold_ <= approvalThreshold_, "veto quorum");
        borrower = borrower_; lender = lender_; policy = policy_; termsHash = termsHash_;
        collateral = msg.value; exitDelay = exitDelay_;
        approvalThreshold = approvalThreshold_; vetoThreshold = vetoThreshold_;
        address previous;
        for (uint256 i; i < witnesses_.length; ++i) {
            require(witnesses_[i] > previous, "sorted unique witnesses");
            previous = witnesses_[i]; witness[previous] = true;
        }
    }

    /// @dev EIP-712 binds approval to chain, this vault, terms, amount, state and nonce.
    function settlementDigest(uint256 nonce_, uint256 lenderAmount_, bytes32 stateHash_,
        uint256 deadline_) public view returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(SETTLEMENT_TYPEHASH, nonce_,
            lenderAmount_, stateHash_, deadline_, termsHash)));
    }

    function vetoDigest(uint256 nonce_) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VETO_TYPEHASH, nonce_)));
    }

    function queueSettlement(uint256 lenderAmount_, uint256 deadline_,
        bytes[] calldata signatures) external
    {
        require(!settled && pending.readyAt == 0, "closed/pending");
        require(lenderAmount_ <= collateral, "amount");
        uint256 readyAt = block.timestamp + exitDelay;
        require(deadline_ > readyAt, "deadline");
        (bool allowed, bytes32 stateHash) = policy.settlementState(address(this), lenderAmount_);
        require(allowed, "policy");
        uint256 nextNonce = nonce + 1;
        _quorum(settlementDigest(nextNonce, lenderAmount_, stateHash, deadline_),
            signatures, approvalThreshold);
        nonce = nextNonce;
        pending = Exit(nextNonce, lenderAmount_, stateHash, readyAt, deadline_);
        emit Queued(nextNonce, lenderAmount_, stateHash, readyAt, deadline_);
    }

    /// @notice Lower quorum cancels this proposal; it cannot redirect or allocate assets.
    /// Requeue requires new approval signatures on the next nonce and a fresh delay.
    function veto(bytes[] calldata signatures) external {
        require(pending.readyAt != 0, "no pending");
        uint256 id = pending.nonce;
        _quorum(vetoDigest(id), signatures, vetoThreshold);
        delete pending;
        emit Vetoed(id);
    }

    /// @notice Anyone can clear an expired proposal or one invalidated by policy state.
    function clearInvalid() external {
        Exit memory e = pending;
        require(e.readyAt != 0, "no pending");
        (bool allowed, bytes32 stateHash) = policy.settlementState(address(this), e.lenderAmount);
        require(block.timestamp > e.deadline || !allowed || stateHash != e.stateHash, "still valid");
        delete pending;
        emit Cleared(e.nonce);
    }

    /// @notice Allocates the original deposit once; a separate claim sends the ETH.
    function executeSettlement() external {
        Exit memory e = pending;
        require(!settled && e.readyAt != 0, "closed/no pending");
        require(block.timestamp >= e.readyAt && block.timestamp <= e.deadline, "time");
        (bool allowed, bytes32 stateHash) = policy.settlementState(address(this), e.lenderAmount);
        require(allowed && stateHash == e.stateHash, "policy changed");
        settled = true;
        delete pending;
        credit[lender] = e.lenderAmount;
        credit[borrower] = collateral - e.lenderAmount;
        emit Settled(e.nonce, e.lenderAmount, collateral - e.lenderAmount);
    }

    /// @notice A recipient can claim only its own credit, only to its fixed address.
    function claim() external nonReentrant {
        uint256 amount = credit[msg.sender];
        require(amount > 0, "no credit");
        credit[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "send failed");
        emit Claimed(msg.sender, amount);
    }

    function _quorum(bytes32 digest, bytes[] calldata signatures, uint256 threshold) private view {
        require(signatures.length >= threshold, "insufficient signatures");
        address previous;
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(digest, signatures[i]);
            require(signer > previous && witness[signer], "unknown/duplicate/unsorted signer");
            previous = signer;
        }
    }
}
