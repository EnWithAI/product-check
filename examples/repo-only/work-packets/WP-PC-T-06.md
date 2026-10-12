# WP-PC-T-06: Fix PC-T-06: Setup and run instructions are documented

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-36EE7E

## Objective

Add a README section with prerequisites, install, environment variables (names only) and run/test commands.

## Findings

- PCF-83CA52EEEB (P3, fact): README does not explain how to install and run. at `README.md`

## Where to look

- `README.md`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Add a README section with prerequisites, install, environment variables (names only) and run/test commands.
3. Add the regression protection: Review checklist item for setup changes.

## Acceptance criteria

- [ ] README contains install and run instructions.
- [ ] Control PC-T-06 evaluates PASS on retest.
- [ ] Finding PCF-83CA52EEEB (README.md) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
