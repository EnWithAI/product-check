# Engineering blueprint: Vibe Invoices (synthetic demo)

Advisory only: Product Check never changes code. A remediation becomes VERIFIED only when a retest observes the control passing.

## As-is architecture (discovered)

| Component | Category | Certainty |
|---|---|---|
| `Next.js` | framework | observed |
| `React` | framework | observed |

### Stated uncertainties

- No deployed application was observed: runtime behaviour, headers and real user experience are unknown.
- No executed test results were imported: whether tests pass is unknown.
- Tenancy model not declared (product.multi\_tenant): isolation requirements are unknown.
- No authentication library detected; whether the product has user accounts or custom auth was not determined.
- Authenticated, multi-step and data-changing journeys were not exercised (no browser automation or credentialed access in this release).

## As-built specification (reverse-engineered)

Derived from the repository's structure without running it: 1 page(s), 1 endpoint(s), 0 data entit(y/ies), 0 integration(s), 1 configuration name(s). The full spec is in `specs/000-as-built/spec.md` (Spec Kit layout) and `as-built-spec.json`; traceability links findings to these requirement IDs.

- **FR-001** The system MUST serve the page `/checkout`. _(observed)_
- **FR-002** The system MUST handle `GET` requests to `/api/invoices`. The handler references an authentication helper, so access is likely limited to signed-in users. _(inferred)_
- **FR-003** The system MUST be configured through 1 environment variable(s): `STRIPE_SECRET_KEY`. _(observed)_

**2 question(s) only a person can answer:**

- Purpose of the Checkout area: who uses it, and what outcome it must deliver.
- Purpose of the Invoices area: who uses it, and what outcome it must deliver.

## To-be architecture (target changes)

- **TB-PC-C-08** Each critical journey has an end-to-end test that gates deployment. _Why:_ Only executed journeys provide runtime evidence that the product works for users. (findings: PCF-4537D66695)
- **TB-PC-T-01** Lockfile committed; CI installs with a frozen lockfile. _Why:_ Reproducible builds are a precondition for meaningful testing and rollback. (findings: PCF-A79BB3B752)
- **TB-PC-T-04** Every pull request runs build, lint and tests automatically. _Why:_ CI is where tests become a gate rather than a suggestion. (findings: PCF-3E3C906C89)
- **TB-PC-T-06** README documents setup, environment and test commands. _Why:_ Reproducible setup is a precondition for testing and handover. (findings: PCF-83CA52EEEB)
- **TB-PC-T-07** Runtime version declared once and used by CI and hosting. _Why:_ Runtime drift causes works-on-my-machine failures. (findings: PCF-2BBFB74CD4)
- **TB-PC-T-08** Type check and lint run in CI. _Why:_ Cheap automated checks catch common defects introduced by fast iteration. (findings: PCF-9C547F7002)

## Remediation plan

| Order | Remediation | Priority | Horizon | Effort | Depends on | Human review | Verification |
|---|---|---|---|---|---|---|---|
| 1 | REM-PC-S-01: No credentials are committed in source | P0 | NOW | S | — | yes | VERIFIED |
| 2 | REM-PC-C-08: Critical journeys are covered by passing end-to-end tests | P2 | NEXT | M | — | no | FAILED_VERIFICATION |
| 3 | REM-PC-T-01: Dependency manifest and lockfile are present | P2 | NEXT | S | — | no | FAILED_VERIFICATION |
| 4 | REM-PC-T-04: A CI pipeline is configured | P2 | NEXT | S | — | no | FAILED_VERIFICATION |
| 5 | REM-PC-T-06: Setup and run instructions are documented | P3 | LATER | S | — | no | FAILED_VERIFICATION |
| 6 | REM-PC-T-07: Runtime version is declared | P3 | LATER | S | — | no | FAILED_VERIFICATION |
| 7 | REM-PC-T-08: Static type checking or linting is configured | P3 | LATER | S | — | no | FAILED_VERIFICATION |

### REM-PC-S-01 (P0, NOW)

**Problem.** No credentials are committed in source: 1 finding(s) — A Stripe secret key appears at app/checkout/page.tsx:1; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check never uses credentials).

**Why it matters.** A committed secret must be assumed leaked; deleting it from the latest commit does not revoke it.

**Recommended change.** Rotate (revoke and reissue) every exposed credential first, then move it to environment variables / the hosting secret store and remove it from the code. Treat the history as compromised.

**Acceptance criteria**

- [ ] Each listed credential has been rotated at its provider (human confirmation).
- [ ] No secret pattern matches in repository files.
- [ ] Control PC-S-01 evaluates PASS on retest.
- [ ] Finding PCF-50D5C47465 (app/checkout/page.tsx:1) is no longer observed on retest.

**Regression protection.** A secret-scanning pre-commit hook or CI step (for example gitleaks) on every pull request.

Candidate (yaml (GitHub Actions step)):

```
# Add to your CI workflow: fails the build when credentials or public-prefixed secrets are committed.
- name: Secret guard
  run: |
    ! git grep -nE '(sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE))' -- . ':!*.lock' ':!package-lock.json'

```

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

### REM-PC-T-04 (P2, NEXT)

**Problem.** A CI pipeline is configured: 1 finding(s) — No CI configuration found.

**Why it matters.** CI is where tests become a gate rather than a suggestion.

**Recommended change.** Add a CI workflow that installs with a frozen lockfile, builds, lints and runs tests on every pull request.

**Acceptance criteria**

- [ ] A CI configuration file exists.
- [ ] Control PC-T-04 evaluates PASS on retest.
- [ ] Finding PCF-3E3C906C89 (repository) is no longer observed on retest.

**Regression protection.** Branch protection requiring CI.

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

## Target test architecture

| Layer | Current | Target |
|---|---|---|
| unit and integration | present | Fast tests for business logic, data access and authorization rules, run on every pull request. |
| end-to-end journeys | absent | One end-to-end test per critical journey (sign-up to first value first), gating deployment; import results with --test-results. |
| security regression | absent | Secret scanning, dependency audit and negative authorization tests in CI; Product Check retest on each release. |
| accessibility | absent | Lint rules plus automated axe checks on key pages. |

## Traceability

| Finding | Requirement / journey | Observed | Root cause | Remediation | Retest |
|---|---|---|---|---|---|
| PCF-50D5C47465 | As-built FR-001; requirement PC-S-01: No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files. | A Stripe secret key appears at app/checkout/page.tsx:1; the file is tracked in the git index (committed or staged). Validity was not checked (Product Check neve… | Credentials were pasted into code or committed configuration instead of the runtime secret store. | REM-PC-S-01 | VERIFIED |
| PCF-3E3C906C89 | Requirement PC-T-04: A continuous-integration configuration exists (GitHub Actions, GitLab CI, CircleCI, …). | No CI configuration found. | No automated pipeline was set up. | REM-PC-T-04 | STILL_FAILING |
| PCF-4537D66695 | Requirement PC-C-08: End-to-end tests exist and their imported results pass. | No end-to-end tests found. | Critical user journeys have no executable end-to-end check, or the checks fail. | REM-PC-C-08 | STILL_FAILING |
| PCF-A79BB3B752 | Requirement PC-T-01: A dependency manifest and a matching lockfile exist so builds are reproducible. | No lockfile next to the root manifest. | The lockfile was never generated or is not kept with the code. | REM-PC-T-01 | STILL_FAILING |
| PCF-2BBFB74CD4 | Requirement PC-T-07: The runtime version is pinned (engines field, .nvmrc, .node-version, .tool-versions or .python-version). | No runtime version declaration found. | The runtime version is implicit. | REM-PC-T-07 | STILL_FAILING |
| PCF-83CA52EEEB | Requirement PC-T-06: A README explains how to install and run the project. | README does not explain how to install and run. | Documentation was not written alongside the code. | REM-PC-T-06 | STILL_FAILING |
| PCF-9C547F7002 | Requirement PC-T-08: A type checker in strict mode or a linter configuration exists. | No strict type checking or linter configuration found. | No static analysis is configured. | REM-PC-T-08 | STILL_FAILING |

<sub>Generated by Product Check, an EnWithAI Engineering Commons tool. JSON is the source of truth; this file is a rendering.</sub>
