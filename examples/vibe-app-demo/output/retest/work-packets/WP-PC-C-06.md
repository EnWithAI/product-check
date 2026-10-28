# WP-PC-C-06: Fix PC-C-06: Unknown URLs return a real 404 page

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-B68F0A

## Objective

Return status 404 with a helpful not-found page for unknown routes (for SPAs, configure the host's fallback to send 404 for unknown non-app paths or render a not-found view).

## Findings

- PCF-3D0D04F8EA (P3, fact): Unknown path answered 200. at `http://127.0.0.1:4785/product-check-not-found-7b6863e0c6c2`

## Where to look

- `http://127.0.0.1:4785/product-check-not-found-7b6863e0c6c2`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Return status 404 with a helpful not-found page for unknown routes (for SPAs, configure the host's fallback to send 404 for unknown non-app paths or render a not-found view).
3. Add the regression protection: Smoke test requesting a random path and asserting 404.

## Acceptance criteria

- [ ] GET \<origin\>/\<random path\> returns 404.
- [ ] Control PC-C-06 evaluates PASS on retest.
- [ ] Finding PCF-3D0D04F8EA (http://127.0.0.1:4785/product-check-not-found-7b6863e0c6c2) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
