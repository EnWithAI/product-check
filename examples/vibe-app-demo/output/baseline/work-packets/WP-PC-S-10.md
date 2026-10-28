# WP-PC-S-10: Fix PC-S-10: Server and framework versions are not disclosed

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-D74DF2

## Objective

Disable X-Powered-By (Next.js: \`poweredByHeader: false\`; Express: \`app.disable('x-powered-by')\`) and strip versions from Server.

## Findings

- PCF-2FD01AC810 (P3, fact): X-Powered-By: Next.js at `http://127.0.0.1:4785/`

## Where to look

- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Disable X-Powered-By (Next.js: \`poweredByHeader: false\`; Express: \`app.disable('x-powered-by')\`) and strip versions from Server.
3. Add the regression protection: Header assertion test.

## Acceptance criteria

- [ ] No X-Powered-By header; Server header without version numbers.
- [ ] Control PC-S-10 evaluates PASS on retest.
- [ ] Finding PCF-2FD01AC810 (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
