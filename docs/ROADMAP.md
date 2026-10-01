# Solo-build roadmap

The active assumption is one founder and AI-assisted development, with contributors joining after a reproducible proof of concept. Hiring is not a prerequisite for local and testnet demonstrations. Independent review remains necessary before substantial real-value use.

The [original roadmap](original-roadmap.md) preserves the initial design and ten invariants. Its staffing and budget assumptions have been superseded for the proof-of-concept phase by this document.

## Milestones

1. **Repository foundation:** public Apache-2.0 source, standard link, vault prototype, reproducible local smoke suite, contribution guide and CI.
2. **Real local loan policy:** ETH collateral, mock-USDC loan asset, atomic funding, immutable terms, accrued interest and real repayment transfers. Validate creditor/borrower consent and token balances.
3. **Default correctness:** maturity grace, debt-capped collateral recovery, surplus return, exact decimal/price/rounding semantics and repayment/settlement race handling.
4. **Core lifecycle:** partial repayments, cure, breach observations, recovery clock reset and complete compatibility matrix. Delayed exits need an explicitly accepted standard extension/revision.
5. **Independent witnesses:** Rust model, canonical replay, signed exact proposals, vetoes, three distinct local processes, failure and malicious-proposal demonstrations. Three processes controlled by one founder are a simulation, not independent decentralization.
6. **Usable demonstration:** SDK, browser frontend, lender offers/borrower requests and repeatable normal/default/security scenarios. Anyone can reproduce the same result from clean machines.
7. **Public testnet:** published contracts and configuration, optional GitHub Pages interface, operator instructions and contributor issues. No real-money market at this stage.
8. **Independent assurance:** external economic/security review, production witness operators, funded audits/bounties and staged exposure limits.

Add packages only when their code works. Planned `witness/`, `sdk/`, `app/` and `test-vectors/` directories are future implementations, not completed features.

## Runtime independence

GitHub stores source and publishes builds; contracts execute on the blockchain and witnesses run on independently operated machines. All frontend and node configuration must support alternate providers. Repository hosting must not custody collateral or authorize loan settlement.

