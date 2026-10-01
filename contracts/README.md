# Lorrow Escrow research prototype v0.0.1

**Local research only. Not audited. Not Lorrow-compatible. No production loan policy exists in this package. Do not fund with real assets.**

Lorrow originated by WHYSIDEAS. This prototype is new work; the upstream standard/repository has not been edited. Code license: Apache-2.0. OpenZeppelin dependencies retain their upstream MIT license.

## What is implemented

A directly deployed, per-loan, non-upgradeable native ETH collateral vault. Immutable borrower, lender, terms commitment, policy address, committee and thresholds. EIP-712 approval signatures; sorted, distinct authorized ECDSA witnesses; delayed settlement; lower-threshold proposal veto; policy revalidation; nonce replay protection; one-time allocation; separate recipient claims; reentrancy protection.

The vault has five state-changing functions: `queueSettlement`, `veto`, `clearInvalid`, `executeSettlement`, `claim`. Claims send only to the fixed borrower/lender addresses. Witnesses cannot specify another recipient. Approval authorizes allocation; once allocated, credits cannot be vetoed or revoked.

All collateral belongs to one loan. Deploy directly first; no factory, proxy, clone initializer, router, token handling or upgrade hooks. There is no global pause or automatic committee rotation. Per-loan isolation does not prevent a common code bug from being exploited across all instances.

## What is deliberately NOT implemented

Origination, lender funding, repayments, interest, default valuation, partial cure, breach clocks, maturity grace, oracle access, order matching, frontend, actual witness service, committee discovery, bonds or slashing. `MockPolicy` permits test allocations and is mutable by ANY caller. It is intentionally insecure and **must never be deployed as a lending policy**.

The escrow does not enforce a debt cap independently: it enforces `0 <= lenderAmount <= collateral`; the immutable loan policy must enforce the economically correct debt cap. Witnesses independently verify that cap. Two correct implementations improve assurance; they do not prove safety.

## Run

Use Node.js 22 LTS for the reference development environment (the local test run also completed on Node 24). Install pinned dependencies and run the local EVM tests:

```bash
npm ci
npm test
```

Compiler: solc 0.8.30, Shanghai EVM target, optimizer 200 runs. Dependencies are pinned research choices, not assertions that these are the latest versions. Ganache is a local test convenience; production development should adopt Foundry. No live-chain RPC or wallet key is needed. Test keys are deterministic, public development keys.

`test-results.json` records the executed smoke checks. `npm test` regenerates it and `artifacts/compiled.json`. The artifact directory and node_modules are not included in the deliverable.

## Settlement flow

1. Deploy with native ETH collateral and agreed immutable parties, policy, terms hash and sorted committee. A future factory must atomically link legitimate loan funding and collateral locking. Deployment alone creates no loan.
2. Witnesses read canonical chain state and the independent specification. They sign the next nonce, exact lender allocation, policy state hash, deadline and terms hash under the chain/vault EIP-712 domain.
3. Anyone relays the approval quorum. Policy must allow that allocation; a fresh delay starts on-chain.
4. A smaller quorum can veto that proposal. It invalidates the nonce. Requeue needs a fresh approval quorum and delay.
5. Once the delay passes, anyone can allocate, before the signed deadline, if policy permission and state hash still match.
6. Borrower and lender claim their own fixed credits. A reverting recipient blocks only its own claim.

## Security boundary and production requirements

- Witnesses protect only code paths that actually enforce the gate. A vault/signature/accounting exploit can bypass it. This is not exploit-proof escrow.
- Correct policy plus malicious quorum cannot authorize a payout disallowed by that policy. A policy bug plus a malicious quorum can permit an economically wrong payout to the lender. These are trust dependencies, not a guarantee that witness compromise causes only denial of service.
- The production policy must be immutable/non-proxy and bind this vault, all agreed terms, loan status, outstanding debt, price units, oracle observations, applicable clocks and exact allocations to its commitment. Every relevant change must change the state hash. Hashing a mutable pointer or only the latest event is insufficient.
- A production policy must prevent repayments/funding after final allocation. It must synchronize its terminal loan state with the vault's `settled()` status; pending exits must be invalidated by any successful repayment or cure. This is NOT tested by the mock.
- Oracle update churn can invalidate a proposed default repeatedly. Phase 1 must choose a valid, bounded-age settlement snapshot and decide how recovery during the delay affects it. Do not silently use an obsolete price.
- The committee is fixed for the loan. An offline or hostile committee or reverting policy can freeze collateral indefinitely. There is no timeout bypass, emergency rescue or recovery key. These would change the security model and require separate review.
- Lower quorum vetoes can be repeated against new proposals: real denial-of-service power. They are not temporary global pauses. No timer makes a missing approval quorum appear.
- No state-changing policy callback, arbitrary external execution, delegatecall or rescue/sweep exists. The policy is consulted with a read-only external call. Claim performs one ETH send to a fixed beneficiary. ETH itself can be forcibly donated; donations are excluded from collateral accounting and remain stranded.
- ECDSA/secp256k1 witness keys only. Apple App Attest/P-256 signatures do not plug into this prototype. No real phone or TEE assurance is implemented.
- No reward paid from borrower collateral; fee economics is a separate future design.
- The delay/veto policy conflicts with immediate-release/cancellation wording in the current standard. Publish an approved standard extension or revision before claiming compatibility.

See the accompanying roadmap for the ten invariants, staffing, tools, milestones and launch gates.
