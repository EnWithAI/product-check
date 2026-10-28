# WP-PC-S-09: Fix PC-S-09: No sensitive files are publicly served

> DEMO DATA: synthetic example application.

Status: **VERIFIED** · Human approval required: **yes** · Source run: PCR-20261015T100000Z-B68F0A

## Objective

Stop serving the project root: publish only the build output directory, block dotfiles at the edge, and rotate any exposed secrets.

## Findings

- PCF-222F650216 (P0, fact): /.env is publicly served and looks like env-assignments. Content was not stored. at `http://127.0.0.1:4785/.env`

## Where to look

- `http://127.0.0.1:4785/.env`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Rotate every secret in the exposed file.
2. Change the hosting publish directory to the build output.
3. Add an edge rule denying /.\*

## Acceptance criteria

- [ ] Each probed path returns 404/403 or non-matching content.
- [ ] Control PC-S-09 evaluates PASS on retest.
- [ ] Finding PCF-222F650216 (http://127.0.0.1:4785/.env) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
