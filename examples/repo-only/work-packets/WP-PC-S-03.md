# WP-PC-S-03: Fix PC-S-03: Environment files are excluded from version control

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **yes** · Source run: PCR-20261014T100000Z-078FC3

## Objective

Add \`.env\*\` (with \`!.env.example\`) to .gitignore and \`git rm --cached\` any tracked env file; rotate values that were committed.

## Findings

- PCF-AC6E17E07C (P1, fact): .env.local is tracked in the git index (committed or staged). at `.env.local`

## Where to look

- `.env.local`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Inspect each location listed in context.
2. Add \`.env\*\` (with \`!.env.example\`) to .gitignore and \`git rm --cached\` any tracked env file; rotate values that were committed.
3. Add the regression protection: Secret-scanning pre-commit hook.

## Acceptance criteria

- [ ] .gitignore ignores .env files.
- [ ] No .env file (other than examples) is tracked.
- [ ] Control PC-S-03 evaluates PASS on retest.
- [ ] Finding PCF-AC6E17E07C (.env.local) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
