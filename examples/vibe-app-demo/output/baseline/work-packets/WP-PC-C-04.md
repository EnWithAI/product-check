# WP-PC-C-04: Fix PC-C-04: Images have text alternatives

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-D74DF2

## Objective

Add meaningful alt text to informative images and alt="" to decorative ones.

## Findings

- PCF-5C358D43AB (P2, fact): 1 image(s) without alt. at `http://127.0.0.1:4785/`
- PCF-E0A3F8E153 (P2, fact): \<img\> without alt. at `app/page.tsx:20`

## Where to look

- `http://127.0.0.1:4785/`
- `app/page.tsx:20`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Add meaningful alt text to informative images and alt="" to decorative ones.
3. Add the regression protection: Enable jsx-a11y/alt-text (or an equivalent) in lint and CI.

## Acceptance criteria

- [ ] No \<img\>/\<Image\> element without an alt attribute in the listed locations.
- [ ] Control PC-C-04 evaluates PASS on retest.
- [ ] Finding PCF-5C358D43AB (http://127.0.0.1:4785/) is no longer observed on retest.
- [ ] Finding PCF-E0A3F8E153 (app/page.tsx:20) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
