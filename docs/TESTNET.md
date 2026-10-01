# Sepolia pilot: preparation and launch

The repository now contains a wallet-connected interface, independent deployment
verification, encrypted witness keystores, a durable signing journal, finalized-state
checks and resumable deployment scripts. It has been exercised against local EVMs;
**this document is not a claim that a public Sepolia deployment has occurred.**

The existing `npm run walkthrough` remains the no-wallet local demo on port 4173.
The new `npm run testnet` uses your own browser wallet and serves port 4174.
It does not start Ganache, create funds, hold wallet keys or sign for you.

## 1. Update and start the interface

In your VS Code terminal, inside the repository:

```sh
git pull --ff-only
npm --prefix contracts ci
npm run testnet
```

Open **http://127.0.0.1:4174**. Keep this terminal running. A browser wallet supporting
EIP-1193 and Sepolia is required; seed phrases/private keys are never entered into
the webpage. The app requests wallet confirmations, with chain ID pinned to Sepolia
(11155111). Mainnet and other chains are refused.

Use separate test-only borrower and lender accounts. Obtain Sepolia test ETH for
both, including gas, using the faucets listed in Ethereum's official network guide:
https://ethereum.org/en/developers/docs/networks/#sepolia . Do not buy ETH for this
demo. Witness keys need no ETH merely to sign; a relayer sending a transaction does.
Never use the public accounts from the old local Ganache demo for public deployment.

## 2. Create the witness keys

Open a second terminal in the repository:

```sh
npm run witness:init
```

Enter and confirm a password of at least 12 characters. Input is hidden. This
creates three random encrypted keystores and a public committee file:

- `.lorrow/keys/witness-1.json`
- `.lorrow/keys/witness-2.json`
- `.lorrow/keys/witness-3.json`
- `.lorrow/keys/committee.json`

Paste the three public addresses from `committee.json` into the interface.
One founder operating all keys is an operator simulation, not decentralization.
When contributors join, each operator should generate and retain their own key
and independently build/verify the protocol. Back up encrypted keystores, passwords,
and journals privately. All `.lorrow/` contents are ignored by Git. Do not move keys
into the generated public site or commit passwords/RPC credentials.

## 3. Deploy through the borrower wallet

Connect the borrower account. Enter the lender's separate address and the committee
addresses. Defaults:

| Term | Default |
|---|---|
| Principal | 0.001 test ETH |
| Fixed interest | 0.0001 test ETH |
| Collateral | 0.003 test ETH |
| Duration | 30 minutes after funding |
| Grace | 10 minutes |
| Funding window | 48 hours |
| Exit delay | 30 minutes after queueing |
| Committee | 2 approvals; 1 veto |

The pilot interface/scripts cap principal at 0.01 ETH and collateral at 0.03 ETH.
These are tool-level limits, not additional restrictions in the contracts.

Click **Deploy loan & lock collateral**. Your wallet confirms two transactions:
loan creation, then collateral locking. The app verifies constructor input,
receipt identity, on-chain links and both full runtime bytecodes (including
immutable values and the EIP-712 cache) against the pinned local build. A rejected
collateral step can be continued with **Resume pending deployment**. The draft
is saved in browser local storage once the wallet returns its transaction hash.
If the browser/storage is lost before that point, recover transaction details from
the wallet/explorer; do not blindly deploy another loan.

Save the downloaded `lorrow-deployment.json`, preferably in `.lorrow/`. Send only
this public manifest to the lender/witness operators. It contains addresses,
terms and transaction hashes, not private keys. Loading the file verifies the
source/runtime again before enabling actions. Switch wallet accounts to fund as
lender, claim principal as borrower, repay, and claim the lender's payment.

## 4. Configure a witness RPC

Use a Sepolia HTTP(S) RPC endpoint that supports historical `eth_call`, code/receipt
reads, and `eth_getBlockByNumber("finalized")`. A node you operate or a provider's
Sepolia endpoint works. Set the URL locally in the witness terminal:

| Terminal | Command |
|---|---|
| PowerShell | `$env:LORROW_RPC_URL="YOUR_SEPOLIA_RPC_URL"` |
| Command Prompt | `set LORROW_RPC_URL=YOUR_SEPOLIA_RPC_URL` |
| macOS/Linux | `export LORROW_RPC_URL="YOUR_SEPOLIA_RPC_URL"` |

Keep embedded API credentials private. The browser uses the wallet's RPC; the
witness uses this independently configured endpoint. RPC data is a trust dependency;
this prototype does not run a consensus light client or compare multiple providers.

Optional source verification, before acting:

```sh
npm run testnet:verify -- --manifest .lorrow/lorrow-deployment.json
npm run testnet:verify -- --manifest .lorrow/lorrow-deployment.json --finality finalized
```

Verification is local source/bytecode comparison, not an Etherscan verification
badge. `npm run testnet:build` also exports a recompilable Solidity standard JSON
input at `.lorrow/site/solidity-standard-input.json`, compiler 0.8.30, Shanghai,
optimizer 200. Explorer publication is a separate step.

## 5. Sign an eligible exit

After repayment, default, or unfunded expiry, click **Save approval request**.
Copy the downloaded request into `.lorrow/`. Wait until the relevant state and
deployment are finalized; the witness refuses early signing without a latest-block
fallback. Finality depends on network health and can take a meaningful wait.
Refreshing the browser alone does not make finality occur.

Run one command for each participating witness (different `--key` and `--out`):

```sh
npm run witness:sign -- --manifest .lorrow/lorrow-deployment.json --key .lorrow/keys/witness-1.json --request .lorrow/lorrow-approval-request.json --out .lorrow/approval-1.json
```

Repeat for witness 2 and optionally 3. Enter the corresponding keystore password.
The signer checks finalized and latest state, recomputes the exact allocation and
commitment, checks the on-chain digest, and flushes its journal before emitting a
public signature. Use **Load signatures** to select at least two matching files,
then **Queue approved exit**. The app verifies the signers, domain, nonce, amount,
state and deadline and sorts distinct signatures before wallet submission.

Wait for the actual exit delay. Refresh, execute, then claim collateral from each
recipient's wallet. Public-chain time cannot be advanced by the interface.

For a veto, save the veto request from the pending proposal and use the same witness
command with that file. Load the resulting public veto signature and submit it.
The signing request requires explicit `operator_cancel`; this is an operator-driven
cancellation, not an autonomous fraud detector. Veto can use current pending state
once the deployment is finalized, because cancellation cannot allocate assets.
After veto, the next nonce/cancellation must finalize before new approval signing.

## 6. Recovery and journal rules

Default journal path: `.lorrow/journals/CHAINID-WITNESS_ADDRESS.jsonl`.
It stores a hash-linked sequence of cryptographically checked signatures and their
observed head/finalized blocks. Keep one writer per journal. A verified dead local
PID lock can be recovered on restart. Foreign, malformed or incomplete locks and
stale recovery guards block signing until inspected; never remove a live writer's
lock. Filesystems that do not support directory fsync have weaker power-loss
persistence. This is not hardware-backed, rollback-proof key storage.

Restarting with the same request after a flushed signature returns the same record.
Existing output files are never overwritten; retain the original or choose a new
output filename. Same-nonce changes to amount/state are refused. A new deadline
for the same allocation can be signed only once all earlier authorizations for
that nonce have expired in finalized time. Queueing/vetoing advances the nonce;
old signatures cannot authorize the new proposal. If an unqueued request expires,
wait for finalized expiry, then export a fresh request and collect a matching set.

Corrupt or partial journal tails cause a refusal. Do not delete/truncate journals
to bypass the signer. Losing or rolling back records can remove anti-equivocation
protection; the operator's filesystem and backups remain trusted. Audit logs are
not a formal proof or a replacement for independently operated witnesses.

## Repeatable CLI deployment (optional)

The browser route avoids exposing a borrower private key to the application.
For automated testnet deployment with a separate encrypted test-only key:

```sh
npm run witness:init -- --single .lorrow/keys/borrower.json
npm run testnet:deploy -- --plan .lorrow/plan.json --key .lorrow/keys/borrower.json --out .lorrow/deployment.json
```

Fund that generated borrower's public address with faucet test ETH. `plan.json`
uses wei strings, three committee addresses, and the same terms structure as
`docs/testnet-plan.example.json`; replace placeholder addresses and set a future
funding deadline. Signed creation/opening transactions are saved before broadcast.
Resume with the same plan/key/output and `--resume yes`; it reuses the recorded
transactions rather than creating a fresh loan. Source, chain and draft checks
precede collateral broadcast. Never share signed drafts or encrypted keys as part
of the public site. A failed/reverted signed draft needs manual inspection, not
automatic replacement.

## Hosting and remaining launch work

```sh
npm run testnet:build
```

`.lorrow/site/` is a static site: HTML, CSS, JS, pinned ethers bundle, artifacts and
public Solidity input. It can be served under a subpath by GitHub Pages or another
static host. It contains no operator keystore or signing service. The repository's
CI builds/tests it and produces a downloadable public-site artifact. Enabling a
public host and publishing actual deployment addresses remain launch steps.

Before announcing a public pilot: record a successful real Sepolia deployment,
verify it from another RPC, exercise all loan paths with faucet assets, publish
public addresses/manifest and invite independently operated testnet witnesses.
There is no production audit, automatic witness daemon, key rotation, slashing,
cross-asset policy, market matching or mainnet deployment in this milestone.
