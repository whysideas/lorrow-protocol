# Contributing

Start by reproducing `npm --prefix contracts ci` and `npm test`. Open an issue describing a concrete improvement or counterexample before changing lending semantics. Keep security-sensitive changes small and include an adversarial example where appropriate.

Pull requests should state the changed behavior, which security properties it affects and what was actually tested. Keep generated artifacts, credentials and dependencies out of source control. Do not submit real wallet keys or personal financial data.

Sign commits with `git commit -s` to certify the [Developer Certificate of Origin](https://developercertificate.org/). This is an origin certification, not a cryptographic signing requirement. Contributions use the repository's existing licenses unless explicitly agreed otherwise.

Initial useful contributions: hostile policy/token examples, state-machine test vectors, oracle timing analysis, independent repayment arithmetic and improvements to reproducible setup. A high test count alone is not evidence of safety.

Payments require a separately published, funded bounty or agreement before work begins. There is no token, automatic revenue entitlement or promise of future compensation.

Report a real security issue privately following SECURITY.md, rather than publishing a working exploit against live assets.

