# WP-PC-S-17: Fix PC-S-17: No credentialed wildcard CORS

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-4619B7

## Objective

Allow-list the product's own origins; never combine wildcard/reflected origins with credentials.

## Findings

- PCF-CDCE917FE3 (P2, hypothesis): CORS allows any (or reflected) origin and credentials in the same file. at `app/api/notes/route.ts:2`

## Where to look

- `app/api/notes/route.ts:2`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Allow-list the product's own origins; never combine wildcard/reflected origins with credentials.
3. Add the regression protection: Integration test sending a foreign Origin header.

## Acceptance criteria

- [ ] CORS configuration lists explicit origins.
- [ ] Control PC-S-17 evaluates PASS on retest.
- [ ] Finding PCF-CDCE917FE3 (app/api/notes/route.ts:2) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
