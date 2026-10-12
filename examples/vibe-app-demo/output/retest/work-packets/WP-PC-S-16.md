# WP-PC-S-16: Fix PC-S-16: No high-risk code patterns

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **yes** · Source run: PCR-20261015T100000Z-96021F

## Objective

Replace eval/new Function; sanitise HTML (DOMPurify) or render text; use parameterised queries / the ORM's safe API.

## Findings

- PCF-70B846CB03 (P2, hypothesis): raw HTML injection of a non-literal value at app/page.tsx:23. Whether untrusted data reaches it was not determined. at `app/page.tsx:23`
- PCF-C7E301195D (P2, hypothesis): SQL built with string interpolation at lib/db.ts:5. Whether untrusted data reaches it was not determined. at `lib/db.ts:5`

## Where to look

- `app/page.tsx:23`
- `lib/db.ts:5`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Inspect each location listed in context.
2. Replace eval/new Function; sanitise HTML (DOMPurify) or render text; use parameterised queries / the ORM's safe API.
3. Add the regression protection: Lint rules (no-eval, react/no-danger) and a test with a malicious payload for each fixed path.

## Acceptance criteria

- [ ] Each listed location is fixed or documented as handling only trusted constants.
- [ ] Control PC-S-16 evaluates PASS on retest.
- [ ] Finding PCF-70B846CB03 (app/page.tsx:23) is no longer observed on retest.
- [ ] Finding PCF-C7E301195D (lib/db.ts:5) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
