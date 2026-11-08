# Product Check report: Vibe Invoices (synthetic demo)

**Verdict: INCONCLUSIVE** at CT-T1 (Experience & Product Usefulness), tier wording "INSUFFICIENT EVIDENCE".

- Hard-gate controls not verified: PC-S-09, PC-S-13.
- Insufficient evidence to score: customer.

_Applies only to repository "Vibe Invoices (synthetic demo)" at revision 28d05afb57f3 and no deployed application, assessed 2026-11-08T07:51:00.658Z. 12 of 24 applicable controls were checked; 12 were blocked or not tested. A material change invalidates this verdict._

## Customer × Technology × Trust

Pillars are scored separately and never averaged. Untested controls lower coverage; they never count as passed.

| Pillar | Score | Coverage | Confidence | Trend | Pass | Partial | Fail | Blocked | Not tested |
|---|---|---|---|---|---|---|---|---|---|
| Customer | not scored (insufficient evidence) | 15% | LOW | n/a | 0 | 0 | 1 | 3 | 6 |
| Technology | 39/100 | 75% | MEDIUM | +0 | 2 | 1 | 4 | 0 | 1 |
| Trust | 100/100 | 60% | MEDIUM | +61 | 4 | 0 | 0 | 1 | 1 |

Open findings: P0 0 · P1 0 · P2 3 · P3 3 · accepted risks 0 · overall coverage 50%

## Hard gates

| Gate | Status | Controls |
|---|---|---|
| G-SECRETS: No exposed production secrets or client-side privileged keys | UNVERIFIED | PC-S-01, PC-S-02, PC-S-09, PC-AI-01 |
| G-AUTHZ: No authentication or authorization bypass on privileged paths | UNVERIFIED | PC-S-13 |
| G-ISOLATION: No cross-tenant or cross-user data exposure | NOT_APPLICABLE | PC-S-14 |

## What was inspected (points of presence)

| Point of presence | Status | Scope | Limitations |
|---|---|---|---|
| Source repository | AVAILABLE | local checkout (read-only) | — |
| Dependency manifests | AVAILABLE | local checkout (read-only) | — |
| Automated test sources | AVAILABLE | local checkout (read-only) | — |
| Executed test results | BLOCKED | — | No executed test results were imported (Product Check never runs repository code). |
| CI/CD configuration | PARTIAL | local checkout (read-only) | No CI configuration found. |
| Hosting / infrastructure configuration | NOT_APPLICABLE | local checkout (read-only) | No hosting or IaC files in the repository. |
| Database schema and migrations | NOT_APPLICABLE | — | No database dependency detected. |
| Deployed web application | BLOCKED | — | No deployed URL was provided (--url). |
| API definition (OpenAPI/GraphQL) | NOT_APPLICABLE | — | No API definition files found. |
| Production telemetry (logs, metrics, traces, alerts) | NOT_APPLICABLE | — | Not required before launch tiers (CT-T4+). |
| AI integration (SDKs, prompts, evals) | NOT_APPLICABLE | — | No AI SDK detected. |
| Documentation and specifications | AVAILABLE | local checkout (read-only) | — |
| Privacy and security policies | PARTIAL | — | Presence only; policy content is not assessed (this is not a legal review). |

## Open findings (6)

| ID | Severity | Pillar | Finding | Location | Basis | Lifecycle | Work packet |
|---|---|---|---|---|---|---|---|
| PCF-3E3C906C89 | P2 | Technology | No CI pipeline | `repository` | fact, high confidence | PERSISTING | WP-PC-T-04 |
| PCF-4537D66695 | P2 | Customer | Critical journeys have no end-to-end tests | `repository` | fact, high confidence | PERSISTING | WP-PC-C-08 |
| PCF-A79BB3B752 | P2 | Technology | No lockfile: builds are not reproducible | `package.json` | fact, high confidence | PERSISTING | WP-PC-T-01 |
| PCF-2BBFB74CD4 | P3 | Technology | Runtime version is not declared | `repository` | fact, high confidence | PERSISTING | WP-PC-T-07 |
| PCF-83CA52EEEB | P3 | Technology | README lacks setup/run instructions | `README.md` | fact, medium confidence | PERSISTING | WP-PC-T-06 |
| PCF-9C547F7002 | P3 | Technology | No type checking or linting configured | `repository` | fact, high confidence | PERSISTING | WP-PC-T-08 |

### Verified fixes (resolved on retest)

- PCF-50D5C47465 Stripe secret key in app/checkout/page.tsx — verified in PCR-20261108T075100Z-E27953

## Not verified: the next evidence to collect

- **PC-C-01** Application is reachable over HTTPS — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-C-02** Page language is declared — NOT_TESTED: No \<html\> document template was found in source.
- **PC-C-03** Page is configured for mobile viewports — NOT_TESTED: No document \<head\> template found in source.
- **PC-C-04** Images have text alternatives — NOT_TESTED: No image elements found in source templates.
- **PC-C-05** Entry page has a meaningful title — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-C-06** Unknown URLs return a real 404 page — NOT_TESTED: No dedicated not-found page in source; the served status code needs a deployed URL.
- **PC-C-07** Entry page responds quickly — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-C-09** A new user can complete onboarding unaided — NOT_TESTED: Onboarding needs an executed journey (browser automation is not built into this release). No adapter in this release can verify it directly; map executed tests to PC-C-09 with contract.control\_mappings.
- **PC-C-10** Requirements are specific and testable — NOT_TESTED: No Spec Check report was imported (optional; pass --spec-check \<report.json\>).
- **PC-T-03** Automated tests pass — NOT_TESTED: No test results were imported (Product Check never runs repository code; pass --test-results \<junit.xml\>).
- **PC-S-09** No sensitive files are publicly served — BLOCKED: Deployed web application: No deployed URL was provided (--url).
- **PC-S-13** Authorization is enforced on privileged paths — NOT_TESTED: Authorization bypass testing needs credentialed negative tests, which Product Check does not run itself. No adapter in this release can verify it directly; map executed tests to PC-S-13 with contract.control\_mappings.

## Retest comparison

Baseline PCR-20261108T075058Z-D21CC5.

- Score change: Customer n/a, Technology +0, Trust +61
- Findings: 0 new, 1 resolved (verified), 0 reopened, 6 persisting, 0 not re-checked
- Controls: 1 improved (PC-S-01), 0 regressed

## Run

Run PCR-20261108T075100Z-E27953 · COMPLETED · mode SOURCE (requested AUTO) · tiers CT-T0, CT-T1 · Product Check 0.2.0 · methodology CT3 (Customer × Technology × Trust, inspired) · rubric pc-rubric-0.2 · network requests 0

Product Check reports evidence-bounded readiness. It is not a penetration test, a legal or compliance certification, or a guarantee of production readiness.

<sub>Generated by Product Check, an EnWithAI Engineering Commons tool. JSON is the source of truth; this file is a rendering.</sub>
