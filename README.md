# Lorrow Protocol

Open-source reference implementation of the [Lorrow lending standard](https://whysideas.github.io/lorrow/), originated by WHYSIDEAS.

Lorrow connects specific lenders and borrowers through immutable crypto loan terms. This repository starts with a small collateral vault and grows toward a reproducible loan demonstration with independently verifying witnesses and a frontend anyone can host.

**Current status: research prototype. No production loan policy, deployed lending market, independent witness service or audit exists yet. Use local test assets only.**

## Run the existing prototype

Use Node.js 22 LTS and npm. From the repository root:

```sh
npm --prefix contracts ci
npm test
```

The tests compile Solidity, start an in-memory EVM and exercise signatures, delayed settlement, vetoes, recipient claims and hostile withdrawal scenarios. No wallet, RPC subscription or live assets are required. Test keys are public development keys.

## What is implemented

- A directly deployed, immutable native-ETH vault for one loan.
- Fixed borrower/lender recipients and policy address.
- EIP-712 approvals from distinct authorized witnesses.
- Delayed allocation, a lower-threshold proposal veto and replay protection.
- Policy permission/state rechecks before one-time allocation.
- Independent recipient claims with reentrancy protection.
- Thirty reported smoke checks including twenty-four sampled settlement sequences.

The mutable `MockPolicy` is exclusively a test fixture. It is not debt accounting and must never secure a loan. Honest witnesses can reject a policy mistake only when all relevant vault paths correctly enforce their gate. A vault bug can bypass that protection.

## Repository layout

| Directory | Status |
|---|---|
| `contracts/` | Vault, test policy, local EVM smoke suite and pinned dependencies |
| `docs/` | Solo-build roadmap, architecture notes and proposed compensation |
| `.github/workflows/` | Automated local contract tests |

Witness, SDK and frontend packages will be added when they contain working implementations.

## Build milestones

1. Complete ETH/mock-USDC origination, immutable accounting and repayment.
2. Implement maturity default, debt-capped allocation and borrower surplus.
3. Implement partial repayment, breach, cure and recovery required by Core.
4. Add an independent Rust state model and three locally runnable witnesses.
5. Deliver a browser UI and a one-command reproducible loan demonstration.
6. Publish a public testnet demonstration and invite independent review.

See [the active solo-build plan](docs/ROADMAP.md), [fee proposal](docs/FEES.md), [vault details](contracts/README.md) and [contribution guide](CONTRIBUTING.md).

## Licensing and stewardship

Code and implementation documentation are Apache-2.0; upstream specification material retains its CC BY 4.0 license. Third-party dependencies retain their own licenses. WHYSIDEAS stewards the project initially. Contributors receive attribution; contributions do not automatically create ownership, tokens or payment rights.

