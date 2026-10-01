# Solo-build roadmap

The active assumption is one founder and AI-assisted development, with contributors joining after a reproducible proof of concept. Hiring is not a prerequisite for local and testnet demonstrations. Independent review remains necessary before substantial real-value use.

The [original roadmap](original-roadmap.md) preserves the initial design and ten invariants. Its staffing and budget assumptions have been superseded for the proof-of-concept phase by this document.

## Milestones

1. **Repository foundation:** public Apache-2.0 source, standard link, vault prototype, reproducible local smoke suite, contribution guide and CI.
2. **Real local loan policy (ETH-only complete):** named-lender funding after collateral locking, immutable terms, fixed total interest, pull payments and full repayment. Cross-asset mock-USDC funding and accrued interest remain future extensions.
3. **Default correctness (same-asset complete):** exact maturity/grace boundaries, fixed-debt collateral recovery and surplus return. See MINIMAL_LOAN.md. Cross-asset decimal/price/rounding rules and late cure remain future work.
4. **Core lifecycle:** partial repayments, cure, breach observations, recovery clock reset and complete compatibility matrix. Delayed exits need an explicitly accepted standard extension/revision.
5. **Witness mechanics (local JS prototype complete):** independent rules computation, pinned-block reads, signed exact proposals, requested vetoes, three distinct processes, outage and incorrect-payout demonstrations. Rust, durable replay/journal, finality and independent operators remain future work. Three processes controlled by one founder are a simulation, not independent decentralization.
6. **Usable demonstration (local browser complete):** one-command browser walkthrough with repeatable repayment/default/expiry/security scenarios. SDK, offer matching and wallet-connected frontend remain future work. Anyone can reproduce the same result from clean machines.
7. **Public testnet:** published contracts and configuration, optional GitHub Pages interface, operator instructions and contributor issues. No real-money market at this stage.
8. **Independent assurance:** external economic/security review, production witness operators, funded audits/bounties and staged exposure limits.

Add packages only when their code works. `witness/` and `app/` now contain local implementations. Planned `sdk/` and `test-vectors/` remain future work. See WALKTHROUGH.md for the local signer trust boundary.

## Runtime independence

GitHub stores source and publishes builds; contracts execute on the blockchain and witnesses run on independently operated machines. All frontend and node configuration must support alternate providers. Repository hosting must not custody collateral or authorize loan settlement.

