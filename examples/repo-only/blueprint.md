# Engineering blueprint: Vibe Notes (synthetic demo, source only)

> **DEMO DATA.** Synthetic example application.

Advisory only: Product Check never changes code. A remediation becomes VERIFIED only when a retest observes the control passing.

## As-is architecture (discovered)

| Component | Category | Certainty |
|---|---|---|
| `openai` | ai | observed |
| `prisma` | data | observed |
| `@supabase/supabase-js` | data | observed |
| `Next.js` | framework | observed |
| `React` | framework | observed |

### Stated uncertainties

- No deployed application was observed: runtime behaviour, headers and real user experience are unknown.
- No executed test results were imported: whether tests pass is unknown.
- No authentication library detected; whether the product has user accounts or custom auth was not determined.
- A database is used but its schema is not versioned in the repository; the live schema was not inspected.
- Authenticated, multi-step and data-changing journeys were not exercised (no browser automation or credentialed access in this release).

## To-be architecture (target changes)

- **TB-PC-C-02** All document templates declare the content language. _Why:_ Assistive technology uses it to choose pronunciation and translation tools use it to detect language. (findings: PCF-2D30FA9048)
- **TB-PC-C-04** Image components require alt text by type or lint rule. _Why:_ Text alternatives are a baseline accessibility requirement (WCAG 1.1.1). (findings: PCF-E0A3F8E153)
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
- **TB-PC-S-11** Security contact published and monitored. _Why:_ Responsible disclosure needs a known channel. (findings: PCF-2EFAD2152B)
- **TB-PC-S-16** Data never concatenated into code, markup or queries. _Why:_ Injection remains a top cause of breaches. (findings: PCF-70B846CB03, PCF-C7E301195D)
- **TB-PC-S-17** CORS allow-list per environment. _Why:_ Overly broad CORS lets hostile sites act with a user's session. (findings: PCF-CDCE917FE3)
- **TB-PC-AI-01** Client → product API → AI provider, with server-side guardrails. _Why:_ Any key used in the browser can be extracted and abused. (findings: PCF-E2CE361289)
- **TB-PC-AI-02** Prompt/model changes gated by an eval suite. _Why:_ AI behaviour changes with prompts, models and data; evals are its regression tests. (findings: PCF-B565960DEE)

## Remediation plan

| Order | Remediation | Priority | Horizon | Effort | Depends on | Human review | Verification |
|---|---|---|---|---|---|---|---|
| 1 | REM-PC-S-01: No credentials are committed in source | P0 | NOW | S | — | yes | PROPOSED |
| 2 | REM-PC-S-02: No server secrets are exposed through public environment prefixes | P0 | NOW | M | — | yes | PROPOSED |
| 3 | REM-PC-AI-01: AI provider calls run server-side only | P0 | NOW | M | — | yes | PROPOSED |
| 4 | REM-PC-S-03: Environment files are excluded from version control | P1 | NOW | S | — | yes | PROPOSED |
| 5 | REM-PC-C-04: Images have text alternatives | P2 | NEXT | S | — | no | PROPOSED |
| 6 | REM-PC-C-08: Critical journeys are covered by passing end-to-end tests | P2 | NEXT | M | REM-PC-T-02 | no | PROPOSED |
| 7 | REM-PC-T-01: Dependency manifest and lockfile are present | P2 | NEXT | S | — | no | PROPOSED |
| 8 | REM-PC-T-02: Automated tests exist | P2 | NEXT | M | — | no | PROPOSED |
| 9 | REM-PC-T-04: A CI pipeline is configured | P2 | NEXT | S | — | no | PROPOSED |
| 10 | REM-PC-T-10: Error monitoring is instrumented | P2 | NEXT | S | — | no | PROPOSED |
| 11 | REM-PC-T-11: Database schema changes are versioned | P2 | NEXT | M | — | yes | PROPOSED |
| 12 | REM-PC-S-16: No high-risk code patterns | P2 | NEXT | M | — | yes | PROPOSED |
| 13 | REM-PC-S-17: No credentialed wildcard CORS | P2 | NEXT | S | — | no | PROPOSED |
| 14 | REM-PC-AI-02: An AI evaluation suite exists | P2 | NEXT | M | — | no | PROPOSED |
| 15 | REM-PC-C-02: Page language is declared | P3 | LATER | S | — | no | PROPOSED |
| 16 | REM-PC-T-06: Setup and run instructions are documented | P3 | LATER | S | — | no | PROPOSED |
| 17 | REM-PC-T-07: Runtime version is declared | P3 | LATER | S | — | no | PROPOSED |
| 18 | REM-PC-T-08: Static type checking or linting is configured | P3 | LATER | S | — | no | PROPOSED |
| 19 | REM-PC-T-09: Dependency versions are bounded | P3 | LATER | S | REM-PC-T-01 | no | PROPOSED |
| 20 | REM-PC-S-11: A security contact is published | P3 | LATER | S | — | no | PROPOSED |

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

**Problem.** Images have text alternatives: 1 finding(s) — \<img\> without alt.

**Why it matters.** Text alternatives are a baseline accessibility requirement (WCAG 1.1.1).

**Recommended change.** Add meaningful alt text to informative images and alt="" to decorative ones.

**Acceptance criteria**

- [ ] No \<img\>/\<Image\> element without an alt attribute in the listed locations.
- [ ] Control PC-C-04 evaluates PASS on retest.
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

**Problem.** Page language is declared: 1 finding(s) — \<html\> has no lang attribute.

**Why it matters.** Assistive technology uses it to choose pronunciation and translation tools use it to detect language.

**Recommended change.** Add a lang attribute (for example lang="en") to the root \<html\> element of every document template.

**Acceptance criteria**

- [ ] Every \<html\> element in templates and the served page has a non-empty lang attribute.
- [ ] Control PC-C-02 evaluates PASS on retest.
- [ ] Finding PCF-2D30FA9048 (app/layout.tsx:5) is no longer observed on retest.

**Regression protection.** An accessibility lint rule (for example jsx-a11y/html-has-lang) or an end-to-end assertion on document.documentElement.lang.

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
| PCF-484BD31627 | Requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A Stripe secret key appears at .env.local:4; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses cred… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | NOT_RETESTED |
| PCF-4DF8A34CE8 | Requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A service-role JWT (bypasses row-level security) appears at lib/supabase.ts:4; the file is tracked in the git index (committed or staged). Validity was not chec… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | NOT_RETESTED |
| PCF-63B9B21478 | Requirement PC-S-02: No secret-named variable uses a client-exposed prefix (NEXT\_PUBLIC\_, VITE\_, REACT\_APP\_, EXPO\_PUBLIC\_, NUXT\_PUBLIC\_, GATSBY\_, PUBLIC\_). | NEXT\_PUBLIC\_SUPABASE\_SERVICE\_ROLE\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. | A privileged key was given a client-exposed prefix so client code could call a privileged API directly. | REM-PC-S-02 | NOT_RETESTED |
| PCF-6AE991A057 | Requirement PC-S-02: No secret-named variable uses a client-exposed prefix (NEXT\_PUBLIC\_, VITE\_, REACT\_APP\_, EXPO\_PUBLIC\_, NUXT\_PUBLIC\_, GATSBY\_, PUBLIC\_). | NEXT\_PUBLIC\_OPENAI\_API\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. | A privileged key was given a client-exposed prefix so client code could call a privileged API directly. | REM-PC-S-02 | NOT_RETESTED |
| PCF-6F76AC0627 | Requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A credentials embedded in a connection URL appears at .env.local:5; the file is tracked in the git index (committed or staged). Validity was not checked (Produc… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | NOT_RETESTED |
| PCF-E2CE361289 | Requirement PC-AI-01: AI provider SDKs are not imported in client-side code and browser use is not enabled. | app/page.tsx enables dangerouslyAllowBrowser; the provider key must then be available in the browser. | The AI SDK is called directly from client components to avoid writing a server route. | REM-PC-AI-01 | NOT_RETESTED |
| PCF-E8ACA75BD3 | Requirement PC-S-02: No secret-named variable uses a client-exposed prefix (NEXT\_PUBLIC\_, VITE\_, REACT\_APP\_, EXPO\_PUBLIC\_, NUXT\_PUBLIC\_, GATSBY\_, PUBLIC\_). | NEXT\_PUBLIC\_OPENAI\_API\_KEY uses the client-exposed prefix NEXT\_PUBLIC\_; bundlers inline such variables into JavaScript served to every visitor. | A privileged key was given a client-exposed prefix so client code could call a privileged API directly. | REM-PC-S-02 | NOT_RETESTED |
| PCF-AC6E17E07C | Requirement PC-S-03: Local .env files are ignored by .gitignore and not tracked in the git index. | .env.local is tracked in the git index (committed or staged). | .gitignore does not cover environment files, or one was committed before it did. | REM-PC-S-03 | NOT_RETESTED |
| PCF-0BD32ABB20 | Requirement PC-T-02: The repository contains automated test files and a test command. | No automated test files found. | No test harness has been set up. | REM-PC-T-02 | NOT_RETESTED |
| PCF-2E884D06D5 | Requirement PC-T-11: When a database or ORM is used, schema migrations are kept in the repository. | Schema changes are not versioned as migrations. | The schema is changed directly (dashboard or push) rather than through versioned migrations. | REM-PC-T-11 | NOT_RETESTED |
| PCF-3E3C906C89 | Requirement PC-T-04: A continuous-integration configuration exists (GitHub Actions, GitLab CI, CircleCI, …). | No CI configuration found. | No automated pipeline was set up. | REM-PC-T-04 | NOT_RETESTED |
| PCF-3F928FCAF1 | Requirement PC-T-10: An error-tracking or telemetry SDK is a dependency (presence only; runtime operation is not verified). | No error-tracking or telemetry SDK in dependencies. | No error tracking or telemetry was added. | REM-PC-T-10 | NOT_RETESTED |
| PCF-4537D66695 | Requirement PC-C-08: End-to-end tests exist and their imported results pass. | No end-to-end tests found. | Critical user journeys have no executable end-to-end check, or the checks fail. | REM-PC-C-08 | NOT_RETESTED |
| PCF-70B846CB03 | Requirement PC-S-16: No dynamic code evaluation, raw HTML injection of non-literal values, or SQL built by string interpolation. | raw HTML injection of a non-literal value at app/page.tsx:23. Whether untrusted data reaches it was not determined. | Untrusted data may reach an interpreter (JavaScript, HTML or SQL) without parameterisation or sanitisation. | REM-PC-S-16 | NOT_RETESTED |
| PCF-A79BB3B752 | Requirement PC-T-01: A dependency manifest and a matching lockfile exist so builds are reproducible. | No lockfile next to the root manifest. | The lockfile was never generated or is not kept with the code. | REM-PC-T-01 | NOT_RETESTED |
| PCF-B565960DEE | Requirement PC-AI-02: AI behaviour has an evaluation suite (promptfoo config, evals directory or \*.eval.\* files). | No promptfoo config, evals/ directory or \*.eval.\* files. | AI features were added without an evaluation harness. | REM-PC-AI-02 | NOT_RETESTED |
| PCF-C7E301195D | Requirement PC-S-16: No dynamic code evaluation, raw HTML injection of non-literal values, or SQL built by string interpolation. | SQL built with string interpolation at lib/db.ts:5. Whether untrusted data reaches it was not determined. | Untrusted data may reach an interpreter (JavaScript, HTML or SQL) without parameterisation or sanitisation. | REM-PC-S-16 | NOT_RETESTED |
| PCF-CDCE917FE3 | Requirement PC-S-17: No CORS configuration allows any origin ("\*") or reflects origins while allowing credentials. | CORS allows any (or reflected) origin and credentials in the same file. | CORS was opened to everything to make local development work. | REM-PC-S-17 | NOT_RETESTED |
| PCF-E0A3F8E153 | Requirement PC-C-04: Every \<img\>/\<Image\> element has an alt attribute (empty alt for decorative images). | \<img\> without alt. | Image elements are rendered without alt attributes. | REM-PC-C-04 | NOT_RETESTED |
| PCF-14B347C463 | Requirement PC-T-09: No dependency uses "\*", "latest", an empty range or an unpinned git/URL source. | @​supabase/supabase-js is declared as "latest". | Dependencies were added with open-ended ranges. | REM-PC-T-09 | NOT_RETESTED |
| PCF-2BBFB74CD4 | Requirement PC-T-07: The runtime version is pinned (engines field, .nvmrc, .node-version, .tool-versions or .python-version). | No runtime version declaration found. | The runtime version is implicit. | REM-PC-T-07 | NOT_RETESTED |
| PCF-2D30FA9048 | Requirement PC-C-02: The root \<html\> element declares a lang attribute. | \<html\> has no lang attribute. | The document template omits the lang attribute. | REM-PC-C-02 | NOT_RETESTED |
| PCF-2EFAD2152B | Requirement PC-S-11: SECURITY.md in the repository or /.well-known/security.txt with a Contact field. | No published security contact. | No disclosure policy was written. | REM-PC-S-11 | NOT_RETESTED |
| PCF-83CA52EEEB | Requirement PC-T-06: A README explains how to install and run the project. | README does not explain how to install and run. | Documentation was not written alongside the code. | REM-PC-T-06 | NOT_RETESTED |
| PCF-9C547F7002 | Requirement PC-T-08: A type checker in strict mode or a linter configuration exists. | No strict type checking or linter configuration found. | No static analysis is configured. | REM-PC-T-08 | NOT_RETESTED |
| PCF-C205AFB621 | Requirement PC-T-09: No dependency uses "\*", "latest", an empty range or an unpinned git/URL source. | openai is declared as "\*". | Dependencies were added with open-ended ranges. | REM-PC-T-09 | NOT_RETESTED |

## Human review required

- REM-PC-S-01 (P0): No credentials are committed in source — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-02 (P0): No server secrets are exposed through public environment prefixes — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-AI-01 (P0): AI provider calls run server-side only — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-03 (P1): Environment files are excluded from version control — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-T-11 (P2): Database schema changes are versioned — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.
- REM-PC-S-16 (P2): No high-risk code patterns — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.

<sub>Generated by Product Check, an EnWithAI Engineering Commons tool. JSON is the source of truth; this file is a rendering.</sub>
