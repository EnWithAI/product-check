# Product Check report: Vibe Notes (synthetic demo, source only)

> **DEMO DATA.** This assessment ran on a synthetic example application. It says nothing about any real product.

**Verdict: NOT_READY** at CT-T2 (Pre-Launch Assurance), tier wording "NOT READY".

- Hard gate failed: G-SECRETS.
- 7 open P0 finding(s).
- 1 open P1 finding(s).

_Applies only to repository "Vibe Notes (synthetic demo, source only)" at revision d1d8f2bd3ac2 and no deployed application, assessed 2026-10-14T10:00:00.000Z. 21 of 40 applicable controls were checked; 19 were blocked or not tested. A material change invalidates this verdict._

## Customer × Technology × Trust

Pillars are scored separately and never averaged. Untested controls lower coverage; they never count as passed.

| Pillar | Score | Coverage | Confidence | Trend | Pass | Partial | Fail | Blocked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| Customer | not scored (insufficient evidence) | 38% | LOW | — | 1 | 0 | 3 | 3 | 3 |
| Technology | 4/100 | 80% | MEDIUM | — | 0 | 1 | 8 | 0 | 1 |
| Trust | not scored (insufficient evidence) | 42% | LOW | — | 0 | 1 | 7 | 7 | 5 |

Open findings: P0 7 · P1 1 · P2 11 · P3 7 · accepted risks 0 · overall coverage 50%

## Hard gates

| Gate | Status | Controls |
|---|---|---|
| G-SECRETS: No exposed production secrets or client-side privileged keys | FAIL | PC-S-01, PC-S-02, PC-S-09, PC-AI-01 |
| G-AUTHZ: No authentication or authorization bypass on privileged paths | UNVERIFIED | PC-S-13 |
| G-ISOLATION: No cross-tenant or cross-user data exposure | UNVERIFIED | PC-S-14 |

## What was inspected (points of presence)

| Point of presence | Status | Scope | Limitations |
|---|---|---|---|
| Source repository | AVAILABLE | local checkout (read-only) | — |
| Dependency manifests | AVAILABLE | local checkout (read-only) | — |
| Automated test sources | PARTIAL | local checkout (read-only) | No test files found. |
| Executed test results | BLOCKED | — | No executed test results were imported (Product Check never runs repository code). |
| CI/CD configuration | PARTIAL | local checkout (read-only) | No CI configuration found. |
| Hosting / infrastructure configuration | NOT_APPLICABLE | local checkout (read-only) | No hosting or IaC files in the repository. |
| Database schema and migrations | PARTIAL | local checkout (read-only) | Schema files only; the live database was not accessed. No migrations directory. |
| Deployed web application | BLOCKED | — | No deployed URL was provided (--url). |
| API definition (OpenAPI/GraphQL) | NOT_APPLICABLE | — | No API definition files found. |
| Production telemetry (logs, metrics, traces, alerts) | NOT_APPLICABLE | — | Not required before launch tiers (CT-T4+). |
| AI integration (SDKs, prompts, evals) | AVAILABLE | openai | Static inspection only; model behaviour was not exercised. |
| Documentation and specifications | AVAILABLE | local checkout (read-only) | — |
| Privacy and security policies | PARTIAL | — | Presence only; policy content is not assessed (this is not a legal review). |

## Open findings (26)

| ID | Severity | Pillar | Finding | Location | Basis | Lifecycle | Work packet |
|---|---|---|---|---|---|---|---|
| PCF-484BD31627 | P0 | Trust | Stripe secret key in .env.local | `.env.local:4` | fact, high confidence | NEW | WP-PC-S-01 |
| PCF-4DF8A34CE8 | P0 | Trust | Service-role JWT (bypasses row-level security) in lib/supabase.ts | `lib/supabase.ts:4` | fact, high confidence | NEW | WP-PC-S-01 |
| PCF-63B9B21478 | P0 | Trust | Privileged key NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY exposed to the browser | `lib/supabase.ts:4` | inference, high confidence | NEW | WP-PC-S-02 |
| PCF-6AE991A057 | P0 | Trust | Privileged key NEXT\_PUBLIC\_OPENAI\_API\_KEY exposed to the browser | `.env.local:3` | inference, medium confidence | NEW | WP-PC-S-02 |
| PCF-6F76AC0627 | P0 | Trust | Credentials embedded in a connection URL in .env.local | `.env.local:5` | fact, high confidence | NEW | WP-PC-S-01 |
| PCF-E2CE361289 | P0 | Trust | AI provider called from the browser in app/page.tsx | `app/page.tsx:6` | fact, high confidence | NEW | WP-PC-AI-01 |
| PCF-E8ACA75BD3 | P0 | Trust | Privileged key NEXT\_PUBLIC\_OPENAI\_API\_KEY exposed to the browser | `app/page.tsx:6` | inference, medium confidence | NEW | WP-PC-S-02 |
| PCF-AC6E17E07C | P1 | Trust | Environment file .env.local is committed | `.env.local` | fact, high confidence | NEW | WP-PC-S-03 |
| PCF-0BD32ABB20 | P2 | Technology | No automated tests | `repository` | fact, high confidence | NEW | WP-PC-T-02 |
| PCF-2E884D06D5 | P2 | Technology | Database schema changes are not versioned | `prisma/schema.prisma` | inference, medium confidence | NEW | WP-PC-T-11 |
| PCF-3E3C906C89 | P2 | Technology | No CI pipeline | `repository` | fact, high confidence | NEW | WP-PC-T-04 |
| PCF-3F928FCAF1 | P2 | Technology | No error monitoring | `package.json` | fact, medium confidence | NEW | WP-PC-T-10 |
| PCF-4537D66695 | P2 | Customer | Critical journeys have no end-to-end tests | `repository` | fact, high confidence | NEW | WP-PC-C-08 |
| PCF-70B846CB03 | P2 | Trust | Possible injection sink: raw HTML injection of a non-literal value in app/page.tsx | `app/page.tsx:23` | hypothesis, medium confidence | NEW | WP-PC-S-16 |
| PCF-A79BB3B752 | P2 | Technology | No lockfile: builds are not reproducible | `package.json` | fact, high confidence | NEW | WP-PC-T-01 |
| PCF-B565960DEE | P2 | Trust | AI features have no evaluation suite | `repository` | fact, medium confidence | NEW | WP-PC-AI-02 |
| PCF-C7E301195D | P2 | Trust | Possible injection sink: SQL built with string interpolation in lib/db.ts | `lib/db.ts:5` | hypothesis, medium confidence | NEW | WP-PC-S-16 |
| PCF-CDCE917FE3 | P2 | Trust | Credentialed wildcard CORS in app/api/notes/route.ts | `app/api/notes/route.ts:2` | hypothesis, medium confidence | NEW | WP-PC-S-17 |
| PCF-E0A3F8E153 | P2/UX2 | Customer | Image without alt text in app/page.tsx | `app/page.tsx:20` | fact, high confidence | NEW | WP-PC-C-04 |
| PCF-14B347C463 | P3 | Technology | Unbounded dependency version: @​supabase/supabase-js | `package.json:9` | fact, high confidence | NEW | WP-PC-T-09 |
| PCF-2BBFB74CD4 | P3 | Technology | Runtime version is not declared | `repository` | fact, high confidence | NEW | WP-PC-T-07 |
| PCF-2D30FA9048 | P3/UX3 | Customer | No page language in app/layout.tsx | `app/layout.tsx:5` | fact, high confidence | NEW | WP-PC-C-02 |
| PCF-2EFAD2152B | P3 | Trust | No security contact published | `repository` | fact, high confidence | NEW | WP-PC-S-11 |
| PCF-83CA52EEEB | P3 | Technology | README lacks setup/run instructions | `README.md` | fact, medium confidence | NEW | WP-PC-T-06 |
| PCF-9C547F7002 | P3 | Technology | No type checking or linting configured | `repository` | fact, high confidence | NEW | WP-PC-T-08 |
| PCF-C205AFB621 | P3 | Technology | Unbounded dependency version: openai | `package.json:10` | fact, high confidence | NEW | WP-PC-T-09 |

## Not verified: the next evidence to collect

- **PC-C-01** Application is reachable over HTTPS — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-C-05** Entry page has a meaningful title — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-C-06** Unknown URLs return a real 404 page — NOT_TESTED: No dedicated not-found page in source; the served status code needs a deployed URL.
- **PC-C-07** Entry page responds quickly — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-C-09** A new user can complete onboarding unaided — NOT_TESTED: Onboarding needs an executed journey (browser automation is not built into this release). No adapter in this release can verify it directly; map executed tests to PC-C-09 with contract.control\_mappings.
- **PC-C-10** Requirements are specific and testable — NOT_TESTED: No Spec Check report was imported (optional; pass --spec-check \<report.json\>).
- **PC-T-03** Automated tests pass — NOT_TESTED: No test results were imported (Product Check never runs repository code; pass --test-results \<junit.xml\>).
- **PC-S-04** HTTPS is enforced — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-05** A Content Security Policy is set — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-06** Clickjacking protection is set — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-07** MIME-type sniffing is disabled — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-08** Cookies are set with Secure, HttpOnly and SameSite — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-09** No sensitive files are publicly served — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-10** Server and framework versions are not disclosed — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-12** A privacy notice is available — NOT_TESTED: No evaluator produced evidence for this control in this run.
- **PC-S-13** Authorization is enforced on privileged paths — NOT_TESTED: Authorization bypass testing needs credentialed negative tests, which Product Check does not run itself. No adapter in this release can verify it directly; map executed tests to PC-S-13 with contract.control\_mappings.
- **PC-S-14** Tenant and user data are isolated — NOT_TESTED: Two-tenant isolation needs credentialed tests; map executed isolation tests to PC-S-14 with contract.control\_mappings.
- **PC-S-15** No critical or high known vulnerabilities in dependencies — NOT_TESTED: No dependency audit was imported (pass --npm-audit \<npm audit --json output\>).
- **PC-AI-03** Prompt-injection and guardrail behaviour is tested — NOT_TESTED: Adversarial AI behaviour needs executed evaluations. No adapter in this release can verify it directly; map executed tests to PC-AI-03 with contract.control\_mappings.

## Run

Run PCR-20261014T100000Z-EBF5A5 · COMPLETED · mode SOURCE (requested SOURCE) · tiers CT-T0, CT-T1, CT-T2 · Product Check 0.2.0 · methodology CT3 (Customer × Technology × Trust, inspired) · rubric pc-rubric-0.2 · network requests 0

Product Check reports evidence-bounded readiness. It is not a penetration test, a legal or compliance certification, or a guarantee of production readiness.

<sub>Generated by Product Check, an EnWithAI Engineering Commons tool. JSON is the source of truth; this file is a rendering.</sub>
