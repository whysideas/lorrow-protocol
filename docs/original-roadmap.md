# Making Lorrow real: roadmap and minimal escrow security design

Prepared for WHYSIDEAS • September 29, 2026 • Planning draft and tested research prototype

## The project we are building

An open standard and reference implementation for bilateral crypto lending. Specific lenders lend to specific borrowers under immutable terms; collateral is held in a separate vault for each loan. Anyone can host a frontend, inspect loans, relay signed offers or run a keeper. Independent witnesses approve collateral settlement against a separately implemented state machine.

No fiat rails. No new blockchain. No protocol token required. Native BTC, confidential-computing hardware and iPhone participation are later research tracks, not prerequisites for a useful first release.

The first production candidate should use one EVM settlement chain, native ETH collateral and one explicitly approved ERC-20 loan asset, such as USDC where supported. Stablecoin issuer controls/depegging remain asset risks. A chain selection review must weigh fees, finality, censorship, L2 sequencer/upgradability dependencies, oracle availability and operational escape routes; low fees alone are insufficient. Do not assume USDC is always exactly one dollar when valuing debt.

The current Lorrow framework is the authoritative starting point: all loan variables, six lifecycle states, partial repayments, breach cure and recovery, mandatory surplus return, interest/penalty ceilings and maturity grace. The reference implementation must publish its Profile and demonstrate compatibility. Smaller supporting contracts are welcome; omitting Core rules is not a compatible implementation.

Sources reviewed: [Lorrow specification](https://whysideas.github.io/lorrow/) and [repository](https://github.com/whysideas/lorrow). The public pages were fetched directly for this work. No upstream files were changed.

## Security premise: what witnesses can and cannot do

Witnesses provide a second authorization requirement. They do not stand outside the blockchain and intercept arbitrary EVM transfers. Every protected collateral allocation must pass the gate coded into the vault. If a vault bug bypasses that gate, witnesses may be bypassed too. Monitoring a completed transaction cannot reverse it.

A correct policy rejects invalid economic outcomes even if witnesses collude. Honest witnesses reject an invalid settlement admitted by a policy bug. Neither protects against every possible vault, signature-verifier, shared-library, chain, token or oracle failure. Different languages reduce some shared implementation risks; they do not fix a shared flawed specification.

Per-loan vaults isolate accounting and balances. A common implementation bug could still be exploited against every vault. Asset limits, independent review, invariant testing, operational rehearsals and staged exposure remain essential.

There is an unavoidable tradeoff: mandatory witness approval improves resistance to some theft paths but allows witnesses to freeze settlement. An automatic timeout bypass restores availability by removing that protection. Do not promise both unconditional recovery and perpetual witness veto without a precisely defined alternative trust model.

## Reference architecture

| Component | Responsibility | Explicit boundary |
|---|---|---|
| Immutable collateral vault, one per loan | Deposit accounting, exact authorized allocation, delay, veto, fixed recipient claims | Small asset-moving code; no oracle math, interest engine, swaps or upgrades |
| Immutable loan policy/accounting | Origination, real token transfers, interest, repayments, breach/cure clocks, oracle validation, debt-capped default | Larger code, audited separately; cannot choose arbitrary recipients |
| Independent witness client | Reconstruct state, enforce specification, verify exact proposal, sign or veto | No custody or changes to terms; off-chain checks must not merely call the same policy's approval function |
| Factory and signed-order settlement | Deploy verified vault/policy pair, bind terms and atomically activate funding | Existing loans cannot be upgraded; new version means new factory/deployment addresses |
| SDK and open frontend | Discover terms and loans, inspect risk, build transactions | Configurable RPC/relay/indexer; no mandatory proprietary API key or company service |
| Relays/indexers/keepers | Discover signed offers, replay chain history, trigger executable actions | Claims independently verifiable; anyone may operate them |

A factory is necessary later, but direct deployment avoids clone initialization and factory complexity in the first vault prototype. Standard clones can be evaluated only after their initialization and implementation dependencies receive review.

## Roadmap with objective completion gates

Timelines below are estimates for a funded team of approximately three core contributors plus specialists, not elapsed-time guarantees. Several tracks overlap; do not add every row sequentially.

| Stage | Estimated window | Deliverables | Gate before proceeding |
|---|---|---|---|
| 0. Specification and threat model | Weeks 1–3 | Complete loan flow, supported asset/chain profile, trust assumptions, ten invariants, standards compatibility matrix, witness outage and dispute policy | Every way funds enter/leave mapped; debt/price/time units fixed; unresolved money rules written down |
| 1. Vault research prototype | Weeks 2–6 | Direct-deployment vault, typed signatures, delay/veto, hostile-recipient and replay tests; real policy interface design | Every entrypoint reviewed; executable positive and negative paths; replay/conservation tests; no real funds |
| 2. Complete on-chain reference loan | Weeks 5–12 | Atomic principal disbursement, fixed APR calculation, partial repayment/cure, breach and recovery, maturity grace, debt-capped default, factory, events and Profile | Real token and oracle integration tests; all Core guardrails enforced; economic invariants tested beyond mocks |
| 3. Independent witnesses | Weeks 9–18 | Rust client, deterministic replay, proposal validation, signed approvals/vetoes, operator handbook; 5–7 separately controlled trial operators | Injected policy mistakes rejected; RPC disagreement/reorgs/offline nodes rehearsed; no company-only coordinator |
| 4. Public testnet product | Weeks 12–22 | Open TypeScript SDK, mobile-friendly reference UI, signed order relay, indexer and keeper packages, self-host docs | A third party runs UI and node from clean machines; loans complete while company infrastructure is offline |
| 5. External assurance and rehearsal | Weeks 18–28 | Independent audits, targeted formal methods, adversarial tests, bug bounty, incident drills, reproducible release build | No unresolved critical/high findings; fixes reviewed; witness failures and borrower/lender exits rehearsed |
| 6. Limited real-value launch | Approximately months 6–9 | Reviewed release, selected operators, conservative per-loan/aggregate exposure limits, public deployment/Profile docs, close monitoring | Start with voluntarily limited exposure; expand only after complete loan cycles and independent operational review |
| 7. Broader participation | After stable launch | Permissionless committee discovery/selection, credible bonds/slashing, optional phone client and heterogeneous TEE signers | Operator independence and economic security measured; committee rotation never silently changes active-loan terms |
| 8. Native BTC research | Separate later project | Compare DLCs, threshold custody and other cross-chain constructions; cross-chain finality, failure recovery and key lifecycle | Dedicated cryptography and Bitcoin review; prove custody assumptions before marketing native, noncustodial BTC collateral |

If the requirement is a permissionless witness market at first launch, increase scope and schedule. A static initial committee can be decentralized across operators but is not permissionless consensus. Publishing the frontend does not make the witness admission process permissionless.

## The first product's scope

Keep both lender offers and borrower requests. Initially support one loan asset, one collateral asset, a subset of the standard term choices and LUMP repayments. Preserve partial repayment and cure, accrued-interest semantics and Core protections. Do not replace accrued interest with a full-term charge simply to shorten the code.

No pools, leverage loops, cross-chain messaging, arbitrary token support, swaps inside the vault, governance that mutates active loans, or native BTC initially. Principal and repayments can move directly between the parties in carefully validated token operations, while collateral remains isolated. Treat real token balance changes as evidence of payment; `SafeERC20` alone does not validate every token's economic behavior.

Start the order book with signed orders, replay protection, expirations and on-chain cancellations. A signed order is a promise, not funded liquidity: recheck allowance, balance, collateral, nonce and expiry at acceptance. Add multiple independently run relays before inventing a novel P2P transport. Off-chain indexing can be replaced by replaying on-chain events and state, but chain access is still required.

## Tools and services

These are candidate tools, not contracts or subscriptions purchased. Pin reviewed versions and recheck security/support status when implementation begins.

| Need | Initial tool/service | Why and how to avoid a sole dependency |
|---|---|---|
| Code and reviews | GitHub, protected PR workflow, GitHub Actions, VS Code | Public source, locked dependencies, reproducible builds; no unattended AI merge/deploy authority |
| Solidity development | Foundry: Forge, Anvil, Cast; solc | Local tests, fuzzing, fork tests, transaction/deployment tooling; runnable on developers' machines |
| Small reusable security primitives | Reviewed OpenZeppelin EIP-712/ECDSA, ReentrancyGuard, SafeERC20 for loan policy | Use reviewed primitives rather than handwritten signature or token logic; dependency code remains audit scope |
| Static analysis and property fuzzing | Slither; Echidna or Medusa; Foundry stateful invariant handlers | Complementary checks; track reached states and useful transitions, not just total randomized calls |
| Targeted verification | Certora, Halmos or another selected prover; specialist-guided | Prove selected arithmetic/access/state properties under explicit assumptions; a proof is not a blanket safety certificate |
| Independent state model | Rust, property tests, shared published test vectors | Separate implementation of the specification; independently replay state and evaluate exact proposed outcomes |
| SDK and UI | TypeScript, viem, React/Vite, wallet connector as needed | Client-side signing, configurable providers and transaction previews; a PWA suffices initially |
| Chain connectivity | Two independent RPC services, e.g. Alchemy/QuickNode, plus a self-hosted execution client for serious witnesses | Provider redundancy is not proof of finality; define safe/finalized state and reorg handling explicitly |
| Price observations | Chainlink or Pyth evaluated for selected asset pair/chain | Specify feed identifiers, decimals, stale-data bounds, quote-asset valuation, deviation checks and applicable L2 sequencer handling |
| Open deployment/distribution | Reproducible static build, GitHub releases; ordinary hosting and IPFS mirrors | Anyone hosts the same interface; RPC and relay addresses are user-configurable |
| Node packaging | Docker and native Rust executable, SQLite initially | A laptop/home server can run the service; migrations and deterministic replay documented |
| Observability | Prometheus/Grafana plus optional hosted alerting or Tenderly | Multiple operators monitor independently; hosted simulation/alerts must not be required for settlement |
| Signing operations | Supported encrypted keystore or tested hardware/HSM/KMS interface | Test exact secp256k1/EVM signature compatibility; AWS/Apple attestations do not automatically produce valid witness signatures |
| Security review | Two independent audit scopes, bounty platform such as Immunefi when ready | Auditors review vault + policy + factory + witness protocol together; retain funds for fixes and retests |
| Later TEEs | Evaluate AWS Nitro, AMD SEV-SNP, Intel TDX | Optional measured-code evidence; additional keys, attestation roots, rollback/upgrade and operator risks |
| Later phones | Swift client and Apple App Attest investigation | User approval, monitoring or opportunistic witnessing; background availability and P-256/ECDSA integration require dedicated design |

Official references: [Foundry invariant testing](https://getfoundry.sh/forge/invariant-testing), [OpenZeppelin cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography), [OpenZeppelin ERC-20 helpers](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20), [Trail of Bits tools](https://trailofbits.com/tools/), [Chainlink feeds](https://docs.chain.link/data-feeds/overview), [Apple App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity).

Do not buy a Mac Studio or other expensive local AI hardware for protocol infrastructure yet. Ordinary developer laptops and independently hosted modest servers suffice for the initial contracts/witness work. New signing hardware should follow the key/attestation specification.

## People to recruit

You can serve as product owner and standard steward: defining the bilateral lending experience, acceptable trust assumptions, borrower protections, initial operator relationships and commercial priorities. The first paid hire should be a security-minded protocol lead, not a general frontend developer.

| Role | Engagement | Evidence to ask for |
|---|---|---|
| Senior Solidity/protocol security lead | First hire; full-time or committed lead contractor | Shipped audited lending/escrow contracts, clear reasoning about invariants, hostile token/oracle behavior, reproducible tests and prior exploit analysis |
| Distributed-systems/Rust engineer | Core contributor from state model onward | Deterministic replay, signatures, P2P/RPC operations, finality/reorg handling and reliable node daemons |
| TypeScript/wallet engineer | Core or contract contributor from SDK stage | Open-source wallet transaction flows, signature domain handling, frontend self-hosting and independent data verification |
| Security/formal-methods specialist | Fractional early; focused verification engagement later | Counterexamples, arithmetic models, stateful test handlers and documented proof assumptions |
| Independent auditors | External at design review and pre-launch | Review scope includes cross-component trust and economic invariants, not just style or a line-count audit |
| DevOps/node operations engineer | Fractional initially; expand with operators | Key management, backups/replay, alerting, reproducible signed releases, outage and incident drills |
| Protocol economist/game-theory reviewer | Targeted engagement before bonds/slashing or permissionless committee market | Bribery, collusion, aggregate exposure per quorum, objective slashability and griefing/liveness analysis |
| Crypto/lending legal counsel | Targeted engagement before public launch | Review actual roles, terms, frontend operation, operator rewards and relevant jurisdictions; no claim that eliminating fiat settles legal questions |
| Bitcoin/threshold-cryptography specialist | Later native BTC project only | Real implementations, distributed key generation, rotation/recovery and cross-chain failure analysis |
| iOS/TEE security engineer | Later only | App Attest/secure-key constraints, measured-code attestation, hardware signature formats and platform availability |

A lean credible core is three engineers plus fractional security/operations support. A fourth test/security engineer makes the timeline more realistic. Operator headcount must reflect independent control: seven nodes on one company's accounts are one administrative failure domain.

AI tools can help write test candidates, documentation and client scaffolding. They do not replace an experienced money-code reviewer, an independent audit or a cryptographer.

## Budget and runway estimates

These are my planning allowances, not current vendor quotes or salary-market survey figures. USD; approximately 6–9 months to a reviewed narrow launch. Quotes and team location can materially change them.

| Category | Planning range |
|---|---:|
| Engineering, including fractional operations and test work | $200,000–$450,000 |
| Independent audits, fixes review and retests | $40,000–$100,000 |
| Targeted formal verification/security specialist work | $20,000–$60,000 |
| Legal and launch structuring review | $10,000–$30,000 |
| Test infrastructure, RPC, tools and security-program setup | $10,000–$30,000 |
| Subtotal | $280,000–$670,000 |
| 25% contingency | $70,000–$167,500 |
| Total planning runway | **$350,000–$837,500** |

The first 4–6 week specification/prototype sprint can be a $20,000–$50,000 engagement, contained within the engineering estimate above. Use it to judge feasibility and the lead's quality before committing the larger runway. A local demonstrator can cost less; that is not the same deliverable as safely handling strangers' collateral.

Post-launch operating allowance: roughly $1,000–$5,000/month across basic shared infrastructure and initial monitoring, before staff, gas, rewards, bounty payouts, insurance or formal-verification licensing. This is an allowance to validate with quotes. Independent operators bear their own node expenses. No token sale or loan volume is assumed to fund development.

Not included: lending liquidity, borrower collateral, meaningful bounty reward reserves, witness bonds, a complex permissionless signer market, iOS/TEE development, native BTC or cross-chain security. These are separate capital/scope decisions.

## Ten security invariants

Definitions: C is the original native-ETH deposit for this loan. x is the lender's collateral allocation. uB and uL are unclaimed borrower/lender credits. wB and wL are cumulative successful claims. R is original collateral still unallocated (C before final allocation, zero after). B is actual ETH balance; F is unsolicited forced ETH, which is excluded from loan accounting. q is approval threshold; v is veto threshold. n is the proposal nonce. H(S) is a complete commitment to economic state. D is outstanding debt expressed in loan-asset atomic units. p is the strictly positive valuation of one collateral atomic unit in the same debt units, under the specified price snapshot and rational scaling.

| # | Mathematical statement | Meaning and enforcement |
|---|---|---|
| 1 | R + uB + uL + wB + wL = C; B >= R + uB + uL | Original collateral is conserved and obligations remain funded. Force donations must not enlarge credits. Vault property; test with ghost accounting. |
| 2 | Every successful collateral outflow recipient is in {borrower, lender} | No arbitrary recipient or keeper reward path. Vault fixes addresses and pays only that recipient's credit. |
| 3 | 0 <= x <= C; allocationCount <= 1; wB + wL <= C | No over-allocation, double settlement or repeated claim. Vault property. |
| 4 | immutableTerms(t) = immutableTerms(0) for all t | Parties, collateral, policy, committee, thresholds, delay and terms commitment cannot change. Policy must independently keep all loan variables immutable. |
| 5 | Allocation => PolicyAllowed(x,S) AND H(Sexecute)=H(Ssigned) AND distinctAuthorizedSigners >= q | Both domains must allow the exact settlement. The vault rechecks policy and signed state. A correct H and economic policy are separate obligations. |
| 6 | signatureValid => domain=(chainId,vault,version) AND message=(n,x,H(S),deadline,termsHash); n increases on every queued proposal | No cross-chain, cross-loan, wrong-amount, old-state or vetoed-proposal replay. Vault and EIP-712 binding. |
| 7 | Allocation => queueTime + delay <= executionTime <= deadline AND proposal not vetoed | No early, expired or vetoed allocation. Valid v-signature veto clears only the pending proposal and moves zero collateral. |
| 8 | SuccessfulClaim(a,z) => priorCredit(a)=z AND postCredit(a)=0; FailedClaim => state unchanged | Debit before external transfer; failure rolls back. Reentrancy cannot duplicate payout; one rejecting party does not block the other. |
| 9 | CompletedRepayment => x=0; Default => x=min(C,floor(D/p)); uB_initial=C-x | Full repayment returns all collateral; default lender receives no more than debt at the declared price/rounding, borrower gets all surplus. **Not enforced economically by mock; required production policy + witness invariant.** |
| 10 | DefaultEligible => (unpaid AND now>=maturity+grace AND grace>=3 days) OR validContinuousBreachWindow; recovery => breachClock=0 | Prevent premature or flash defaults; cure/partial repayment updates debt and invalidates stale exit authorization. **Required production policy + witness invariant, not implemented by vault.** |

For #9, production arithmetic must use explicitly normalized rational price units and full-precision integer multiplication/division. Rounding down means lender recovery is at most one collateral atomic unit below the ideal conversion; never round a surplus away from the borrower. p must value the actual loan asset, not presume a dollar peg. D includes principal and permitted accrued interest, not invented default fees.

Invariants describe allowed outcomes; no test suite alone proves them for all execution sequences. They assume the underlying chain executes the verified bytecode as specified. Liveness is separate: settlement requires eventual policy availability and a willing approval quorum.

## What the included contract actually gives us

`LorrowEscrow.sol` is a 156-line vault source, excluding reviewed dependency code. It compiled to 6,085 bytes of runtime bytecode in the local test configuration. It is deliberately small, not a claim of mathematically minimal size or complete audit coverage.

Five state-changing methods:

- `queueSettlement(lenderAmount, deadline, signatures)`: asks the policy, verifies the approval quorum and starts a delay.
- `veto(signatures)`: a lower quorum cancels that exact pending proposal without moving money.
- `clearInvalid()`: anybody removes an expired proposal or one invalidated by policy state.
- `executeSettlement()`: rechecks delay, deadline and policy; allocates once to the two fixed recipients.
- `claim()`: recipient receives only its own pre-authorized credit.

The deposit happens at deployment. The policy is an external read-only query. The prototype uses native ETH only and ECDSA/secp256k1 witness keys; no USDC funding, Apple P-256, TEE or real policy client is implemented.

A local mock demonstrates only the interface. Anyone can mutate it. It is not debt accounting and must never secure a loan. The vault package is a security experiment, not a Lorrow-compatible lending deployment.

For production, the policy must be immutable/non-proxy, bound to this exact loan, and tested alongside the vault. It must refuse repayments after final vault allocation and invalidate pending exits on valid repayments/cures. The policy state commitment must include all relevant debt/time/oracle observations. An unrestricted or upgradeable policy would defeat the immutability objective even though the vault's pointer is fixed.

## Results actually verified

Solidity 0.8.30; OpenZeppelin 5.4.0; local Ganache Shanghai EVM; ethers 6.15.0. Deliberately pinned research dependencies, not latest-version assertions.

30 reported smoke checks passed, including 24 deterministic seeded sampled settlement sequences. Checks cover missing/duplicate/unknown/unsorted signatures; altered amounts; cross-chain and cross-vault replay; collateral over-allocation; delay/expiry; veto and stale nonce; changed policy state; policy denial even with a quorum; exactly-once credits/claims; reentrant and rejecting recipients; forced ETH donations and conservation.

This is not a million-loan simulation, stateful fuzz campaign, formal proof, third-party audit, mainnet fork test or real loan lifecycle test. Borrower/lender consent, genuine token movements, debt caps and default fairness still need the production policy and integrated adversarial suite.

## Decisions to resolve in the first engineering sprint

1. Safety versus availability: retain hard witness gating, or define an independently reviewed recovery mechanism? Who can freeze a loan, for how long, and who can recover unavailable keys? The prototype has no bypass.
2. Standard semantics: the current standard describes immediate repayment/cancellation releases. Delayed witness exits and extra security parameters require an explicit approved extension/revision; do not silently claim existing compatibility. The current no-extra-loan-fields rule needs careful treatment of a separate security profile.
3. Oracle timing: sampled feed data cannot prove continuous market history by itself. Define discrete observation semantics, missing-data treatment, valid settlement snapshots and recovery during the exit delay. This is a specification problem, not only code.
4. Race rules: repayment during pending default, cure before final allocation, interest cutoff, deadline inclusion, decimal rounding and finality must have exact deterministic outcomes.
5. Witness economics: who chooses a committee, whether fees are prepaid, aggregate collateral exposure per committee, availability incentives and objectively provable misconduct. Stake does not prove independence or honesty.
6. Key lifecycle: fixed committees improve immutability but dead keys create permanent lock risk. Rotation/recovery needs borrower/lender agreement and a separately audited design, not an admin shortcut.

A 5-of-7 approval / 2-of-7 veto committee is an example for testing, not a security result. Operators must be independently controlled; economic thresholds need aggregate-at-risk analysis. The included smoke tests use 2-of-3 / 1-of-3 only for speed and mechanical demonstration.

## First 30 days

Recruit a protocol/security lead on a bounded paid design-and-prototype engagement. Give them the current standard, this package and the requirement that no feature expands asset-moving code without a written security justification. Have a second independent reviewer critique their design before a large implementation commitment.

By day 30, require: a complete Profile draft; standards compatibility matrix; funds-flow and trust-boundary review; reviewed vault/policy interface; borrower/lender failure cases; testable economic invariants; a reproducible local demonstration; a production-policy implementation estimate; and auditor availability/scope proposals.

The next code task is the immutable ETH/USDC loan policy implementing real repayment and maturity default with surplus return, then breach/cure/recovery. Only after it has meaningful integration tests should the independent Rust witness client become a funds-authorizing service.
