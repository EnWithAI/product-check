# WP-PC-C-08: Fix PC-C-08: Critical journeys are covered by passing end-to-end tests

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-B68F0A

## Objective

Write end-to-end tests (for example Playwright) for the declared critical journeys, run them in CI and import their JUnit results.

## Findings

- PCF-4537D66695 (P2, fact): No end-to-end tests found. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Write end-to-end tests (for example Playwright) for the declared critical journeys, run them in CI and import their JUnit results.
3. Add the regression protection: The end-to-end suite itself, run on every pull request and deployment.

## Acceptance criteria

- [ ] At least one end-to-end suite runs and all its cases pass in imported results.
- [ ] Control PC-C-08 evaluates PASS on retest.
- [ ] Finding PCF-4537D66695 (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
