# WP-PC-T-09: Fix PC-T-09: Dependency versions are bounded

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-078FC3

## Objective

Replace open-ended ranges with explicit versions (and keep the lockfile).

## Findings

- PCF-14B347C463 (P3, fact): @​supabase/supabase-js is declared as "latest". at `package.json:9`
- PCF-C205AFB621 (P3, fact): openai is declared as "\*". at `package.json:10`

## Where to look

- `package.json:9`
- `package.json:10`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Replace open-ended ranges with explicit versions (and keep the lockfile).
3. Add the regression protection: Automated dependency-update tool opening reviewed pull requests.

## Acceptance criteria

- [ ] No "\*", "latest", empty or unpinned URL versions in manifests.
- [ ] Control PC-T-09 evaluates PASS on retest.
- [ ] Finding PCF-14B347C463 (package.json:9) is no longer observed on retest.
- [ ] Finding PCF-C205AFB621 (package.json:10) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
