# Engineering blueprint: Vibe Notes (synthetic demo)

> **DEMO DATA.** Synthetic example application.

Advisory only: Product Check never changes code. A remediation becomes VERIFIED only when a retest observes the control passing.

## As-is architecture (discovered)

| Component | Category | Certainty |
|---|---|---|
| `openai` | ai | observed |
| `prisma` | data | observed |
| `@supabase/supabase-js` | data | observed |
| `http://127.0.0.1:4785` | deployment | observed |
| `Next.js` | framework | observed |
| `React` | framework | observed |

### Stated uncertainties

- No executed test results were imported: whether tests pass is unknown.
- No authentication library detected; whether the product has user accounts or custom auth was not determined.
- A database is used but its schema is not versioned in the repository; the live schema was not inspected.
- Authenticated, multi-step and data-changing journeys were not exercised (no browser automation or credentialed access in this release).

## As-built specification (reverse-engineered)

Derived from the repository's structure without running it: 1 page(s), 1 endpoint(s), 1 data entit(y/ies), 3 integration(s), 4 configuration name(s). The full spec is in `specs/000-as-built/spec.md` (Spec Kit layout) and `as-built-spec.json`; traceability links findings to these requirement IDs.

- **FR-001** The system MUST serve the page `/`. _(observed)_
- **FR-002** The system MUST handle `GET` requests to `/api/notes`. _(observed)_
- **FR-003** The system MUST persist `Note` records (fields: id, owner, html). _(observed)_
- **FR-004** The system MUST integrate with `@supabase/supabase-js` (data). _(observed)_
- **FR-005** The system MUST integrate with `openai` (ai). _(observed)_
- **FR-006** The system MUST integrate with `prisma` (data). _(observed)_
- **FR-007** The system MUST be configured through 4 environment variable(s): `DATABASE_URL`, `NEXT_PUBLIC_OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`. `NEXT_PUBLIC_OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` are exposed to the browser bundle and MUST NOT hold secrets. _(observed)_

**3 question(s) only a person can answer:**

- Purpose of the Home and top-level pages area: who uses it, and what outcome it must deliver.
- Purpose of the Notes area: who uses it, and what outcome it must deliver.
- Critical journey "Summarize a note with AI" is declared in the scan contract but no discovered route matches it.

## To-be architecture (target changes)

- **TB-PC-C-02** All document templates declare the content language. _Why:_ Assistive technology uses it to choose pronunciation and translation tools use it to detect language. (findings: PCF-2D30FA9048, PCF-A355BF9FA1)
- **TB-PC-C-04** Image components require alt text by type or lint rule. _Why:_ Text alternatives are a baseline accessibility requirement (WCAG 1.1.1). (findings: PCF-5C358D43AB, PCF-E0A3F8E153)
- **TB-PC-C-05** Root metadata carries the product name and purpose. _Why:_ The title is the first product copy users and search engines see. (findings: PCF-5B93B2ED59)
- **TB-PC-C-06** Router has an explicit not-found route that sets status 404. _Why:_ Correct status codes let users, crawlers and monitors distinguish missing content from working pages. (findings: PCF-3D0D04F8EA)
- **TB-PC-C-08** Each critical journey has an end-to-end test that gates deployment. _Why:_ Only executed journeys provide runtime evidence that the product works for users. (findings: PCF-4537D66695)
- **TB-PC-T-01** Lockfile committed; CI installs with a frozen lockfile. _Why:_ Reproducible builds are a precondition for meaningful testing and rollback. (findings: PCF-A79BB3B752)
- **TB-PC-T-02** Unit and integration tests run with one command locally and in CI. _Why:_ Tests turn 'it seemed to work' into repeatable evidence. (findings: PCF-0BD32ABB20)
- **TB-PC-T-04** Every pull request runs build, lint and tests automatically. _Why:_ CI is where tests become a gate rather than a suggestion. (findings: PCF-3E3C906C89)
- **TB-PC-T-06** README documents setup, environment and test commands. _Why:_ Reproducible setup is a precondition for testing and handover. (findings: PCF-83CA52EEEB)
- **TB-PC-T-07** Runtime version declared once and used by CI and hosting. _Why:_ Runtime drift causes works-on-my-machine failures. (findings: PCF-2BBFB74CD4)
- **TB-PC-T-08** Type check and lint run in CI. _Why:_ Cheap automated checks catch common defects introduced by fast iteration. (findings: PCF-9C547F7002)
- **TB-PC-T-09** All dependencies declared with bounded ranges; updates via reviewed pull requests. _Why:_ Bounded versions make dependency changes reviewable events. (findings: PCF-14B347C463, PCF-C205AFB621)
- **TB-PC-T-10** Errors and traces flow to a monitored backend with alerts. _Why:_ You cannot fix what you cannot see; this is a precondition for launch watch. (findings: PCF-3F928FCAF1)
- **TB-PC-T-11** Every schema change is a reviewed migration applied by the deployment pipeline. _Why:_ Versioned migrations make data changes reviewable, repeatable and reversible. (findings: PCF-2E884D06D5)
- **TB-PC-S-01** Secrets live only in the hosting provider's secret store and are read server-side at runtime. _Why:_ A committed secret must be assumed leaked; deleting it from the latest commit does not revoke it. _Alternatives:_ Use a secret manager (cloud KMS / Vault / Doppler) instead of plain environment variables. (findings: PCF-484BD31627, PCF-4DF8A34CE8, PCF-6F76AC0627)
- **TB-PC-S-02** Client calls the product's own server API; privileged keys stay server-side. _Why:_ Bundlers inline public-prefixed variables into JavaScript that every visitor downloads. _Alternatives:_ Use row-level security with the publishable/anon key for direct database access from the client. (findings: PCF-63B9B21478, PCF-6AE991A057, PCF-E8ACA75BD3)
- **TB-PC-S-03** Only a placeholder .env.example is tracked. _Why:_ Environment files are where real secrets live during development. (findings: PCF-AC6E17E07C)
- **TB-PC-S-05** Security headers defined once in framework/edge configuration and tested. _Why:_ CSP is the main mitigation that limits the damage of cross-site scripting. (findings: PCF-CF1364323D)
- **TB-PC-S-06** Framing denied by default via security headers. _Why:_ Prevents UI-redress attacks against signed-in users. (findings: PCF-CEED9100D9)
- **TB-PC-S-07** Baseline security headers on every response. _Why:_ Cheap defence against content-type confusion. (findings: PCF-026FD4A0D8)
- **TB-PC-S-08** Cookie policy defined centrally. _Why:_ Cookie flags are the cheapest defence for session integrity. (findings: PCF-1E72F2F7B0)
- **TB-PC-S-09** Only build artefacts are deployed; dotfiles are never served. _Why:_ Exposed .env or .git content hands attackers credentials and source. (findings: PCF-222F650216)
- **TB-PC-S-10** Responses do not advertise stack or versions. _Why:_ Reduces information given to automated scanners. (findings: PCF-2FD01AC810)
- **TB-PC-S-11** Security contact published and monitored. _Why:_ Responsible disclosure needs a known channel. (findings: PCF-2EFAD2152B)
- **TB-PC-S-12** Privacy notice linked from every page footer and kept with the code. _Why:_ Transparency is a baseline expectation wherever personal data is processed. (findings: PCF-9901AF5D1D)
- **TB-PC-S-16** Data never concatenated into code, markup or queries. _Why:_ Injection remains a top cause of breaches. (findings: PCF-70B846CB03, PCF-C7E301195D)
- **TB-PC-S-17** CORS allow-list per environment. _Why:_ Overly broad CORS lets hostile sites act with a user's session. (findings: PCF-CDCE917FE3)
- **TB-PC-AI-01** Client → product API → AI provider, with server-side guardrails. _Why:_ Any key used in the browser can be extracted and abused. (findings: PCF-E2CE361289)
- **TB-PC-AI-02** Prompt/model changes gated by an eval suite. _Why:_ AI behaviour changes with prompts, models and data; evals are its regression tests. (findings: PCF-B565960DEE)

## Remediation plan

| Order | Remediation | Priority | Horizon | Effort | Depends on | Human review | Verification |
|---|---|---|---|---|---|---|---|
| 1 | REM-PC-S-01: No credentials are committed in source | P0 | NOW | S | — | yes | PROPOSED |
| 2 | REM-PC-S-02: No server secrets are exposed through public environment prefixes | P0 | NOW | M | — | yes | PROPOSED |
| 3 | REM-PC-S-09: No sensitive files are publicly served | P0 | NOW | S | — | yes | PROPOSED |
| 4 | REM-PC-AI-01: AI provider calls run server-side only | P0 | NOW | M | — | yes | PROPOSED |
| 5 | REM-PC-S-03: Environment files are excluded from version control | P1 | NOW | S | — | yes | PROPOSED |
| 6 | REM-PC-C-04: Images have text alternatives | P2 | NEXT | S | — | no | PROPOSED |
| 7 | REM-PC-C-08: Critical journeys are covered by passing end-to-end tests | P2 | NEXT | M | REM-PC-T-02 | no | PROPOSED |
| 8 | REM-PC-T-01: Dependency manifest and lockfile are present | P2 | NEXT | S | — | no | PROPOSED |
| 9 | REM-PC-T-02: Automated tests exist | P2 | NEXT | M | — | no | PROPOSED |
| 10 | REM-PC-T-04: A CI pipeline is configured | P2 | NEXT | S | — | no | PROPOSED |
| 11 | REM-PC-T-10: Error monitoring is instrumented | P2 | NEXT | S | — | no | PROPOSED |
| 12 | REM-PC-T-11: Database schema changes are versioned | P2 | NEXT | M | — | yes | PROPOSED |
| 13 | REM-PC-S-05: A Content Security Policy is set | P2 | NEXT | M | — | no | PROPOSED |
| 14 | REM-PC-S-06: Clickjacking protection is set | P2 | NEXT | S | REM-PC-S-05 | no | PROPOSED |
| 15 | REM-PC-S-08: Cookies are set with Secure, HttpOnly and SameSite | P2 | NEXT | S | — | no | PROPOSED |
| 16 | REM-PC-S-12: A privacy notice is available | P2 | NEXT | S | — | yes | PROPOSED |
| 17 | REM-PC-S-16: No high-risk code patterns | P2 | NEXT | M | — | yes | PROPOSED |
| 18 | REM-PC-S-17: No credentialed wildcard CORS | P2 | NEXT | S | — | no | PROPOSED |
| 19 | REM-PC-AI-02: An AI evaluation suite exists | P2 | NEXT | M | — | no | PROPOSED |
| 20 | REM-PC-C-02: Page language is declared | P3 | LATER | S | — | no | PROPOSED |
| 21 | REM-PC-C-05: Entry page has a meaningful title | P3 | LATER | S | — | no | PROPOSED |
| 22 | REM-PC-C-06: Unknown URLs return a real 404 page | P3 | LATER | S | — | no | PROPOSED |
| 23 | REM-PC-T-06: Setup and run instructions are documented | P3 | LATER | S | — | no | PROPOSED |
| 24 | REM-PC-T-07: Runtime version is declared | P3 | LATER | S | — | no | PROPOSED |
| 25 | REM-PC-T-08: Static type checking or linting is configured | P3 | LATER | S | — | no | PROPOSED |
| 26 | REM-PC-T-09: Dependency versions are bounded | P3 | LATER | S | REM-PC-T-01 | no | PROPOSED |
| 27 | REM-PC-S-07: MIME-type sniffing is disabled | P3 | LATER | S | — | no | PROPOSED |
| 28 | REM-PC-S-10: Server and framework versions are not disclosed | P3 | LATER | S | — | no | PROPOSED |
| 29 | REM-PC-S-11: A security contact is published | P3 | LATER | S | — | no | PROPOSED |

### REM-PC-S-01 (P0, NOW)

**Problem.** No credentials are committed in source: 3 finding(s) — A Stripe secret key appears at .env.local:4; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses credentials).

**Why it matters.** A committed secret must be assumed leaked; deleting it from the latest commit does not revoke it.

**Recommended change.** Rotate (revoke and reissue) every exposed credential first, then move it to environment variables / the hosting secret store and remove it from the code. Treat the history as compromised.

**Acceptance criteria**

- [ ] Each listed credential has been rotated at its provider (human confirmation).
- [ ] No secret pattern matches in repository files.
- [ ] Control PC-S-01 evaluates PASS on retest.
- [ ] Finding PCF-484BD31627 (.env.local:4) is no longer observed on retest.
- [ ] Finding PCF-4DF8A34CE8 (lib/supabase.ts:4) is no longer observed on retest.
- [ ] Finding PCF-6F76AC0627 (.env.local:5) is no longer observed on retest.

**Regression protection.** A secret-scanning pre-commit hook or CI step (for example gitleaks) on every pull request.

Candidate (yaml (GitHub Actions step)):

```
# Add to your CI workflow: fails the build when credentials or public-prefixed secrets are committed.
- name: Secret guard
  run: |
    ! git grep -nE '(sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE))' -- . ':!*.lock' ':!package-lock.json'

```

### REM-PC-S-02 (P0, NOW)

**Problem.** No server secrets are exposed through public environment prefixes: 3 finding(s) — NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor.

**Why it matters.** Bundlers inline public-prefixed variables into JavaScript that every visitor downloads.

**Recommended change.** Rename the variable without the public prefix, move the privileged call into a server route/function, rotate the key, and give the client only publishable keys.

**Acceptance criteria**

- [ ] No secret-named variable with a public prefix in source or env files.
- [ ] Rotated key confirmed by a human.
- [ ] Control PC-S-02 evaluates PASS on retest.
- [ ] Finding PCF-63B9B21478 (lib/supabase.ts:4) is no longer observed on retest.
- [ ] Finding PCF-6AE991A057 (.env.local:3) is no longer observed on retest.
- [ ] Finding PCF-E8ACA75BD3 (app/page.tsx:6) is no longer observed on retest.

**Regression protection.** Lint rule or CI grep rejecting public-prefixed secret names.

Candidate (yaml (GitHub Actions step)):

```
# Add to your CI workflow: fails the build when credentials or public-prefixed secrets are committed.
- name: Secret guard
  run: |
    ! git grep -nE '(sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE))' -- . ':!*.lock' ':!package-lock.json'

```

### REM-PC-S-09 (P0, NOW)

**Problem.** No sensitive files are publicly served: 1 finding(s) — /.env is publicly served and looks like env-assignments. Content was not stored.

**Why it matters.** Exposed .env or .git content hands attackers credentials and source.

**Recommended change.** Stop serving the project root: publish only the build output directory, block dotfiles at the edge, and rotate any exposed secrets.

**Acceptance criteria**

- [ ] Each probed path returns 404/403 or non-matching content.
- [ ] Control PC-S-09 evaluates PASS on retest.
- [ ] Finding PCF-222F650216 (http://127.0.0.1:4785/.env) is no longer observed on retest.

**Regression protection.** Exposure probe on every deployment.

Candidate (javascript (node --test)):

```
// Save as test/no-exposed-files.test.mjs and run: BASE_URL=http://127.0.0.1:4785 node --test
import test from "node:test";
import assert from "node:assert/strict";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4785";
for (const path of ["/.env", "/.env.local", "/.git/HEAD", "/.git/config"]) {
  test(`${path} is not served`, async () => {
    const res = await fetch(new URL(path, BASE_URL), { redirect: "manual" });
    const body = res.ok ? await res.text() : "";
    assert.ok(!res.ok || !/^([A-Z_][A-Z0-9_]*=|ref: refs\/|\[core\])/m.test(body), `${path} exposed`);
  });
}

```

### REM-PC-AI-01 (P0, NOW)

**Problem.** AI provider calls run server-side only: 1 finding(s) — app/page.tsx enables dangerouslyAllowBrowser; the provider key must then be available in the browser.

**Why it matters.** Any key used in the browser can be extracted and abused.

**Recommended change.** Move AI calls into a server route with authentication, rate limiting and input validation; rotate the key.

**Acceptance criteria**

- [ ] No AI SDK import in client-side files; no dangerouslyAllowBrowser.
- [ ] Control PC-AI-01 evaluates PASS on retest.
- [ ] Finding PCF-E2CE361289 (app/page.tsx:6) is no longer observed on retest.

**Regression protection.** Lint rule forbidding AI SDK imports in client code.

### REM-PC-S-03 (P1, NOW)

**Problem.** Environment files are excluded from version control: 1 finding(s) — .env.local is tracked in the git index (committed or staged).

**Why it matters.** Environment files are where real secrets live during development.

**Recommended change.** Add \`.env\*\` (with \`!.env.example\`) to .gitignore and \`git rm --cached\` any tracked env file; rotate values that were committed.

**Acceptance criteria**

- [ ] .gitignore ignores .env files.
- [ ] No .env file (other than examples) is tracked.
- [ ] Control PC-S-03 evaluates PASS on retest.
- [ ] Finding PCF-AC6E17E07C (.env.local) is no longer observed on retest.

**Regression protection.** Secret-scanning pre-commit hook.

### REM-PC-C-04 (P2, NEXT)

**Problem.** Images have text alternatives: 2 finding(s) — 1 image(s) without alt.

**Why it matters.** Text alternatives are a baseline accessibility requirement (WCAG 1.1.1).

**Recommended change.** Add meaningful alt text to informative images and alt="" to decorative ones.

**Acceptance criteria**

- [ ] No \<img\>/\<Image\> element without an alt attribute in the listed locations.
- [ ] Control PC-C-04 evaluates PASS on retest.
- [ ] Finding PCF-5C358D43AB (http://127.0.0.1:4785/) is no longer observed on retest.
- [ ] Finding PCF-E0A3F8E153 (app/page.tsx:20) is no longer observed on retest.

**Regression protection.** Enable jsx-a11y/alt-text (or an equivalent) in lint and CI.

### REM-PC-C-08 (P2, NEXT)

**Problem.** Critical journeys are covered by passing end-to-end tests: 1 finding(s) — No end-to-end tests found.

**Why it matters.** Only executed journeys provide runtime evidence that the product works for users.

**Recommended change.** Write end-to-end tests (for example Playwright) for the declared critical journeys, run them in CI and import their JUnit results.

**Acceptance criteria**

- [ ] At least one end-to-end suite runs and all its cases pass in imported results.
- [ ] Control PC-C-08 evaluates PASS on retest.
- [ ] Finding PCF-4537D66695 (repository) is no longer observed on retest.

**Regression protection.** The end-to-end suite itself, run on every pull request and deployment.

### REM-PC-T-01 (P2, NEXT)

**Problem.** Dependency manifest and lockfile are present: 1 finding(s) — No lockfile next to the root manifest.

**Why it matters.** Reproducible builds are a precondition for meaningful testing and rollback.

**Recommended change.** Generate and commit the package manager's lockfile; use the frozen install command (npm ci / pnpm install --frozen-lockfile) in CI.

**Acceptance criteria**

- [ ] A lockfile exists next to each manifest.
- [ ] Control PC-T-01 evaluates PASS on retest.
- [ ] Finding PCF-A79BB3B752 (package.json) is no longer observed on retest.

**Regression protection.** CI fails when the lockfile is out of date (frozen install).

### REM-PC-T-02 (P2, NEXT)

**Problem.** Automated tests exist: 1 finding(s) — No automated test files found.

**Why it matters.** Tests turn 'it seemed to work' into repeatable evidence.

**Recommended change.** Add a test runner (for example Vitest or Jest) with a \`test\` script and start with tests for the riskiest logic.

**Acceptance criteria**

- [ ] Test files exist and \`npm test\` (or equivalent) is defined.
- [ ] Control PC-T-02 evaluates PASS on retest.
- [ ] Finding PCF-0BD32ABB20 (repository) is no longer observed on retest.

**Regression protection.** The test suite itself, required in CI.

### REM-PC-T-04 (P2, NEXT)

**Problem.** A CI pipeline is configured: 1 finding(s) — No CI configuration found.

**Why it matters.** CI is where tests become a gate rather than a suggestion.

**Recommended change.** Add a CI workflow that installs with a frozen lockfile, builds, lints and runs tests on every pull request.

**Acceptance criteria**

- [ ] A CI configuration file exists.
- [ ] Control PC-T-04 evaluates PASS on retest.
- [ ] Finding PCF-3E3C906C89 (repository) is no longer observed on retest.

**Regression protection.** Branch protection requiring CI.

### REM-PC-T-10 (P2, NEXT)

**Problem.** Error monitoring is instrumented: 1 finding(s) — No error-tracking or telemetry SDK in dependencies.

**Why it matters.** You cannot fix what you cannot see; this is a precondition for launch watch.

**Recommended change.** Add an error-tracking or OpenTelemetry SDK, initialise it on server and client, and configure alerting.

**Acceptance criteria**

- [ ] A monitoring SDK is installed and initialised.
- [ ] Control PC-T-10 evaluates PASS on retest.
- [ ] Finding PCF-3F928FCAF1 (package.json) is no longer observed on retest.

**Regression protection.** A deliberate test error in staging appears in the monitoring tool.

### REM-PC-T-11 (P2, NEXT)

**Problem.** Database schema changes are versioned: 1 finding(s) — Schema changes are not versioned as migrations.

**Why it matters.** Versioned migrations make data changes reviewable, repeatable and reversible.

**Recommended change.** Generate migrations with the ORM/database tool (prisma migrate, drizzle-kit, supabase migration) and commit them.

**Acceptance criteria**

- [ ] A migrations directory exists with at least one migration.
- [ ] Control PC-T-11 evaluates PASS on retest.
- [ ] Finding PCF-2E884D06D5 (prisma/schema.prisma) is no longer observed on retest.

**Regression protection.** CI applies migrations to a fresh database.

### REM-PC-S-05 (P2, NEXT)

**Problem.** A Content Security Policy is set: 1 finding(s) — No Content-Security-Policy header or meta tag.

**Why it matters.** CSP is the main mitigation that limits the damage of cross-site scripting.

**Recommended change.** Define a Content-Security-Policy (start with Content-Security-Policy-Report-Only, then enforce) in the framework or hosting header configuration.

**Acceptance criteria**

- [ ] Content-Security-Policy present on HTML responses.
- [ ] Control PC-S-05 evaluates PASS on retest.
- [ ] Finding PCF-CF1364323D (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** Header assertion test (candidate below).

Candidate (javascript (node --test)):

```
// Save as test/content-security-policy.test.mjs and run: BASE_URL=http://127.0.0.1:4785 node --test
import test from "node:test";
import assert from "node:assert/strict";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4785";
test("content-security-policy", async () => {
  const res = await fetch(BASE_URL, { redirect: "manual" });
  assert.ok(res.headers.get("content-security-policy"), "CSP header missing");
});

```

### REM-PC-S-06 (P2, NEXT)

**Problem.** Clickjacking protection is set: 1 finding(s) — No X-Frame-Options and no CSP frame-ancestors.

**Why it matters.** Prevents UI-redress attacks against signed-in users.

**Recommended change.** Send \`Content-Security-Policy: frame-ancestors 'self'\` (or X-Frame-Options: DENY).

**Acceptance criteria**

- [ ] frame-ancestors or X-Frame-Options present.
- [ ] Control PC-S-06 evaluates PASS on retest.
- [ ] Finding PCF-CEED9100D9 (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** Header assertion test.

Candidate (javascript (node --test)):

```
// Save as test/framing-policy.test.mjs and run: BASE_URL=http://127.0.0.1:4785 node --test
import test from "node:test";
import assert from "node:assert/strict";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4785";
test("framing-policy", async () => {
  const res = await fetch(BASE_URL, { redirect: "manual" });
  const csp = res.headers.get("content-security-policy") ?? "";
  assert.ok(/frame-ancestors/.test(csp) || /^(deny|sameorigin)$/i.test(res.headers.get("x-frame-options") ?? ""));
});

```

### REM-PC-S-08 (P2, NEXT)

**Problem.** Cookies are set with Secure, HttpOnly and SameSite: 1 finding(s) — session missing SameSite, HttpOnly

**Why it matters.** Cookie flags are the cheapest defence for session integrity.

**Recommended change.** Set Secure, HttpOnly (for session cookies) and SameSite=Lax/Strict on all cookies.

**Acceptance criteria**

- [ ] All observed cookies carry the expected attributes.
- [ ] Control PC-S-08 evaluates PASS on retest.
- [ ] Finding PCF-1E72F2F7B0 (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** Header assertion test on Set-Cookie.

### REM-PC-S-12 (P2, NEXT)

**Problem.** A privacy notice is available: 1 finding(s) — No reachable privacy notice.

**Why it matters.** Transparency is a baseline expectation wherever personal data is processed.

**Recommended change.** Publish a privacy notice describing data collected, purposes, processors and retention; link it from the footer.

**Acceptance criteria**

- [ ] A privacy page is reachable from the entry page.
- [ ] Control PC-S-12 evaluates PASS on retest.
- [ ] Finding PCF-9901AF5D1D (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** End-to-end link check.

### REM-PC-S-16 (P2, NEXT)

**Problem.** No high-risk code patterns: 2 finding(s) — raw HTML injection of a non-literal value at app/page.tsx:23. Whether untrusted data reaches it was not determined.

**Why it matters.** Injection remains a top cause of breaches.

**Recommended change.** Replace eval/new Function; sanitise HTML (DOMPurify) or render text; use parameterised queries / the ORM's safe API.

**Acceptance criteria**

- [ ] Each listed location is fixed or documented as handling only trusted constants.
- [ ] Control PC-S-16 evaluates PASS on retest.
- [ ] Finding PCF-70B846CB03 (app/page.tsx:23) is no longer observed on retest.
- [ ] Finding PCF-C7E301195D (lib/db.ts:5) is no longer observed on retest.

**Regression protection.** Lint rules (no-eval, react/no-danger) and a test with a malicious payload for each fixed path.

### REM-PC-S-17 (P2, NEXT)

**Problem.** No credentialed wildcard CORS: 1 finding(s) — CORS allows any (or reflected) origin and credentials in the same file.

**Why it matters.** Overly broad CORS lets hostile sites act with a user's session.

**Recommended change.** Allow-list the product's own origins; never combine wildcard/reflected origins with credentials.

**Acceptance criteria**

- [ ] CORS configuration lists explicit origins.
- [ ] Control PC-S-17 evaluates PASS on retest.
- [ ] Finding PCF-CDCE917FE3 (app/api/notes/route.ts:2) is no longer observed on retest.

**Regression protection.** Integration test sending a foreign Origin header.

### REM-PC-AI-02 (P2, NEXT)

**Problem.** An AI evaluation suite exists: 1 finding(s) — No promptfoo config, evals/ directory or \*.eval.\* files.

**Why it matters.** AI behaviour changes with prompts, models and data; evals are its regression tests.

**Recommended change.** Add an evaluation suite with representative and adversarial cases; run it when prompts or models change.

**Acceptance criteria**

- [ ] Eval suite present and runnable.
- [ ] Control PC-AI-02 evaluates PASS on retest.
- [ ] Finding PCF-B565960DEE (repository) is no longer observed on retest.

**Regression protection.** Eval suite in CI on prompt changes.

### REM-PC-C-02 (P3, LATER)

**Problem.** Page language is declared: 2 finding(s) — \<html\> has no lang attribute.

**Why it matters.** Assistive technology uses it to choose pronunciation and translation tools use it to detect language.

**Recommended change.** Add a lang attribute (for example lang="en") to the root \<html\> element of every document template.

**Acceptance criteria**

- [ ] Every \<html\> element in templates and the served page has a non-empty lang attribute.
- [ ] Control PC-C-02 evaluates PASS on retest.
- [ ] Finding PCF-2D30FA9048 (app/layout.tsx:5) is no longer observed on retest.
- [ ] Finding PCF-A355BF9FA1 (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** An accessibility lint rule (for example jsx-a11y/html-has-lang) or an end-to-end assertion on document.documentElement.lang.

### REM-PC-C-05 (P3, LATER)

**Problem.** Entry page has a meaningful title: 1 finding(s) — Starter-template title "Create Next App".

**Why it matters.** The title is the first product copy users and search engines see.

**Recommended change.** Set a product-specific title (and description) in the root metadata.

**Acceptance criteria**

- [ ] The entry page \<title\> is non-empty and not a known starter default.
- [ ] Control PC-C-05 evaluates PASS on retest.
- [ ] Finding PCF-5B93B2ED59 (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** End-to-end assertion on the page title.

### REM-PC-C-06 (P3, LATER)

**Problem.** Unknown URLs return a real 404 page: 1 finding(s) — Unknown path answered 200.

**Why it matters.** Correct status codes let users, crawlers and monitors distinguish missing content from working pages.

**Recommended change.** Return status 404 with a helpful not-found page for unknown routes (for SPAs, configure the host's fallback to send 404 for unknown non-app paths or render a not-found view).

**Acceptance criteria**

- [ ] GET \<origin\>/\<random path\> returns 404.
- [ ] Control PC-C-06 evaluates PASS on retest.
- [ ] Finding PCF-3D0D04F8EA (http://127.0.0.1:4785/product-check-not-found-7b6863e0c6c2) is no longer observed on retest.

**Regression protection.** Smoke test requesting a random path and asserting 404.

Candidate (javascript (node --test)):

```
// Save as test/not-found.test.mjs and run: BASE_URL=http://127.0.0.1:4785 node --test
import test from "node:test";
import assert from "node:assert/strict";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4785";
test("unknown paths return 404", async () => {
  const res = await fetch(new URL("/this-page-does-not-exist-" + Date.now(), BASE_URL));
  assert.equal(res.status, 404);
});

```

### REM-PC-T-06 (P3, LATER)

**Problem.** Setup and run instructions are documented: 1 finding(s) — README does not explain how to install and run.

**Why it matters.** Reproducible setup is a precondition for testing and handover.

**Recommended change.** Add a README section with prerequisites, install, environment variables (names only) and run/test commands.

**Acceptance criteria**

- [ ] README contains install and run instructions.
- [ ] Control PC-T-06 evaluates PASS on retest.
- [ ] Finding PCF-83CA52EEEB (README.md) is no longer observed on retest.

**Regression protection.** Review checklist item for setup changes.

### REM-PC-T-07 (P3, LATER)

**Problem.** Runtime version is declared: 1 finding(s) — No runtime version declaration found.

**Why it matters.** Runtime drift causes works-on-my-machine failures.

**Recommended change.** Declare the runtime version (for example "engines": {"node": "\>=22"} and an .nvmrc).

**Acceptance criteria**

- [ ] A runtime version declaration exists.
- [ ] Control PC-T-07 evaluates PASS on retest.
- [ ] Finding PCF-2BBFB74CD4 (repository) is no longer observed on retest.

**Regression protection.** CI uses the declared version file.

### REM-PC-T-08 (P3, LATER)

**Problem.** Static type checking or linting is configured: 1 finding(s) — No strict type checking or linter configuration found.

**Why it matters.** Cheap automated checks catch common defects introduced by fast iteration.

**Recommended change.** Enable TypeScript strict mode and/or a linter (ESLint, Biome, Ruff) and run it in CI.

**Acceptance criteria**

- [ ] tsconfig has strict: true or a linter configuration exists.
- [ ] Control PC-T-08 evaluates PASS on retest.
- [ ] Finding PCF-9C547F7002 (repository) is no longer observed on retest.

**Regression protection.** Lint/typecheck CI step.

### REM-PC-T-09 (P3, LATER)

**Problem.** Dependency versions are bounded: 2 finding(s) — @​supabase/supabase-js is declared as "latest".

**Why it matters.** Bounded versions make dependency changes reviewable events.

**Recommended change.** Replace open-ended ranges with explicit versions (and keep the lockfile).

**Acceptance criteria**

- [ ] No "\*", "latest", empty or unpinned URL versions in manifests.
- [ ] Control PC-T-09 evaluates PASS on retest.
- [ ] Finding PCF-14B347C463 (package.json:9) is no longer observed on retest.
- [ ] Finding PCF-C205AFB621 (package.json:10) is no longer observed on retest.

**Regression protection.** Automated dependency-update tool opening reviewed pull requests.

### REM-PC-S-07 (P3, LATER)

**Problem.** MIME-type sniffing is disabled: 1 finding(s) — No X-Content-Type-Options header.

**Why it matters.** Cheap defence against content-type confusion.

**Recommended change.** Send \`X-Content-Type-Options: nosniff\` on all responses.

**Acceptance criteria**

- [ ] Header present with value nosniff.
- [ ] Control PC-S-07 evaluates PASS on retest.
- [ ] Finding PCF-026FD4A0D8 (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** Header assertion test.

Candidate (javascript (node --test)):

```
// Save as test/nosniff.test.mjs and run: BASE_URL=http://127.0.0.1:4785 node --test
import test from "node:test";
import assert from "node:assert/strict";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4785";
test("nosniff", async () => {
  const res = await fetch(BASE_URL, { redirect: "manual" });
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

```

### REM-PC-S-10 (P3, LATER)

**Problem.** Server and framework versions are not disclosed: 1 finding(s) — X-Powered-By: Next.js

**Why it matters.** Reduces information given to automated scanners.

**Recommended change.** Disable X-Powered-By (Next.js: \`poweredByHeader: false\`; Express: \`app.disable('x-powered-by')\`) and strip versions from Server.

**Acceptance criteria**

- [ ] No X-Powered-By header; Server header without version numbers.
- [ ] Control PC-S-10 evaluates PASS on retest.
- [ ] Finding PCF-2FD01AC810 (http://127.0.0.1:4785/) is no longer observed on retest.

**Regression protection.** Header assertion test.

Candidate (javascript (node --test)):

```
// Save as test/no-stack-disclosure.test.mjs and run: BASE_URL=http://127.0.0.1:4785 node --test
import test from "node:test";
import assert from "node:assert/strict";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4785";
test("no-stack-disclosure", async () => {
  const res = await fetch(BASE_URL, { redirect: "manual" });
  assert.equal(res.headers.get("x-powered-by"), null);
});

```

### REM-PC-S-11 (P3, LATER)

**Problem.** A security contact is published: 1 finding(s) — No published security contact.

**Why it matters.** Responsible disclosure needs a known channel.

**Recommended change.** Publish /.well-known/security.txt (RFC 9116) and/or SECURITY.md with a contact address.

**Acceptance criteria**

- [ ] security.txt with Contact or SECURITY.md exists.
- [ ] Control PC-S-11 evaluates PASS on retest.
- [ ] Finding PCF-2EFAD2152B (repository) is no longer observed on retest.

**Regression protection.** Release checklist item.

## Target test architecture

| Layer | Current | Target |
|---|---|---|
| unit and integration | absent | Fast tests for business logic, data access and authorization rules, run on every pull request. |
| end-to-end journeys | absent | One end-to-end test per critical journey (sign-up to first value first), gating deployment; import results with --test-results. |
| security regression | absent | Secret scanning, dependency audit and negative authorization tests in CI; Product Check retest on each release. |
| accessibility | absent | Lint rules plus automated axe checks on key pages. |
| AI evaluation | absent | Representative and adversarial eval suites run when prompts, models or retrieval data change. |

## Traceability

| Finding | Requirement / journey | Observed | Root cause | Remediation | Retest |
|---|---|---|---|---|---|
| PCF-222F650216 | Requirement PC-S-09: Well-known sensitive paths (/.env, /.env.local, /.git/HEAD, /.git/config) are not served with their content. | /.env is publicly served and looks like env-assignments. Content was not stored. | The deployment publishes the project root (including dotfiles) as static content. | REM-PC-S-09 | NOT_RETESTED |
| PCF-484BD31627 | Requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A Stripe secret key appears at .env.local:4; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses cred… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | NOT_RETESTED |
| PCF-4DF8A34CE8 | As-built FR-007; requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A service-role JWT (bypasses row-level security) appears at lib/supabase.ts:4; the file is tracked in the git index (committed or staged). Validity was not chec… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | NOT_RETESTED |
| PCF-63B9B21478 | As-built FR-007; requirement PC-S-02: No secret-named variable uses a client-exposed prefix (NEXT\_PUBLIC\_, VITE\_, REACT\_APP\_, EXPO\_PUBLIC\_, NUXT\_PUBLIC\_, GATSBY… | NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. | A privileged key was given a client-exposed prefix so client code could call a privileged API directly. | REM-PC-S-02 | NOT_RETESTED |
| PCF-6AE991A057 | Requirement PC-S-02: No secret-named variable uses a client-exposed prefix (NEXT\_PUBLIC\_, VITE\_, REACT\_APP\_, EXPO\_PUBLIC\_, NUXT\_PUBLIC\_, GATSBY\_, PUBLIC\_). | NEXT\_PUBLIC\_OPENAI\_API\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. | A privileged key was given a client-exposed prefix so client code could call a privileged API directly. | REM-PC-S-02 | NOT_RETESTED |
| PCF-6F76AC0627 | Requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A credentials embedded in a connection URL appears at .env.local:5; the file is tracked in the git index (committed or staged). Validity was not checked (Produc… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | NOT_RETESTED |
| PCF-E2CE361289 | As-built FR-001, FR-007; requirement PC-AI-01: AI provider SDKs are not imported in client-side code and browser use is not enabled. | app/page.tsx enables dangerouslyAllowBrowser; the provider key must then be available in the browser. | The AI SDK is called directly from client components to avoid writing a server route. | REM-PC-AI-01 | NOT_RETESTED |
| PCF-E8ACA75BD3 | As-built FR-001, FR-007; requirement PC-S-02: No secret-named variable uses a client-exposed prefix (NEXT\_PUBLIC\_, VITE\_, REACT\_APP\_, EXPO\_PUBLIC\_, NUXT\_PUBLIC\_… | NEXT\_PUBLIC\_OPENAI\_API\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. | A privileged key was given a client-exposed prefix so client code could call a privileged API directly. | REM-PC-S-02 | NOT_RETESTED |
| PCF-AC6E17E07C | Requirement PC-S-03: Local .env files are ignored by .gitignore and not tracked in the git index. | .env.local is tracked in the git index (committed or staged). | .gitignore does not cover environment files, or one was committed before it did. | REM-PC-S-03 | NOT_RETESTED |
| PCF-0BD32ABB20 | Requirement PC-T-02: The repository contains automated test files and a test command. | No automated test files found. | No test harness has been set up. | REM-PC-T-02 | NOT_RETESTED |
| PCF-1E72F2F7B0 | As-built FR-001; requirement PC-S-08: Every cookie observed on passive requests has Secure and SameSite; session-like cookies also have HttpOnly. | session missing SameSite, HttpOnly | Cookie attributes are left at framework defaults. | REM-PC-S-08 | NOT_RETESTED |
| PCF-2E884D06D5 | As-built FR-003; requirement PC-T-11: When a database or ORM is used, schema migrations are kept in the repository. | Schema changes are not versioned as migrations. | The schema is changed directly (dashboard or push) rather than through versioned migrations. | REM-PC-T-11 | NOT_RETESTED |
| PCF-3E3C906C89 | Requirement PC-T-04: A continuous-integration configuration exists (GitHub Actions, GitLab CI, CircleCI, …). | No CI configuration found. | No automated pipeline was set up. | REM-PC-T-04 | NOT_RETESTED |
| PCF-3F928FCAF1 | Requirement PC-T-10: An error-tracking or telemetry SDK is a dependency (presence only; runtime operation is not verified). | No error-tracking or telemetry SDK in dependencies. | No error tracking or telemetry was added. | REM-PC-T-10 | NOT_RETESTED |
| PCF-4537D66695 | Journey: Sign up and create a first note | No end-to-end tests found. | Critical user journeys have no executable end-to-end check, or the checks fail. | REM-PC-C-08 | NOT_RETESTED |
| PCF-5C358D43AB | As-built FR-001; requirement PC-C-04: Every \<img\>/\<Image\> element has an alt attribute (empty alt for decorative images). | 1 image(s) without alt. | Image elements are rendered without alt attributes. | REM-PC-C-04 | NOT_RETESTED |
| PCF-70B846CB03 | As-built FR-001; requirement PC-S-16: No dynamic code evaluation, raw HTML injection of non-literal values, or SQL built by string interpolation. | raw HTML injection of a non-literal value at app/page.tsx:23. Whether untrusted data reaches it was not determined. | Untrusted data may reach an interpreter (JavaScript, HTML or SQL) without parameterisation or sanitisation. | REM-PC-S-16 | NOT_RETESTED |
| PCF-9901AF5D1D | As-built FR-001; requirement PC-S-12: The entry page links to a privacy notice, /privacy answers 2xx, or a privacy page exists in source. | No reachable privacy notice. | No privacy notice was published. | REM-PC-S-12 | NOT_RETESTED |
| PCF-A79BB3B752 | Requirement PC-T-01: A dependency manifest and a matching lockfile exist so builds are reproducible. | No lockfile next to the root manifest. | The lockfile was never generated or is not kept with the code. | REM-PC-T-01 | NOT_RETESTED |
| PCF-B565960DEE | Requirement PC-AI-02: AI behaviour has an evaluation suite (promptfoo config, evals directory or \*.eval.\* files). | No promptfoo config, evals/ directory or \*.eval.\* files. | AI features were added without an evaluation harness. | REM-PC-AI-02 | NOT_RETESTED |
| PCF-C7E301195D | Requirement PC-S-16: No dynamic code evaluation, raw HTML injection of non-literal values, or SQL built by string interpolation. | SQL built with string interpolation at lib/db.ts:5. Whether untrusted data reaches it was not determined. | Untrusted data may reach an interpreter (JavaScript, HTML or SQL) without parameterisation or sanitisation. | REM-PC-S-16 | NOT_RETESTED |
| PCF-CDCE917FE3 | As-built FR-002; requirement PC-S-17: No CORS configuration allows any origin ("\*") or reflects origins while allowing credentials. | CORS allows any (or reflected) origin and credentials in the same file. | CORS was opened to everything to make local development work. | REM-PC-S-17 | NOT_RETESTED |
| PCF-CEED9100D9 | As-built FR-001; requirement PC-S-06: CSP frame-ancestors or X-Frame-Options (DENY/SAMEORIGIN) is present. | No X-Frame-Options and no CSP frame-ancestors. | No framing policy is configured. | REM-PC-S-06 | NOT_RETESTED |
| PCF-CF1364323D | As-built FR-001; requirement PC-S-05: Responses carry a Content-Security-Policy that does not allow 'unsafe-inline' scripts without nonces/hashes. | No Content-Security-Policy header or meta tag. | No security headers are configured in the framework or hosting configuration. | REM-PC-S-05 | NOT_RETESTED |
| PCF-E0A3F8E153 | As-built FR-001; requirement PC-C-04: Every \<img\>/\<Image\> element has an alt attribute (empty alt for decorative images). | \<img\> without alt. | Image elements are rendered without alt attributes. | REM-PC-C-04 | NOT_RETESTED |
| PCF-026FD4A0D8 | As-built FR-001; requirement PC-S-07: X-Content-Type-Options: nosniff is present. | No X-Content-Type-Options header. | Security headers are not configured. | REM-PC-S-07 | NOT_RETESTED |
| PCF-14B347C463 | As-built FR-004; requirement PC-T-09: No dependency uses "\*", "latest", an empty range or an unpinned git/URL source. | @​supabase/supabase-js is declared as "latest". | Dependencies were added with open-ended ranges. | REM-PC-T-09 | NOT_RETESTED |
| PCF-2BBFB74CD4 | Requirement PC-T-07: The runtime version is pinned (engines field, .nvmrc, .node-version, .tool-versions or .python-version). | No runtime version declaration found. | The runtime version is implicit. | REM-PC-T-07 | NOT_RETESTED |
| PCF-2D30FA9048 | Journey: Sign up and create a first note | \<html\> has no lang attribute. | The document template omits the lang attribute. | REM-PC-C-02 | NOT_RETESTED |
| PCF-2EFAD2152B | Requirement PC-S-11: SECURITY.md in the repository or /.well-known/security.txt with a Contact field. | No published security contact. | No disclosure policy was written. | REM-PC-S-11 | NOT_RETESTED |
| PCF-2FD01AC810 | As-built FR-001; requirement PC-S-10: No X-Powered-By header and no version numbers in the Server header. | X-Powered-By: Next.js | Framework defaults advertise the stack. | REM-PC-S-10 | NOT_RETESTED |
| PCF-3D0D04F8EA | Journey: Sign up and create a first note | Unknown path answered 200. | A catch-all route answers every path with 200. | REM-PC-C-06 | NOT_RETESTED |
| PCF-5B93B2ED59 | As-built FR-001; requirement PC-C-05: The entry page has a non-empty \<title\> that is not a framework starter default. | Starter-template title "Create Next App". | The starter template's metadata was never replaced. | REM-PC-C-05 | NOT_RETESTED |
| PCF-83CA52EEEB | Requirement PC-T-06: A README explains how to install and run the project. | README does not explain how to install and run. | Documentation was not written alongside the code. | REM-PC-T-06 | NOT_RETESTED |
| PCF-9C547F7002 | Requirement PC-T-08: A type checker in strict mode or a linter configuration exists. | No strict type checking or linter configuration found. | No static analysis is configured. | REM-PC-T-08 | NOT_RETESTED |
| PCF-A355BF9FA1 | As-built FR-001; requirement PC-C-02: The root \<html\> element declares a lang attribute. | Served \<html\> has no lang attribute. | The document template omits the lang attribute. | REM-PC-C-02 | NOT_RETESTED |
| PCF-C205AFB621 | As-built FR-005; requirement PC-T-09: No dependency uses "\*", "latest", an empty range or an unpinned git/URL source. | openai is declared as "\*". | Dependencies were added with open-ended ranges. | REM-PC-T-09 | NOT_RETESTED |

## Human review required

- REM-PC-S-01 (P0): No credentials are committed in source — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-02 (P0): No server secrets are exposed through public environment prefixes — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-09 (P0): No sensitive files are publicly served — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-AI-01 (P0): AI provider calls run server-side only — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-03 (P1): Environment files are excluded from version control — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-T-11 (P2): Database schema changes are versioned — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-12 (P2): A privacy notice is available — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-16 (P2): No high-risk code patterns — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.

<sub>Generated by Product Check, an EnWithAI Engineering Commons tool. JSON is the source of truth; this file is a rendering.</sub>
