# WP-PC-T-02: Fix PC-T-02: Automated tests exist

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-D74DF2

## Objective

Add a test runner (for example Vitest or Jest) with a \`test\` script and start with tests for the riskiest logic.

## Findings

- PCF-0BD32ABB20 (P2, fact): No automated test files found. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Install a test runner as a dev dependency.
2. Add a \`test\` script.
3. Write tests for authentication, payments and data-writing code first.

## Acceptance criteria

- [ ] Test files exist and \`npm test\` (or equivalent) is defined.
- [ ] Control PC-T-02 evaluates PASS on retest.
- [ ] Finding PCF-0BD32ABB20 (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
