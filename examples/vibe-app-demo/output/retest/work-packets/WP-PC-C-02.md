# WP-PC-C-02: Fix PC-C-02: Page language is declared

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-96021F

## Objective

Add a lang attribute (for example lang="en") to the root \<html\> element of every document template.

## Findings

- PCF-2D30FA9048 (P3, fact): \<html\> has no lang attribute. at `app/layout.tsx:5`
- PCF-A355BF9FA1 (P3, fact): Served \<html\> has no lang attribute. at `http://127.0.0.1:4785/`

## Where to look

- `app/layout.tsx:5`
- `http://127.0.0.1:4785/`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Add a lang attribute (for example lang="en") to the root \<html\> element of every document template.
3. Add the regression protection: An accessibility lint rule (for example jsx-a11y/html-has-lang) or an end-to-end assertion on document.documentElement.lang.

## Acceptance criteria

- [ ] Every \<html\> element in templates and the served page has a non-empty lang attribute.
- [ ] Control PC-C-02 evaluates PASS on retest.
- [ ] Finding PCF-2D30FA9048 (app/layout.tsx:5) is no longer observed on retest.
- [ ] Finding PCF-A355BF9FA1 (http://127.0.0.1:4785/) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
