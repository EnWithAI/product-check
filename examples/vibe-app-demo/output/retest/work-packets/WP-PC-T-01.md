# WP-PC-T-01: Fix PC-T-01: Dependency manifest and lockfile are present

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-248001

## Objective

Generate and commit the package manager's lockfile; use the frozen install command (npm ci / pnpm install --frozen-lockfile) in CI.

## Findings

- PCF-A79BB3B752 (P2, fact): No lockfile next to the root manifest. at `package.json`

## Where to look

- `package.json`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Generate and commit the package manager's lockfile; use the frozen install command (npm ci / pnpm install --frozen-lockfile) in CI.
3. Add the regression protection: CI fails when the lockfile is out of date (frozen install).

## Acceptance criteria

- [ ] A lockfile exists next to each manifest.
- [ ] Control PC-T-01 evaluates PASS on retest.
- [ ] Finding PCF-A79BB3B752 (package.json) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
