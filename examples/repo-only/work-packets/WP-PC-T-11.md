# WP-PC-T-11: Fix PC-T-11: Database schema changes are versioned

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **yes** · Source run: PCR-20261014T100000Z-EBF5A5

## Objective

Generate migrations with the ORM/database tool (prisma migrate, drizzle-kit, supabase migration) and commit them.

## Findings

- PCF-2E884D06D5 (P2, inference): Schema changes are not versioned as migrations. at `prisma/schema.prisma`

## Where to look

- `prisma/schema.prisma`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.
- Security- or data-sensitive change: a human must review and approve before merge.

## Suggested steps

1. Inspect each location listed in context.
2. Generate migrations with the ORM/database tool (prisma migrate, drizzle-kit, supabase migration) and commit them.
3. Add the regression protection: CI applies migrations to a fresh database.

## Acceptance criteria

- [ ] A migrations directory exists with at least one migration.
- [ ] Control PC-T-11 evaluates PASS on retest.
- [ ] Finding PCF-2E884D06D5 (prisma/schema.prisma) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
