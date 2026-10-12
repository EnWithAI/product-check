# WP-PC-S-01: Fix PC-S-01: No credentials are committed in source

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **yes** · Source run: PCR-20261014T100000Z-DAFCB5

## Objective

Rotate (revoke and reissue) every exposed credential first, then move it to environment variables / the hosting secret store and remove it from the code. Treat the history as compromised.

## Findings

- PCF-484BD31627 (P0, fact): A Stripe secret key appears at .env.local:4; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses credentials). at `.env.local:4`
- PCF-4DF8A34CE8 (P0, fact): A service-role JWT (bypasses row-level security) appears at lib/supabase.ts:4; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses credentials). at `lib/supabase.ts:4`
- PCF-6F76AC0627 (P0, fact): A credentials embedded in a connection URL appears at .env.local:5; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses credentials). at `.env.local:5`

## Where to look

- `.env.local:4`
- `lib/supabase.ts:4`
- `.env.local:5`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Revoke and reissue each credential at its provider.
2. Replace literals with process.env lookups on the server.
3. Add the secret file patterns to .gitignore.
4. Optionally purge history (git filter-repo) after rotation.

## Acceptance criteria

- [ ] Each listed credential has been rotated at its provider (human confirmation).
- [ ] No secret pattern matches in repository files.
- [ ] Control PC-S-01 evaluates PASS on retest.
- [ ] Finding PCF-484BD31627 (.env.local:4) is no longer observed on retest.
- [ ] Finding PCF-4DF8A34CE8 (lib/supabase.ts:4) is no longer observed on retest.
- [ ] Finding PCF-6F76AC0627 (.env.local:5) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
