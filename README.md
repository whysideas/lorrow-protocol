# Lorrow Protocol

Open-source reference implementation of the [Lorrow lending standard](https://whysideas.github.io/lorrow/), originated by WHYSIDEAS.

Lorrow connects specific lenders and borrowers through immutable crypto loan terms. This repository starts with a small collateral vault and grows toward a reproducible loan demonstration with independently verifying witnesses and a frontend anyone can host.

**Current status: research prototype. An ETH-only fixed-term loan policy and local lifecycle demonstration exist. A browser walkthrough and three local witness processes are available. No production market, independently operated witness service or audit exists yet. Use local test assets only.**

## Run the existing prototype

Use Node.js 22 LTS and npm. From the repository root:

```sh
npm --prefix contracts ci
npm test
npm run demo
```

The tests compile Solidity, start an in-memory EVM and exercise signatures, delayed settlement, vetoes, recipient claims and hostile withdrawal scenarios. No wallet, RPC subscription or live assets are required. Test keys are public development keys.

## Open the browser walkthrough

```sh
npm run walkthrough
```

Open **http://127.0.0.1:4173**. Fund, repay or default, inspect witness decisions,
queue, veto and settle a loan with local test assets. The command starts the
local chain and three witness processes. Keep the terminal running; Ctrl+C stops
and discards the chain. See [the walkthrough guide](docs/WALKTHROUGH.md).

## Prepare a Sepolia pilot

```sh
npm run testnet
```

Open **http://127.0.0.1:4174** to use a browser wallet. This interface deploys and
verifies source/runtime, exchanges durable witness signature files, and submits
wallet-confirmed transactions. It starts no local chain and holds no wallet key.
Use fresh test-only accounts and faucet ETH; no public deployment is claimed.
Read [the setup, signing and recovery guide](docs/TESTNET.md) before deploying.

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
- Browser walkthrough of repayment/default/unfunded expiry and proposal security controls.
- Three separate local witness processes with an independent JS rules implementation.
- Encrypted standalone witness keys, durable signature journal and restart recovery.
- Finalized-state signing and exact constructor/runtime verification.
- Resumable Sepolia deployment scripts and a buildable wallet-connected interface.

The mutable `MockPolicy` is exclusively a test fixture. It is not debt accounting and must never secure a loan. Honest witnesses can reject a policy mistake only when all relevant vault paths correctly enforce their gate. A vault bug can bypass that protection.

## Repository layout

| Directory | Status |
|---|---|
| `contracts/` | Vault, fixed-term loan, test fixtures and local EVM suites |
| `witness/` | Local signer processes and independently computed ETH rules model |
| `app/` | Local walkthrough and wallet-connected Sepolia interface |
| `testnet/` | Static build, key setup, deployment and verification tools |
| `docs/` | Solo-build roadmap, architecture notes and proposed compensation |
| `.github/workflows/` | Automated local contract tests |

Witnesses and the browser walkthrough now have working local implementations. A reusable SDK, independent operators and a recorded public testnet deployment remain future work.

## Build milestones

1. **Done locally:** ETH-only funding, fixed-interest repayment and immutable terms.
2. **Done locally:** maturity default, debt-capped allocation and borrower surplus.
   Cross-asset ETH/token loans and oracle valuation remain future work.
3. Implement partial repayment, breach, cure and recovery required by Core.
4. **Done locally:** independent JS state model and three signer processes. Rust, durable signing and independent operation remain future work.
5. **Done locally:** browser UI and one-command loan walkthrough.
6. **Preparation complete:** durable signing, deployment verification, wallet interface and scripts. A real public-chain run, hosted pilot and independent review remain launch work.

See [minimal loan rules and ten invariants](docs/MINIMAL_LOAN.md), [the active solo-build plan](docs/ROADMAP.md), [fee proposal](docs/FEES.md), [vault details](contracts/README.md) and [contribution guide](CONTRIBUTING.md).

## Licensing and stewardship

Code and implementation documentation are Apache-2.0; upstream specification material retains its CC BY 4.0 license. Third-party dependencies retain their own licenses. WHYSIDEAS stewards the project initially. Contributors receive attribution; contributions do not automatically create ownership, tokens or payment rights.

