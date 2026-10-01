# Minimal fixed-term loan v0.1

Research implementation, not audited or a production policy. This intentionally narrower
loan does not claim full Lorrow Core compatibility. All amounts are native ETH wei.

## Agreed rules

The borrower deploys `FixedTermLoan` with a named lender, principal P > 0, fixed
interest I >= 0, duration T > 0, grace G > 0, funding deadline F, exit delay E > 0,
and sorted unique witnesses with approval/veto thresholds. Interest is an agreed
fixed amount, not an APR or compounding calculation. Debt D = P + I.

The borrower calls `openVault` before or at F, depositing collateral C >= D.
The policy creates one immutable escrow pointing back to itself. The lender
inspects the deployed terms and vault, then calls `fund` with exactly P before or
at F. This sets dueAt = fundedAt + T and gives the borrower a withdrawable principal
credit. Funding does not depend on the borrower accepting an ETH callback.
Borrower consent is deployment plus collateral deposit; lender consent is funding.
This is a borrower-created request, not an offer-matching marketplace.

The borrower can repay exactly D once, through dueAt + G inclusive, crediting the
lender with D. Early repayment pays the same fixed interest. No partial repayment
or late cure exists. Pull credits must be claimed separately by their fixed recipient.

| State | When eligible | Exact lender collateral allocation |
|---|---|---|
| Unfunded expiry | Not funded and timestamp > F | 0 |
| Repaid | Successful full repayment | 0 |
| Default | Funded, not repaid, timestamp > dueAt + G | D |
| All other states | Not eligible | No settlement |

Witness quorum approves the exact permitted allocation. The existing escrow
requires delay, permits proposal veto, and rechecks policy before allocation.
Borrower receives C minus lender allocation. A veto requires a fresh nonce,
approval quorum and full delay. Claims after allocation need no further signatures.
Repayment cannot race with default: their permitted time intervals do not overlap.
Claims of principal/repayment credits do not change settlement authorization.

Example: P=4000, I=400, C=10000 wei. Repayment pays the lender 4400 and returns
10000 collateral to the borrower. Default allocates 4400 collateral to lender and
5600 to borrower. Unfunded expiry returns all 10000 to borrower.

## Ten mathematical security invariants

These are design properties with executable examples and sampled tests, **not
machine-checked proofs**. They assume EVM correctness and the pinned dependency
behavior. Balances can exceed obligations because forced donations are stranded.

1. **Immutable terms and binding.** P, D, T, G, F, E, borrower, lender, committee and
   thresholds never change. The terms commitment includes chain, policy address,
   parties and terms; the escrow binds the actual C and policy. Policy authorizes
   only its one vault V: v != V implies allowed(v,x)=false.
2. **Collateral conservation.** At allocation, L+B=C with 0 <= L <= C and B=C-L.
   C is the original deposit; forced donations cannot increase C or claim credits.
3. **One-time funding.** Number of successful funding calls <= 1. A successful call
   has sender=lender, value=P, existing vault, timestamp<=F, and credits borrower P.
   Collateral is present before funding; the loan starts at actual funding time.
4. **Exact one-time repayment.** Number of successful repayments <= 1. Success
   requires sender=borrower, funding, value=D, timestamp<=dueAt+G and no settlement.
   It creates exactly D lender payment credit. Wrong amounts and late payments revert.
5. **Default cap and surplus.** Default allocation is exactly L=D <= C, B=C-D;
   repaid or never-funded expiry allocation is L=0, B=C. A malicious quorum cannot
   choose another amount under this correct policy.
6. **Grace disjointness.** Repayment requires t<=dueAt+G. Default requires
   t>dueAt+G and not repaid. Thus repayment/default windows have empty intersection;
   repaid implies default never becomes eligible.
7. **Payment solvency and single claims.** Let Qb,Ql be outstanding policy credits,
   Wb,Wl cumulative successful payment withdrawals. After funding Qb+Wb=P;
   after repayment Ql+Wl=D (otherwise both lender terms are zero).
   Policy balance >= Qb+Ql. Claims decrement credits before sending; a failed send
   restores them; callers cannot claim another recipient's entitlement.
8. **Signature authorization.** Allocation requires at least approvalThreshold
   distinct sorted authorized ECDSA signers, bound to chain, vault, version, terms,
   nonce, allocation, state hash and deadline. Cross-vault/chain and duplicate replay fail.
9. **Delayed, revocable proposals.** Execution requires readyAt<=t<=deadline,
   matching current allowed state/hash and no prior settlement. Veto clears the
   pending proposal; requeue increments nonce and resets delay. Old approvals/vetoes
   cannot authorize/cancel a newer proposal.
10. **Terminal allocation.** Successful allocations <=1. Settled implies no new
    proposal, funding or repayment. Escrow credits can only be claimed by the
    immutable beneficiaries; each credit is consumed once, with failed sends restored.

## Reproduce

From repository root, use Node 22 LTS:

```sh
npm --prefix contracts ci
npm test
npm run demo
```

`npm test` runs the original 30 escrow checks (including 24 sampled sequences),
then the loan scenarios. `npm run demo` runs repayment, default with veto/requeue,
unfunded expiry, exact boundary cases, recipient attacks and 12 varied loans.
Everything runs on a disposable in-memory chain with public development keys;
it does not deploy to a public network. Output reports asserted results.

## Limits and next work

ETH borrowing against ETH collateral is a deliberately simple accounting demo,
not a claim of useful cross-asset lending economics. No token approvals, price feeds,
liquidations, partial payments, cure, fee collection or matching service exists.
Three test signing keys are one process under one operator, not independent witnesses.
A stalled committee can lock collateral indefinitely. Rejecting recipients retain
claims but cannot redirect them; forced ETH has no rescue/sweep path.

A separate JS witness runner and local browser walkthrough are now available;
see WALKTHROUGH.md. Next: independent testnet deployment verification, durable
signer state, finality policy and deployment scripts. Cross-asset lending requires
explicit token transfer semantics and audited oracle/decimal/rounding rules.
Use this prototype for local experiments only; obtain independent security review
before real-value use. Guard documentation: https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard
