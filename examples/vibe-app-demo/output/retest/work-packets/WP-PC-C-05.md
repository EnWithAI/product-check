# WP-PC-C-05: Fix PC-C-05: Entry page has a meaningful title

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-96021F

## Objective

Set a product-specific title (and description) in the root metadata.

## Findings

- PCF-5B93B2ED59 (P3, fact): Starter-template title "Create Next App". at `http://127.0.0.1:4785/`

## Where to look

- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Set a product-specific title (and description) in the root metadata.
3. Add the regression protection: End-to-end assertion on the page title.

## Acceptance criteria

- [ ] The entry page \<title\> is non-empty and not a known starter default.
- [ ] Control PC-C-05 evaluates PASS on retest.
- [ ] Finding PCF-5B93B2ED59 (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
