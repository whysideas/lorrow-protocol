# Fee and compensation proposal

Status: design proposal only. No fee code, production rewards or revenue commitments are implemented.

The POC charges zero actual fees. Model a 30-basis-point origination fee to explore economics. Existing Core fee-hook wording needs clarification before changing funding semantics or claiming compatibility.

Proposed beta: the lender funds principal plus a disclosed fee only when the loan successfully activates. For 10,000 USDC principal, 30 basis points means the lender funds 10,030 USDC, the borrower receives 10,000 USDC and owes 10,000 USDC principal plus agreed interest. Fee effects must be shown in lender net-yield and borrower total-cost disclosures.

| Proposed fee allocation | Share | Example from 30 USDC |
|---|---:|---:|
| Assigned witnesses | 50% | 15.00 |
| Keepers/relayers | 15% | 4.50 |
| Originating frontend | 10% | 3.00 |
| Maintenance/security fund | 25% | 7.50 |

These proportions require workload, gas, term length, small-loan and aggregate-exposure modeling. A 0.30% fee generates 3,000 USDC per million USDC originated, before costs. It does not prove that independent witnesses can be sustained or that anyone earns a meaningful income.

Collateral never pays operating rewards, and fees must never reduce borrower surplus. Keep fee accounting in a separate reviewed component; failure of fee distribution must not trap already-active loan collateral.

Witness rewards should cover timely, valid assigned evaluations, including rejection. Paying only affirmative signatures incentivizes rubber-stamping. Vetoes should not automatically earn additional fees. Keeper bounties require a successful useful transition, not duplicate attempts. Objective equivocation may support slashing; disagreement with a majority alone is insufficient.

Frontends declare recipients before users sign; all fees and recipients are fixed for the accepted loan. Open source permits zero-fee forks; reputable operators, reliable services and security maintenance must justify fees. No protocol token is planned.

Before usage exists, use disclosed sponsorships, grants and explicitly funded contributor bounties. Contributor credit is not an automatic claim on future revenue. Optional hosted services can fund maintenance while the code and self-hosting path remain open.

