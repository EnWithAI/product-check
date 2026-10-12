# WP-PC-T-08: Fix PC-T-08: Static type checking or linting is configured

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-DAFCB5

## Objective

Enable TypeScript strict mode and/or a linter (ESLint, Biome, Ruff) and run it in CI.

## Findings

- PCF-9C547F7002 (P3, fact): No strict type checking or linter configuration found. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Enable TypeScript strict mode and/or a linter (ESLint, Biome, Ruff) and run it in CI.
3. Add the regression protection: Lint/typecheck CI step.

## Acceptance criteria

- [ ] tsconfig has strict: true or a linter configuration exists.
- [ ] Control PC-T-08 evaluates PASS on retest.
- [ ] Finding PCF-9C547F7002 (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
