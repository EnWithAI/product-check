# WP-PC-S-07: Fix PC-S-07: MIME-type sniffing is disabled

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-B68F0A

## Objective

Send \`X-Content-Type-Options: nosniff\` on all responses.

## Findings

- PCF-026FD4A0D8 (P3, fact): No X-Content-Type-Options header. at `http://127.0.0.1:4785/`

## Where to look

- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Send \`X-Content-Type-Options: nosniff\` on all responses.
3. Add the regression protection: Header assertion test.

## Acceptance criteria

- [ ] Header present with value nosniff.
- [ ] Control PC-S-07 evaluates PASS on retest.
- [ ] Finding PCF-026FD4A0D8 (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
