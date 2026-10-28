# WP-PC-S-02: Fix PC-S-02: No server secrets are exposed through public environment prefixes

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **yes** · Source run: PCR-20261014T100000Z-4619B7

## Objective

Rename the variable without the public prefix, move the privileged call into a server route/function, rotate the key, and give the client only publishable keys.

## Findings

- PCF-63B9B21478 (P0, inference): NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. at `lib/supabase.ts:4`
- PCF-6AE991A057 (P0, inference): NEXT\_PUBLIC\_OPENAI\_API\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. at `.env.local:3`
- PCF-E8ACA75BD3 (P0, inference): NEXT\_PUBLIC\_OPENAI\_API\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. at `app/page.tsx:6`

## Where to look

- `lib/supabase.ts:4`
- `.env.local:3`
- `app/page.tsx:6`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Rotate the key.
2. Create a server route that performs the privileged operation with authorization checks.
3. Update client code to call that route.
4. Remove the public-prefixed variable everywhere.

## Acceptance criteria

- [ ] No secret-named variable with a public prefix in source or env files.
- [ ] Rotated key confirmed by a human.
- [ ] Control PC-S-02 evaluates PASS on retest.
- [ ] Finding PCF-63B9B21478 (lib/supabase.ts:4) is no longer observed on retest.
- [ ] Finding PCF-6AE991A057 (.env.local:3) is no longer observed on retest.
- [ ] Finding PCF-E8ACA75BD3 (app/page.tsx:6) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
