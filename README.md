# Lorrow Protocol

Open-source reference implementation of the [Lorrow lending standard](https://whysideas.github.io/lorrow/), originated by WHYSIDEAS.

Lorrow connects specific lenders and borrowers through immutable crypto loan terms. This repository starts with a small collateral vault and grows toward a reproducible loan demonstration with independently verifying witnesses and a frontend anyone can host.

**Current status: research prototype. An ETH-only fixed-term loan policy and local lifecycle demonstration exist. No production market, independent witness service or audit exists yet. Use local test assets only.**

## Run the existing prototype

Use Node.js 22 LTS and npm. From the repository root:

```sh
npm --prefix contracts ci
npm test
npm run demo
```

The tests compile Solidity, start an in-memory EVM and exercise signatures, delayed settlement, vetoes, recipient claims and hostile withdrawal scenarios. No wallet, RPC subscription or live assets are required. Test keys are public development keys.

## What is implemented

- A directly deployed, immutable native-ETH vault for one loan.
- Fixed borrower/lender recipients and policy address.
- EIP-712 approvals from distinct authorized witnesses.
- Delayed allocation, a lower-threshold proposal veto and replay protection.
- Policy permission/state rechecks before one-time allocation.
- Independent recipient claims with reentrancy protection.
- Fixed principal/interest, named lender funding, full repayment and maturity grace.
- Debt-capped default, borrower surplus and unfunded collateral return.
- Thirty escrow checks plus loan scenarios and varied loan allocations.

The mutable `MockPolicy` is exclusively a test fixture. It is not debt accounting and must never secure a loan. Honest witnesses can reject a policy mistake only when all relevant vault paths correctly enforce their gate. A vault bug can bypass that protection.

## Repository layout

| Directory | Status |
|---|---|
| `contracts/` | Vault, fixed-term loan, test fixtures and local EVM suites |
| `docs/` | Solo-build roadmap, architecture notes and proposed compensation |
| `.github/workflows/` | Automated local contract tests |

Witness, SDK and frontend packages will be added when they contain working implementations.

## Build milestones

1. **Done locally:** ETH-only funding, fixed-interest repayment and immutable terms.
2. **Done locally:** maturity default, debt-capped allocation and borrower surplus.
   Cross-asset ETH/token loans and oracle valuation remain future work.
3. Implement partial repayment, breach, cure and recovery required by Core.
4. Add an independent Rust state model and three locally runnable witnesses.
5. Deliver a browser UI and a one-command reproducible loan demonstration.
6. Publish a public testnet demonstration and invite independent review.

See [minimal loan rules and ten invariants](docs/MINIMAL_LOAN.md), [the active solo-build plan](docs/ROADMAP.md), [fee proposal](docs/FEES.md), [vault details](contracts/README.md) and [contribution guide](CONTRIBUTING.md).

## Licensing and stewardship

Code and implementation documentation are Apache-2.0; upstream specification material retains its CC BY 4.0 license. Third-party dependencies retain their own licenses. WHYSIDEAS stewards the project initially. Contributors receive attribution; contributions do not automatically create ownership, tokens or payment rights.

