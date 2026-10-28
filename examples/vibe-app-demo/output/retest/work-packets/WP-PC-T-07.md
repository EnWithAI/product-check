# WP-PC-T-07: Fix PC-T-07: Runtime version is declared

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-B68F0A

## Objective

Declare the runtime version (for example "engines": {"node": "\>=22"} and an .nvmrc).

## Findings

- PCF-2BBFB74CD4 (P3, fact): No runtime version declaration found. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Declare the runtime version (for example "engines": {"node": "\>=22"} and an .nvmrc).
3. Add the regression protection: CI uses the declared version file.

## Acceptance criteria

- [ ] A runtime version declaration exists.
- [ ] Control PC-T-07 evaluates PASS on retest.
- [ ] Finding PCF-2BBFB74CD4 (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
