# Run the browser walkthrough

Use Node.js 22 LTS and Git. In the terminal inside VS Code, from your existing
`lorrow-protocol` folder:

```sh
git pull --ff-only
npm --prefix contracts ci
npm run walkthrough
```

Open **http://127.0.0.1:4173** in your browser. Leave the terminal running.
No wallet, RPC subscription, real ETH, or API key is needed. All accounts and
assets are local development fixtures. Do not send real funds to any shown address.

If port 4173 is occupied, set `LORROW_DEMO_PORT` before starting:

| Terminal | Command |
|---|---|
| macOS/Linux | `LORROW_DEMO_PORT=4174 npm run walkthrough` |
| Windows PowerShell | `$env:LORROW_DEMO_PORT=4174; npm run walkthrough` |
| Windows Command Prompt | `set LORROW_DEMO_PORT=4174` then `npm run walkthrough` |

Then open the corresponding port. If PowerShell blocks `npm.ps1`, use the Command
Prompt terminal in VS Code. If Ganache reports a µWS warning and falls back to
Node.js, the fallback is expected and the walkthrough still runs.

## Try the three paths

A fresh loan already has 3 test ETH collateral locked. Principal is 1 ETH,
fixed interest 0.1 ETH, duration 120 seconds, grace 30 seconds, and exit delay
20 seconds. The funding window lasts 300 seconds.

- **Repayment:** fund as lender, withdraw principal, repay 1.1 ETH, and claim the
  repayment as lender. Request witness approvals, queue settlement, advance the
  delay, execute, and claim all 3 ETH collateral as borrower.
- **Default:** choose New test loan, then the Default tab. Fund, withdraw principal,
  advance past grace, request approvals, queue, advance delay, and execute.
  Lender claims 1.1 ETH collateral; borrower claims the remaining 1.9 ETH.
- **Never funded:** choose New test loan and the Never funded tab. Expire the
  funding window, request approvals, queue, advance delay, execute and claim all
  collateral as borrower.

Switching tabs only changes instructions. **New test loan** creates a fresh loan
on the same temporary chain. It does not settle earlier loans. Closing the terminal
with Ctrl+C discards the entire chain; restarting creates a fresh environment.
The local chain clock is deliberately frozen between transactions; use the explicit
time controls rather than waiting on your wall clock.

Under **Try the security controls**:

- Test incorrect payout asks witnesses to authorize one extra wei for the lender.
  Every live witness should refuse to sign. No transaction is submitted.
- Veto queued proposal requests a signature from one local witness and cancels
  the proposal on-chain. Request new approvals, queue again, and wait a fresh delay.
- Expire queued proposal moves past its signed deadline. Execution is blocked;
  clear the proposal and request fresh approvals before retrying.

The state panel shows eligibility, claims, pending allocation and delay. Witness
cards show each process's verification result. Activity records include transaction
hashes from the local chain, without links to a public explorer.

## Witness implementation and trust boundary

`witness/runner.mjs` runs in three separate Node processes with public development
keys. Each connects to the local RPC, reads one pinned block, and independently
computes the rules and commitment implemented in `witness/model.mjs`. It verifies:

1. Chain, registered loan/vault, immutable recipients, code hashes and terms.
2. Debt, deposited collateral, funding/maturity clock and committee membership.
3. Correct eligibility and exact lender allocation from the ETH loan rules.
4. Nonce, state commitment, signing deadline and EIP-712 domain/digest.
5. Agreement with the on-chain policy and unchanged block hash before signing.

The runner accepts approval requests only for its registered loan. It refuses
unknown request types. Failed verification returns an error **without a signature**.
The parent sorts accepted signatures before submitting them. Two live witnesses
suffice for approval; without quorum there is no timeout bypass. One live witness
can sign a veto for an existing proposal only when explicitly requested by the
local demo operator; this is a cancellation demonstration, not autonomous fraud detection.

This is a JS reference model separate from the Solidity implementation. All three
witnesses share that model, the same RPC, computer and operator, and trust the
parent's registration of code hashes/loan terms. They are **not independently
operated witnesses**, and this is not a Rust implementation, TEE assurance,
consensus protocol, persistent signer or production witness network. There is no
reorg finality wait or durable approval journal. Key management, chain finality,
independently sourced deployment verification and operator separation remain work
for a public testnet/production design.

## Services and security

The Node HTTP server serves the interface and orchestrates local development
transactions. It starts an ephemeral Ganache RPC on a random loopback port and
three child witnesses. Neither HTTP nor RPC intentionally binds to a public
interface. Browser actions require the local token, JSON content type, matching
origin and active loan session; a Host check rejects foreign names. There is no
remote deployment option, wallet connection or upload of private keys.

The browser never receives witness private keys or raw signing APIs. The public
mnemonic remains in source because these are disposable test accounts. These
protections support a local demonstration; they do not turn the server into a
production custody application. Do not expose it through a tunnel or public host.

## Validation and next work

```sh
npm test                  # escrow, loan, and walkthrough integration suites
npm run test:walkthrough  # walkthrough/witness suite only
npm run demo              # original terminal-only loan scenarios
```

Walkthrough tests exercise all HTTP lifecycles, correct and rejected signatures,
proposal veto/expiry, stale sessions, concurrent funding, origin/Host/token checks,
model boundaries and witness outages. A separate GitHub Actions job installs pinned Playwright in a temporary directory,
exercises all three paths in Chromium, checks mobile width and keyboard tabs, and
uploads desktop/mobile screenshots. It does not add browser tooling to the user
installation.

Next: durable witness approval journal, deployment verification independent of the
orchestrator, finality policy, independently operated testnet witnesses, and a
wallet-connected testnet interface. See ROADMAP.md for broader protocol work.
