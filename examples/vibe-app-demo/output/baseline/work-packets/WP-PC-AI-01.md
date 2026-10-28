# WP-PC-AI-01: Fix PC-AI-01: AI provider calls run server-side only

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **yes** · Source run: PCR-20261014T100000Z-4619B7

## Objective

Move AI calls into a server route with authentication, rate limiting and input validation; rotate the key.

## Findings

- PCF-E2CE361289 (P0, fact): app/page.tsx enables dangerouslyAllowBrowser; the provider key must then be available in the browser. at `app/page.tsx:6`

## Where to look

- `app/page.tsx:6`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Inspect each location listed in context.
2. Move AI calls into a server route with authentication, rate limiting and input validation; rotate the key.
3. Add the regression protection: Lint rule forbidding AI SDK imports in client code.

## Acceptance criteria

- [ ] No AI SDK import in client-side files; no dangerouslyAllowBrowser.
- [ ] Control PC-AI-01 evaluates PASS on retest.
- [ ] Finding PCF-E2CE361289 (app/page.tsx:6) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
