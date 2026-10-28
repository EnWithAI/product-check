# Product Check report: Vibe Notes (synthetic demo)

> **DEMO DATA.** This assessment ran on a synthetic example application. It says nothing about any real product.

**Verdict: READY_WITH_CONDITIONS** at CT-T2 (Pre-Launch Assurance), tier wording "CONDITIONAL".

- 2 open P2 finding(s).

_Applies only to repository "Vibe Notes (synthetic demo)" at revision 56b23fac4391 and application http://127.0.0.1:4785 as observed 2026-10-15T09:59:00.000Z, assessed 2026-10-15T10:00:00.000Z. 37 of 41 applicable controls were checked; 4 were blocked or not tested. A material change invalidates this verdict._

## Customer × Technology × Trust

Pillars are scored separately and never averaged. Untested controls lower coverage; they never count as passed.

| Pillar | Score | Coverage | Confidence | Trend | Pass | Partial | Fail | Blocked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| Customer | 100/100 | 92% | HIGH | +60 | 9 | 0 | 0 | 0 | 1 |
| Technology | 94/100 | 100% | MEDIUM | +90 | 10 | 0 | 1 | 0 | 0 |
| Trust | 97/100 | 83% | HIGH | +95 | 16 | 0 | 1 | 0 | 3 |

Open findings: P0 0 · P1 0 · P2 2 · P3 0 · accepted risks 0 · overall coverage 89%

## Hard gates

| Gate | Status | Controls |
|---|---|---|
| G-SECRETS: No exposed production secrets or client-side privileged keys | PASS | PC-S-01, PC-S-02, PC-S-09, PC-AI-01 |
| G-AUTHZ: No authentication or authorization bypass on privileged paths | PASS | PC-S-13 |
| G-ISOLATION: No cross-tenant or cross-user data exposure | PASS | PC-S-14 |

## What was inspected (points of presence)

| Point of presence | Status | Scope | Limitations |
|---|---|---|---|
| Source repository | AVAILABLE | local checkout (read-only) | — |
| Dependency manifests | AVAILABLE | local checkout (read-only) | — |
| Automated test sources | AVAILABLE | local checkout (read-only) | — |
| Executed test results | AVAILABLE | 1 imported results file(s) | Results were produced outside Product Check; their environment is not verified. |
| CI/CD configuration | AVAILABLE | local checkout (read-only) | — |
| Hosting / infrastructure configuration | NOT_APPLICABLE | local checkout (read-only) | No hosting or IaC files in the repository. |
| Database schema and migrations | AVAILABLE | local checkout (read-only) | Schema files only; the live database was not accessed. |
| Deployed web application | AVAILABLE | http://127.0.0.1:4785 (passive GET requests to fixed paths only) | Observations were recorded earlier and replayed. Unauthenticated pages only; no forms, logins or data-changing actions. |
| API definition (OpenAPI/GraphQL) | NOT_APPLICABLE | — | No API definition files found. |
| Production telemetry (logs, metrics, traces, alerts) | NOT_APPLICABLE | — | Not required before launch tiers (CT-T4+). |
| AI integration (SDKs, prompts, evals) | AVAILABLE | openai | Static inspection only; model behaviour was not exercised. |
| Documentation and specifications | AVAILABLE | local checkout (read-only) | — |
| Privacy and security policies | AVAILABLE | — | Presence only; policy content is not assessed (this is not a legal review). |

## Open findings (2)

| ID | Severity | Pillar | Finding | Location | Basis | Lifecycle | Work packet |
|---|---|---|---|---|---|---|---|
| PCF-3F928FCAF1 | P2 | Technology | No error monitoring | `package.json` | fact, medium confidence | PERSISTING | WP-PC-T-10 |
| PCF-B565960DEE | P2 | Trust | AI features have no evaluation suite | `repository` | fact, medium confidence | PERSISTING | WP-PC-AI-02 |

### Verified fixes (resolved on retest)

- PCF-222F650216 Sensitive file publicly served: /.env — verified in PCR-20261015T100000Z-248001
- PCF-484BD31627 Stripe secret key in .env.local — verified in PCR-20261015T100000Z-248001
- PCF-4DF8A34CE8 Service-role JWT (bypasses row-level security) in lib/supabase.ts — verified in PCR-20261015T100000Z-248001
- PCF-63B9B21478 Privileged key NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY exposed to the browser — verified in PCR-20261015T100000Z-248001
- PCF-6AE991A057 Privileged key NEXT\_PUBLIC\_OPENAI\_API\_KEY exposed to the browser — verified in PCR-20261015T100000Z-248001
- PCF-6F76AC0627 Credentials embedded in a connection URL in .env.local — verified in PCR-20261015T100000Z-248001
- PCF-E2CE361289 AI provider called from the browser in app/page.tsx — verified in PCR-20261015T100000Z-248001
- PCF-E8ACA75BD3 Privileged key NEXT\_PUBLIC\_OPENAI\_API\_KEY exposed to the browser — verified in PCR-20261015T100000Z-248001
- PCF-AC6E17E07C Environment file .env.local is committed — verified in PCR-20261015T100000Z-248001
- PCF-0BD32ABB20 No automated tests — verified in PCR-20261015T100000Z-248001
- PCF-1E72F2F7B0 Cookies lack security attributes — verified in PCR-20261015T100000Z-248001
- PCF-2E884D06D5 Database schema changes are not versioned — verified in PCR-20261015T100000Z-248001
- PCF-3E3C906C89 No CI pipeline — verified in PCR-20261015T100000Z-248001
- PCF-4537D66695 Critical journeys have no end-to-end tests — verified in PCR-20261015T100000Z-248001
- PCF-5C358D43AB Served images lack text alternatives — verified in PCR-20261015T100000Z-248001
- PCF-70B846CB03 Possible injection sink: raw HTML injection of a non-literal value in app/page.tsx — verified in PCR-20261015T100000Z-248001
- PCF-9901AF5D1D No privacy notice reachable — verified in PCR-20261015T100000Z-248001
- PCF-A79BB3B752 No lockfile: builds are not reproducible — verified in PCR-20261015T100000Z-248001
- PCF-C7E301195D Possible injection sink: SQL built with string interpolation in lib/db.ts — verified in PCR-20261015T100000Z-248001
- PCF-CDCE917FE3 Credentialed wildcard CORS in app/api/notes/route.ts — verified in PCR-20261015T100000Z-248001
- PCF-CEED9100D9 Pages can be framed by other sites (clickjacking) — verified in PCR-20261015T100000Z-248001
- PCF-CF1364323D No Content Security Policy — verified in PCR-20261015T100000Z-248001
- PCF-E0A3F8E153 Image without alt text in app/page.tsx — verified in PCR-20261015T100000Z-248001
- PCF-026FD4A0D8 MIME sniffing not disabled — verified in PCR-20261015T100000Z-248001
- PCF-14B347C463 Unbounded dependency version: @​supabase/supabase-js — verified in PCR-20261015T100000Z-248001
- PCF-2BBFB74CD4 Runtime version is not declared — verified in PCR-20261015T100000Z-248001
- PCF-2D30FA9048 No page language in app/layout.tsx — verified in PCR-20261015T100000Z-248001
- PCF-2EFAD2152B No security contact published — verified in PCR-20261015T100000Z-248001
- PCF-2FD01AC810 Server advertises its stack — verified in PCR-20261015T100000Z-248001
- PCF-3D0D04F8EA Unknown URLs answer 200 (soft 404) — verified in PCR-20261015T100000Z-248001
- PCF-5B93B2ED59 Entry page still has the starter-template title — verified in PCR-20261015T100000Z-248001
- PCF-83CA52EEEB README lacks setup/run instructions — verified in PCR-20261015T100000Z-248001
- PCF-9C547F7002 No type checking or linting configured — verified in PCR-20261015T100000Z-248001
- PCF-A355BF9FA1 Served page does not declare its language — verified in PCR-20261015T100000Z-248001
- PCF-C205AFB621 Unbounded dependency version: openai — verified in PCR-20261015T100000Z-248001

## Not verified: the next evidence to collect

- **PC-C-10** Requirements are specific and testable — NOT_TESTED: No Spec Check report was imported (optional; pass --spec-check \<report.json\>).
- **PC-S-04** HTTPS is enforced — NOT_TESTED: Local development server: HTTPS and HSTS are set by the production edge and cannot be assessed on a loopback origin.
- **PC-S-15** No critical or high known vulnerabilities in dependencies — NOT_TESTED: No dependency audit was imported (pass --npm-audit \<npm audit --json output\>).
- **PC-AI-03** Prompt-injection and guardrail behaviour is tested — NOT_TESTED: Adversarial AI behaviour needs executed evaluations. No adapter in this release can verify it directly; map executed tests to PC-AI-03 with contract.control\_mappings.

## Retest comparison

Baseline PCR-20261014T100000Z-4619B7.

- Score change: Customer +60, Technology +90, Trust +95
- Findings: 0 new, 35 resolved (verified), 0 reopened, 2 persisting, 0 not re-checked
- Controls: 27 improved (PC-AI-01, PC-C-02, PC-C-04, PC-C-05, PC-C-06, PC-C-08, PC-S-01, PC-S-02, PC-S-03, PC-S-05, PC-S-06, PC-S-07, PC-S-08, PC-S-09, PC-S-10, PC-S-11, PC-S-12, PC-S-16, PC-S-17, PC-T-01, PC-T-02, PC-T-04, PC-T-06, PC-T-07, PC-T-08, PC-T-09, PC-T-11), 0 regressed

## Limitations

- `ignored-not-read` (1): Git-ignored files were listed but their contents were not read (local-only files such as .env).

## Run

Run PCR-20261015T100000Z-248001 · COMPLETED · mode HYBRID (requested HYBRID) · tiers CT-T0, CT-T1, CT-T2 · Product Check 0.1.0 · methodology CT3 (Customer × Technology × Trust, inspired) · rubric pc-rubric-0.2 · network requests 0

Product Check reports evidence-bounded readiness. It is not a penetration test, a legal or compliance certification, or a guarantee of production readiness.

<sub>Generated by Product Check, an EnWithAI Engineering Commons tool. JSON is the source of truth; this file is a rendering.</sub>
