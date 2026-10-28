# WP-PC-S-12: Fix PC-S-12: A privacy notice is available

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **yes** · Source run: PCR-20261014T100000Z-4619B7

## Objective

Publish a privacy notice describing data collected, purposes, processors and retention; link it from the footer.

## Findings

- PCF-9901AF5D1D (P2, fact): No reachable privacy notice. at `http://127.0.0.1:4785/`

## Where to look

- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Inspect each location listed in context.
2. Publish a privacy notice describing data collected, purposes, processors and retention; link it from the footer.
3. Add the regression protection: End-to-end link check.

## Acceptance criteria

- [ ] A privacy page is reachable from the entry page.
- [ ] Control PC-S-12 evaluates PASS on retest.
- [ ] Finding PCF-9901AF5D1D (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
