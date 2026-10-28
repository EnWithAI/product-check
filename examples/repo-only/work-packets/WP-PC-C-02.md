# WP-PC-C-02: Fix PC-C-02: Page language is declared

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-078FC3

## Objective

Add a lang attribute (for example lang="en") to the root \<html\> element of every document template.

## Findings

- PCF-2D30FA9048 (P3, fact): \<html\> has no lang attribute. at `app/layout.tsx:5`

## Where to look

- `app/layout.tsx:5`

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

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
