# WP-PC-S-06: Fix PC-S-06: Clickjacking protection is set

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-4619B7

## Objective

Send \`Content-Security-Policy: frame-ancestors 'self'\` (or X-Frame-Options: DENY).

## Findings

- PCF-CEED9100D9 (P2, fact): No X-Frame-Options and no CSP frame-ancestors. at `http://127.0.0.1:4785/`

## Where to look

- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Send \`Content-Security-Policy: frame-ancestors 'self'\` (or X-Frame-Options: DENY).
3. Add the regression protection: Header assertion test.

## Acceptance criteria

- [ ] frame-ancestors or X-Frame-Options present.
- [ ] Control PC-S-06 evaluates PASS on retest.
- [ ] Finding PCF-CEED9100D9 (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
