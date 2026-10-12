# WP-PC-T-04: Fix PC-T-04: A CI pipeline is configured

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-36EE7E

## Objective

Add a CI workflow that installs with a frozen lockfile, builds, lints and runs tests on every pull request.

## Findings

- PCF-3E3C906C89 (P2, fact): No CI configuration found. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Add a CI workflow that installs with a frozen lockfile, builds, lints and runs tests on every pull request.
3. Add the regression protection: Branch protection requiring CI.

## Acceptance criteria

- [ ] A CI configuration file exists.
- [ ] Control PC-T-04 evaluates PASS on retest.
- [ ] Finding PCF-3E3C906C89 (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
