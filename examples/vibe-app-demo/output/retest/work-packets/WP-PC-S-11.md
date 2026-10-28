# WP-PC-S-11: Fix PC-S-11: A security contact is published

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **no** · Source run: PCR-20261015T100000Z-248001

## Objective

Publish /.well-known/security.txt (RFC 9116) and/or SECURITY.md with a contact address.

## Findings

- PCF-2EFAD2152B (P3, fact): No published security contact. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Publish /.well-known/security.txt (RFC 9116) and/or SECURITY.md with a contact address.
3. Add the regression protection: Release checklist item.

## Acceptance criteria

- [ ] security.txt with Contact or SECURITY.md exists.
- [ ] Control PC-S-11 evaluates PASS on retest.
- [ ] Finding PCF-2EFAD2152B (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
