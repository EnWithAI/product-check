# Feature Specification: Vibe Notes (synthetic demo) (as built)

**Feature Branch**: `000-as-built`

**Created**: 2026-10-15

**Status**: Draft (reverse-engineered)

**Input**: Repository `Vibe Notes (synthetic demo)` at commit `56b23fac4391`, read by Product Check `0.1.0`

> **Reverse-engineered, not authored.** Product Check derived this specification from the repository's structure
> without running it. _observed_ statements point at a file and line; _inferred_ ones interpret what was found;
> anything the code cannot tell us is marked `NEEDS CLARIFICATION`. Confirm or correct each statement before
> treating this as the product's specification.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Home and top-level pages (Priority: P2)

**Purpose**: [NEEDS CLARIFICATION: who uses the Home and top-level pages area, and what outcome must it deliver?]

Covers FR-001.

### User Story 2 - Notes (Priority: P1)

**Purpose**: [NEEDS CLARIFICATION: who uses the Notes area, and what outcome must it deliver?]

Declared critical journey: Sign up and create a first note.

Covers FR-002.

**Behaviour described by tests** _(inferred; convert to Given/When/Then once confirmed)_:

- authz: anonymous requests to /api/notes are rejected
- onboarding: a new user can sign up and create a first note

### User Story 3 - Privacy (Priority: P2)

**Purpose**: [NEEDS CLARIFICATION: who uses the Privacy area, and what outcome must it deliver?]

Covers FR-003.

### User Story 4 - Summarize (Priority: P1)

**Purpose**: [NEEDS CLARIFICATION: who uses the Summarize area, and what outcome must it deliver?]

Declared critical journey: Summarize a note with AI.

Covers FR-004.

**Behaviour described by tests** _(inferred; convert to Given/When/Then once confirmed)_:

- unit: summary input is clipped to 4000 characters

### Edge Cases

- Requests for unknown routes show a dedicated not-found page. _(observed)_
- A test describes this case: authz: anonymous requests to /api/notes are rejected (`tests/security/authz.test.mjs:15`). _(inferred)_

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST serve the page `/`. _(observed)_ Source: `app/page.tsx:1`.
- **FR-002**: The system MUST handle `GET` requests to `/api/notes`. _(observed)_ Source: `app/api/notes/route.ts:2`.
- **FR-003**: The system MUST serve the page `/privacy`. _(observed)_ Source: `app/privacy/page.tsx:1`.
- **FR-004**: The system MUST handle `POST` requests to `/api/summarize`. _(observed)_ Source: `app/api/summarize/route.ts:3`.
- **FR-005**: The system MUST persist `Note` records (fields: id, owner, html; defined in 2 places). _(observed)_ Source: `prisma/migrations/0001_init/migration.sql:1`, `prisma/schema.prisma:5`.
- **FR-006**: The system MUST integrate with `@supabase/supabase-js` (data). _(observed)_ Source: `package.json:10`.
- **FR-007**: The system MUST integrate with `openai` (ai). _(observed)_ Source: `package.json:11`.
- **FR-008**: The system MUST integrate with `prisma` (data). _(observed)_ Source: `package.json:12`.
- **FR-009**: The system MUST be configured through 4 environment variable(s): `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. `NEXT_PUBLIC_SUPABASE_URL` is exposed to the browser bundle and MUST NOT hold secrets. _(observed)_ Source: `lib/db.ts:2`, `lib/supabase-server.ts:3`, `app/api/summarize/route.ts:2` and 1 more.

### Non-Functional Requirements

- **NFR-001**: The system MUST run on the declared runtime (`engines.node = >=22`). _(observed)_ Evidence: EV-CE87AC89A4BB.
- **NFR-002**: Responses MUST carry the HTTP headers configured in `next.config.mjs` (Next.js headers() configuration). _(observed)_ Evidence: EV-291D4005C074.
- **NFR-003**: [NEEDS CLARIFICATION: response-time and throughput targets for the main pages and endpoints] _(needs confirmation)_
- **NFR-004**: [NEEDS CLARIFICATION: availability target and acceptable downtime] _(needs confirmation)_
- **NFR-005**: [NEEDS CLARIFICATION: how long personal and business data is kept, and how it is deleted] _(needs confirmation)_

### Key Entities

- **Note**: fields: id, owner, html (`prisma/migrations/0001_init/migration.sql:1`, `prisma/schema.prisma:5`)

## Success Criteria _(mandatory)_

- **SC-001**: [NEEDS CLARIFICATION: measurable outcomes cannot be derived from source code; state the targets this product must meet] _(needs confirmation)_
- **SC-002**: The 1 end-to-end test file(s) pass on every release candidate (for example `tests/e2e/onboarding.test.mjs`). _(inferred)_ Evidence: EV-B8953F455111.

## Clarifications needed

- Purpose of the Home and top-level pages area: who uses it, and what outcome it must deliver.
- Purpose of the Notes area: who uses it, and what outcome it must deliver.
- Purpose of the Privacy area: who uses it, and what outcome it must deliver.
- Purpose of the Summarize area: who uses it, and what outcome it must deliver.

## Uncertainties

- Purpose, users, priorities and business rules are not derivable from code; every story carries a clarification for them.
- Nothing was executed: requirements describe what the code declares, not verified behaviour.
- Configuration is listed by variable name only; values were never read.

## Appendix: as-built surface

### Pages

| Route | Kind | Source | Auth helper |
|---|---|---|---|
| `/` | Next.js app router page | `app/page.tsx:1` | — |
| `/privacy` | Next.js app router page | `app/privacy/page.tsx:1` | — |

### Endpoints

| Method | Path | Kind | Source | Auth helper |
|---|---|---|---|---|
| `GET` | `/api/notes` | Next.js route handler | `app/api/notes/route.ts:2` | — |
| `POST` | `/api/summarize` | Next.js route handler | `app/api/summarize/route.ts:3` | — |

### Data entities

| Entity | Detail | Source |
|---|---|---|
| `Note` | SQL table | `prisma/migrations/0001_init/migration.sql:1` |
| `Note` | fields: id, owner, html | `prisma/schema.prisma:5` |

### Integrations

| Package | Category | Declared in |
|---|---|---|
| `@supabase/supabase-js` | data | `package.json:10` |
| `openai` | ai | `package.json:11` |
| `prisma` | data | `package.json:12` |

### Configuration (names only)

| Variable | Use | First reference |
|---|---|---|
| `DATABASE_URL` | server-side; 1 reference(s) | `lib/db.ts:2` |
| `NEXT_PUBLIC_SUPABASE_URL` | exposed to the browser bundle; 1 reference(s) | `lib/supabase-server.ts:3` |
| `OPENAI_API_KEY` | server-side; 1 reference(s) | `app/api/summarize/route.ts:2` |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side; 1 reference(s) | `lib/supabase-server.ts:3` |

Generated 2026-10-15T10:00:00.000Z · 16 surface item(s) · 20 evidence item(s) in as-built-spec.json
