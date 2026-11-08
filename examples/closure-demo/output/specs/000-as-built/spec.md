# Feature Specification: Vibe Invoices (synthetic demo) (as built)

**Feature Branch**: `000-as-built`

**Created**: 2026-11-08

**Status**: Draft (reverse-engineered)

**Input**: Repository `Vibe Invoices (synthetic demo)` at commit `28d05afb57f3`, read by Product Check `0.2.0`

> **Reverse-engineered, not authored.** Product Check derived this specification from the repository's structure
> without running it. _observed_ statements point at a file and line; _inferred_ ones interpret what was found;
> anything the code cannot tell us is marked `NEEDS CLARIFICATION`. Confirm or correct each statement before
> treating this as the product's specification.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Checkout (Priority: P2)

**Purpose**: [NEEDS CLARIFICATION: who uses the Checkout area, and what outcome must it deliver?]

Covers FR-001.

### User Story 2 - Invoices (Priority: P2)

**Purpose**: [NEEDS CLARIFICATION: who uses the Invoices area, and what outcome must it deliver?]

Covers FR-002.

### Other behaviour described by tests _(inferred)_

- no secret key in client code (`test/secret.test.mjs:4`)
- total (`test/total.test.mjs:3`)

### Edge Cases

- [NEEDS CLARIFICATION: no edge or error cases could be found in the repository]

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST serve the page `/checkout`. _(observed)_ Source: `app/checkout/page.tsx:1`.
- **FR-002**: The system MUST handle `GET` requests to `/api/invoices`. The handler references an authentication helper, so access is likely limited to signed-in users. _(inferred)_ Source: `app/api/invoices/route.ts:2`.
- **FR-003**: The system MUST be configured through 1 environment variable(s): `STRIPE_SECRET_KEY`. _(observed)_ Source: `app/lib/config.ts:1`.

### Non-Functional Requirements

- **NFR-001**: [NEEDS CLARIFICATION: response-time and throughput targets for the main pages and endpoints] _(needs confirmation)_
- **NFR-002**: [NEEDS CLARIFICATION: availability target and acceptable downtime] _(needs confirmation)_
- **NFR-003**: [NEEDS CLARIFICATION: how long personal and business data is kept, and how it is deleted] _(needs confirmation)_

## Success Criteria _(mandatory)_

- **SC-001**: [NEEDS CLARIFICATION: measurable outcomes cannot be derived from source code; state the targets this product must meet] _(needs confirmation)_

## Clarifications needed

- Purpose of the Checkout area: who uses it, and what outcome it must deliver.
- Purpose of the Invoices area: who uses it, and what outcome it must deliver.

## Uncertainties

- Purpose, users, priorities and business rules are not derivable from code; every story carries a clarification for them.
- Nothing was executed: requirements describe what the code declares, not verified behaviour.
- 2 test title(s) could not be matched to a route area and are listed separately.
- Configuration is listed by variable name only; values were never read.

## Appendix: as-built surface

### Pages

| Route | Kind | Source | Auth helper |
|---|---|---|---|
| `/checkout` | Next.js app router page | `app/checkout/page.tsx:1` | — |

### Endpoints

| Method | Path | Kind | Source | Auth helper |
|---|---|---|---|---|
| `GET` | `/api/invoices` | Next.js route handler | `app/api/invoices/route.ts:2` | yes (inferred) |

### Configuration (names only)

| Variable | Use | First reference |
|---|---|---|
| `STRIPE_SECRET_KEY` | server-side; 1 reference(s) | `app/lib/config.ts:1` |

Generated 2026-11-08T07:51:00.648Z · 5 surface item(s) · 5 evidence item(s) in as-built-spec.json
