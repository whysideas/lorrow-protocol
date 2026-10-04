# Witness-integrated oracle consensus v0.1

Architecture decision: adopted for the next cross-asset research implementation.
Date: October 3, 2026. This document specifies proposed behavior; it does not
implement a price service, authorize funds, or change existing deployments.

## Purpose and scope

Lorrow remains a chain-neutral bilateral lending standard. Its witness clients
will independently observe prices, validate a common price certificate, replay
loan rules, and authorize an exact settlement. No individual price provider,
relayer, witness, or protocol administrator can unilaterally price a default.

The existing `FixedTermLoan` borrows ETH against ETH, denominates debt in wei,
and needs no oracle. Preserve its Sepolia pilot and existing signature domains.
Introduce a new cross-asset policy and security-profile version rather than
silently changing `LorrowFixedTermLoan/0.1` or upgrading active loans.

THORChain's documented design informs this proposal: each node observes external
markets, aggregates locally, signs observations, and the chain aggregates node
reports with quorum and freshness checks. Its CEX oracle and pool-derived prices
are separate mechanisms. See [THORChain's oracle documentation](https://dev.thorchain.org/bifrost/oracle.html),
reviewed October 3, 2026. Lorrow's rules below are a new design, not a claim that
THORChain implements these borrower protections or shares this trust model.

## Responsibilities and trust boundaries

| Component | Required responsibility | Boundary |
|---|---|---|
| Market adapters in each witness | Fetch and normalize actual asset pairs; retain timestamps, chain anchors, quality measures and evidence | No signing or custody; an API response is not cryptographic proof of a trade |
| Independent witness price engine | Filter within each source class, check coverage and inter-class agreement, publish signed observations | Multiple operators sharing one feed are correlated; node count does not establish source independence |
| Permissionless certificate relay | Gather signed observations into a canonical candidate | Cannot decide truth, alter reports or force signing; anyone can replace it |
| Witness certificate validator | Verify candidate, independently compare with local evidence, sign its exact digest | Separate message domain from settlement approval; no approval merely because peers signed |
| Immutable on-chain price verifier / loan policy | Verify certificate quorum, round, asset identity, time bounds, arithmetic and profile commitment; update breach state | HTTP-source authenticity remains a witness assumption; a quorum can still lie about external markets |
| Independent witness loan model | Recompute debt, clocks, certificate validity, payout and surplus independently of policy | Price correctness and loan-rule correctness are separate checks, even if operators serve both roles |
| Per-loan collateral vault | Enforce exact policy-allowed allocation plus separate settlement quorum, nonce, delay and fixed recipients | No source fetching, swaps, unrestricted admin or oracle-provider override |

Using the same committee for pricing and settlement simplifies the pilot but
creates a shared compromise and availability domain. These are two logical
gates, not two independently secured networks. A correct policy limits payout
and recipients even with colluding witnesses, but cannot independently know a
real-world price reported by that colluding quorum. Disclose this in the Profile.

## Immutable OracleSecurityProfile

Both parties accept a content-addressed profile before funding. Bind its hash,
price-verifier code hash/address, committee epoch and settlement profile into
the new terms commitment. Publish the complete profile, not just its hash.
Changes apply to new loans. Active loans have no unilateral feed replacement,
quorum downgrade, committee rotation or emergency admin price.

| Profile fields | Required definition |
|---|---|
| Asset identity and units | Chain plus token contract/native identifier; actual collateral and debt asset, decimals, quote currency, positive rational scaling |
| Source registry | Enumerated venues, pairs, feeds, pools, conversion paths, dependency/operator groups; avoid circular USD conversions |
| Source-class eligibility | Required classes and minimum distinct venues after filtering; market depth, TWAP window/history, liquidity and finality bounds |
| Aggregation | Deterministic median convention, integer rounding, MAD rule and zero-MAD case; no unbounded reported-volume weights |
| Divergence | Max intra-class spread, class-to-class deviation and witness spread; unexpected large moves require explicit corroboration rules |
| Time | Round cadence, source max ages, max timestamp skew, round expiry, max gap, per-chain finality and sequencer recovery policy where applicable |
| Committees | Sorted unique public keys, N, assumed fault bound f, price-observation quorum, certificate quorum, settlement quorum and veto quorum |
| Loan clocks | Existing breach tiers/windows, recovery condition, maturity grace, observation-gap reset rule and queue/execution race rules |
| Settlement | Snapshot validity through execution, notice/exit delay, certificate lifetime, execution deadline and rounding/surplus rule |
| Operations | Evidence retention/availability, supported client versions, provider access constraints and exposure limits |

Concrete bounds require asset-specific replay and adversarial testing. Do not
invent production percentages from a BTC example. The Profile is a proposed
security extension; upstream compatibility must be reviewed, including the
existing prohibition on extra loan fields and delayed collateral releases.

## Source diversity and deterministic aggregation

1. Each witness independently fetches eligible sources for a specified round.
   Reject nonpositive, stale, future-dated, malformed, thin-market, incomplete
   TWAP or unfinalized data before aggregation. A recent fetch of old data is
   still old data. Keep observation time separate from source publication time.
2. Normalize collateral and debt to the same quote currency, valuing the actual
   debt token. Never assume USDC, USDT, wrapped BTC or a bridged token equals its
   namesake. No spot substitution for a required TWAP or minimum liquidity.
3. Aggregate within classes, then compare classes; do not flatten many CEX feeds
   and one pool into an apparently diversified median. Use an unweighted median
   in v0.1, with a fixed lower-middle convention for an even count. MAD filtering
   uses profile-defined integer bounds; if MAD is zero, use the profile's explicit
   absolute/relative band. Enforce coverage again after excluding outliers.
4. Treat required-class divergence as `DISPUTED`, not an outlier to discard until
   the preferred result wins. A genuine crash can be valid if classes agree.
   Every required class must satisfy the fixed inter-class deviation bound.
5. Compute the local pair price as collateral-quote / debt-quote, retaining exact
   integer numerator/denominator scaling. Aggregate class results with equal
   class weight only after coverage and agreement succeed.
6. Publish one signed, domain-bound observation per witness per pair per round.
   A certificate includes at least the fixed observation quorum; witnesses
   validate every included report and the deterministic median, then compare
   that price against their own independently collected valid local evidence.
   Witnesses sign the exact certificate digest only if all checks pass.

Candidate classes are direct CEX markets, reviewed DEX TWAPs and native pool
markets. Third-party oracle networks can provide an additional cross-check or a
disclosed class where suitable. THORChain's CEX-derived oracle is not a native
pool class. A THORChain pool ratio is not a TWAP automatically; its adapter must
specify history, depth, finality and quote conversion. Wrapped-asset DEX pricing
is proxy evidence, with basis/bridge risks; do not claim it is native BTC pricing.
Different venues can still share arbitrage, stablecoins and market shocks.

For a test profile requiring two classes, loss of either class produces
`UNAVAILABLE`. A third class becomes mandatory only if committed in that loan's
profile. No runtime majority may silently remove a required class. Fixed-source
profiles can become unavailable permanently if services discontinue support.

## Certificates, quorums and journals

Use three distinct signing domains: `PriceObservation/v1`,
`PriceCertificate/v1`, and the new cross-asset settlement domain. A price
signature can never authorize a collateral transfer.

An observation binds protocol/version, settlement chain, verifier address,
profile hash, committee epoch, asset identities, round ID, observation window,
local rational price, per-class prices/coverage, source timestamps, source-chain
anchors, evidence hash and expiry. The expiry cannot exceed the earliest
expiry of the included evidence. A hash alone does not make evidence available.

A certificate binds those identifiers plus the canonical sorted observations,
their signatures/evidence hashes, deterministic aggregate, observation-window
bounds and earliest permitted expiry. Its digest is signed by the fixed
certificate quorum. Anyone may submit it. The verifier checks uniqueness,
membership, strictly increasing accepted rounds, time bounds and exact aggregate
math over the submitted observations. Reused evidence cannot masquerade as a
new observation. Evidence retention and independent local checks address report
selection; cryptographic quorum alone cannot prove inclusion of every report.

Choose N = 3f + 1 and all price/settlement approval quorums = 2f + 1 for the
initial fault model. Thus a seven-member independent committee tolerating two
faulty members uses five approvals. Price-observation quorum is also five.
An intersecting quorum prevents conflicting certificates only under the fault
bound and honest no-double-signing behavior; it is not full network consensus.
A three-member pilot uses three approvals to get intersecting quorums assuming
at most one faulty signer, and cannot progress with one offline signer. The
existing 2-of-3 demo remains a mechanics demonstration, not Byzantine tolerance.

Keep the veto threshold a separate disclosed parameter; a low veto quorum can
freeze or repeatedly cancel exits. Count independent administrative control,
not just keys, and bound aggregate exposure across loans using a committee.

Extend durable journals to reserve a round/digest identity before releasing a
signature and retain observations, local evidence, certificate, finalized
anchors and decisions. Reject conflicting observations/certificates for one
pair/profile/epoch/round after restart. Recover idempotently; handle reorgs
without signing an alternative digest for that identity. Test crash boundaries.
Signed equivocation is objectively demonstrable; incorrect market judgment is
not automatically objectively slashable. No bond/slashing mechanism is assumed.

## Oracle status and loan state are separate

Oracle statuses are `VALID`, `DISPUTED` and `UNAVAILABLE`. Do not add them as
replacement lifecycle states in the lending standard. Store observation metadata
and breach progress alongside the existing loan state.

| Evidence or action | Required result |
|---|---|
| Fresh valid price below the contractual threshold | Start/advance the observed breach episode, subject to the maximum-gap rule |
| Fresh valid recovery or sufficient accepted repayment/top-up verified using a valid price | Reset breach start/progress; invalidate pending price-based default |
| Stale/missing/quorum-failed data | Mark unavailable, reset breach evidence progress, block price-based default |
| Required-class or witness divergence | Mark disputed, reset breach evidence progress, block price-based default |
| Repayment or collateral top-up while pricing is unavailable | Accept according to loan rules; record debt/collateral change and invalidate pending exit; full repayment needs no price |
| Maturity plus grace expires | Record time-based eligibility without an oracle; cross-asset collateral allocation still requires valid valuation |
| Fully repaid or unfunded expiry | Return collateral through the ordinary witness settlement gate without price consensus |
| Already allocated claims | Execute existing fixed credits without requesting new prices or signatures |

Do not pause contractual interest or maturity merely because the oracle is down.
Keep debt accrual and interest cutoff governed by immutable loan terms.
Accepted partial repayments/top-ups during an outage reset the breach evidence
episode conservatively; their resulting collateral ratio is unknown until a
valid price arrives. A cure is established only with that valid observation.

## Sampled breach persistence

Sampled prices cannot prove continuous real-market behavior. The new Profile
defines an **observed uninterrupted breach**, requiring accepted below-threshold
certificates spanning the entire existing contractual breach window, with each
adjacent observation gap at most `maxGap`. Missing/disputed evidence, an excessive
gap, recovery, or a debt/collateral change resets progress. After interruption,
the next valid below-threshold observation starts a fresh window; unknown time
never counts as breach time. Keep the contractual grace floors and tier lengths.

Use on-chain accepted observation times, validated against evidence timestamps,
not witness machine wall clocks. No backdated start: time starts when the first
valid certificate is accepted, and cadence/age bounds limit delayed submissions.
Persist accepted round history/events so witnesses independently replay it.
Sparse endpoints cannot retroactively fill missing history. Relayer censorship
can delay or prevent breach confirmation; anyone may relay eligible certificates.
This reset rule protects borrowers but extends lender exposure during outages.

## Settlement, fresh prices and exit-delay interaction

Cross-asset default requires BOTH a valid price certificate AND a separate exact
settlement approval quorum. Bind certificate digest/round, profile/epoch, debt,
collateral, breach episode, maturity basis, interest cutoff and current loan
revision into the signed state commitment. Allocate lender collateral as
`min(C, floor(D / p))`, where p values a collateral atomic unit in debt atomic
units. Use full-precision rational arithmetic; borrower receives exactly C minus
the lender allocation. No extra default fees or keeper collateral recipients.

For the next prototype retain delayed queueing and strict invalidation:

- Queue only when the bound certificate is valid, all eligibility rules pass,
  and the proposal deadline does not exceed its expiry. Require enough remaining
  certificate lifetime for the full exit delay plus submission/finality margin.
- Execution rechecks the same certificate's freshness and all current loan
  state. A newer accepted relevant price round or a debt/collateral change
  changes the policy state hash, invalidating the pending proposal. Valid
  recovery also resets breach eligibility. Veto/expiry moves no collateral.
- Clear and requeue an invalid proposal with a new nonce, fresh certificate,
  independent approvals and the full delay. Do not grandfather stale payout
  evidence, reinterpret an old signature or hide a new price under an old hash.
- Continue eligible repayment/top-up through pending default until allocation,
  subject to the new policy's explicit late-payment rules. Whichever successful
  transaction is ordered first governs; reject payments after final allocation.

This preserves exact signed-state rechecking but creates a real feasibility
constraint: frequent accepted price updates can continually invalidate queued
settlements, and very short freshness limits cannot coexist with a long delay.
**Gate cross-asset implementation on replay demonstrating feasible delay,
update cadence, finality and certificate TTL.** Do not suppress market updates
to force execution. If the gate fails, design and review a new two-stage vault
interface (notice delay first, fresh exact allocation authorization afterward)
as a separate version; do not claim the current escrow solves that problem.

An oracle outage never automatically transfers all collateral to the lender,
uses the last good price indefinitely, or drops the witness gate. It can freeze
cross-asset default settlement. Recovery paths and their trust assumptions must
be specified and reviewed before production; no administrator bypass is added.

## Delivery sequence and acceptance gates

1. Complete the existing same-asset Sepolia pilot unchanged.
2. Freeze the chain-neutral profile/schema and publish shared deterministic
   vectors for normalization, filtering, certificates, clocks and allocation.
3. Build a local price engine and replay harness using recorded/synthetic data;
   exercise independent witness decisions before introducing funds authority.
4. Implement separately tested witness certificate/journal paths and an immutable
   cross-asset verifier/policy. Extend chain readers, deployment manifests and
   independent loan evaluation; never authorize pricing solely from `policy.allowed`.
5. Prove the exit-delay/freshness gate, then run mock-token cross-asset testnet
   loans with independent operators, followed by economic/security review.
6. Evaluate EVM/Aurora and native NEAR adapters against the same vectors. A NEAR
   port must define asynchronous receipt/finality rules and independent code
   verification. Chain Signatures transport authorization; they do not establish
   price truth or replace witnesses. No chain migration is authorized here.

Required acceptance scenarios: stale/replayed/future reports; duplicate/unknown
signers; conflicting rounds after crashes; omitted/outlier reports; zero MAD;
class disagreement; source correlation and outage; manipulation of a thin pool;
stablecoin depeg and wrapped-asset basis; inadequate TWAP history; source-chain
reorg and RPC disagreement; round/domain/asset replay; complete witness outage;
grace/window/gap exact boundaries; recovery during exit delay; repayment/top-up
race; new-price invalidation; debt/surplus rounding at extreme values; delayed
execution and certificate expiry; repeated veto and adversarial update starvation.

Production readiness requires reproducible evidence for these cases, no
unresolved critical security findings, measured operational independence,
reviewed compatibility and exposure limits. This architecture update is not
evidence that those implementation gates have passed.
