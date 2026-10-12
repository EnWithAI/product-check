# WP-PC-S-08: Fix PC-S-08: Cookies are set with Secure, HttpOnly and SameSite

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-DAFCB5

## Objective

Set Secure, HttpOnly (for session cookies) and SameSite=Lax/Strict on all cookies.

## Findings

- PCF-1E72F2F7B0 (P2, fact): session missing SameSite, HttpOnly at `http://127.0.0.1:4785/`

## Where to look

- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Set Secure, HttpOnly (for session cookies) and SameSite=Lax/Strict on all cookies.
3. Add the regression protection: Header assertion test on Set-Cookie.

## Acceptance criteria

- [ ] All observed cookies carry the expected attributes.
- [ ] Control PC-S-08 evaluates PASS on retest.
- [ ] Finding PCF-1E72F2F7B0 (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
