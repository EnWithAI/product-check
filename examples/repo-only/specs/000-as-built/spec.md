# Feature Specification: Vibe Notes (synthetic demo, source only) (as built)

**Feature Branch**: `000-as-built`

**Created**: 2026-10-14

**Status**: Draft (reverse-engineered)

**Input**: Repository `Vibe Notes (synthetic demo, source only)` at commit `d1d8f2bd3ac2`, read by Product Check `0.1.0`

> **Reverse-engineered, not authored.** Product Check derived this specification from the repository's structure
> without running it. _observed_ statements point at a file and line; _inferred_ ones interpret what was found;
> anything the code cannot tell us is marked `NEEDS CLARIFICATION`. Confirm or correct each statement before
> treating this as the product's specification.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Home and top-level pages (Priority: P2)

**Purpose**: [NEEDS CLARIFICATION: who uses the Home and top-level pages area, and what outcome must it deliver?]

Covers FR-001.

### User Story 2 - Notes (Priority: P2)

**Purpose**: [NEEDS CLARIFICATION: who uses the Notes area, and what outcome must it deliver?]

Covers FR-002.

### Edge Cases

- [NEEDS CLARIFICATION: no edge or error cases could be found in the repository]

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST serve the page `/`. _(observed)_ Source: `app/page.tsx:1`.
- **FR-002**: The system MUST handle `GET` requests to `/api/notes`. _(observed)_ Source: `app/api/notes/route.ts:3`.
- **FR-003**: The system MUST persist `Note` records (fields: id, owner, html). _(observed)_ Source: `prisma/schema.prisma:5`.
- **FR-004**: The system MUST integrate with `@supabase/supabase-js` (data). _(observed)_ Source: `package.json:9`.
- **FR-005**: The system MUST integrate with `openai` (ai). _(observed)_ Source: `package.json:10`.
- **FR-006**: The system MUST integrate with `prisma` (data). _(observed)_ Source: `package.json:11`.
- **FR-007**: The system MUST be configured through 4 environment variable(s): `DATABASE_URL`, `NEXT_PUBLIC_OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`. `NEXT_PUBLIC_OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` are exposed to the browser bundle and MUST NOT hold secrets. _(observed)_ Source: `lib/db.ts:2`, `app/page.tsx:6`, `lib/supabase.ts:4` and 1 more.

### Non-Functional Requirements

- **NFR-001**: [NEEDS CLARIFICATION: response-time and throughput targets for the main pages and endpoints] _(needs confirmation)_
- **NFR-002**: [NEEDS CLARIFICATION: availability target and acceptable downtime] _(needs confirmation)_
- **NFR-003**: [NEEDS CLARIFICATION: how long personal and business data is kept, and how it is deleted] _(needs confirmation)_

### Key Entities

- **Note**: fields: id, owner, html (`prisma/schema.prisma:5`)

## Success Criteria _(mandatory)_

- **SC-001**: [NEEDS CLARIFICATION: measurable outcomes cannot be derived from source code; state the targets this product must meet] _(needs confirmation)_

## Clarifications needed

- Purpose of the Home and top-level pages area: who uses it, and what outcome it must deliver.
- Purpose of the Notes area: who uses it, and what outcome it must deliver.

## Uncertainties

- Purpose, users, priorities and business rules are not derivable from code; every story carries a clarification for them.
- Nothing was executed: requirements describe what the code declares, not verified behaviour.
- Configuration is listed by variable name only; values were never read.

## Appendix: as-built surface

### Pages

| Route | Kind | Source | Auth helper |
|---|---|---|---|
| `/` | Next.js app router page | `app/page.tsx:1` | — |

### Endpoints

| Method | Path | Kind | Source | Auth helper |
|---|---|---|---|---|
| `GET` | `/api/notes` | Next.js route handler | `app/api/notes/route.ts:3` | — |

### Data entities

| Entity | Detail | Source |
|---|---|---|
| `Note` | fields: id, owner, html | `prisma/schema.prisma:5` |

### Integrations

| Package | Category | Declared in |
|---|---|---|
| `@supabase/supabase-js` | data | `package.json:9` |
| `openai` | ai | `package.json:10` |
| `prisma` | data | `package.json:11` |

### Configuration (names only)

| Variable | Use | First reference |
|---|---|---|
| `DATABASE_URL` | server-side; 1 reference(s) | `lib/db.ts:2` |
| `NEXT_PUBLIC_OPENAI_API_KEY` | exposed to the browser bundle; 1 reference(s) | `app/page.tsx:6` |
| `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | exposed to the browser bundle; 1 reference(s) | `lib/supabase.ts:4` |
| `NEXT_PUBLIC_SUPABASE_URL` | exposed to the browser bundle; 1 reference(s) | `lib/supabase.ts:5` |

Generated 2026-10-14T10:00:00.000Z · 10 surface item(s) · 10 evidence item(s) in as-built-spec.json
