// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The control catalog (rubric pc-rubric-0.2). Each control states what is expected, which pillar and lifecycle
 * tier it belongs to, its weight, whether it backs a hard gate, and the remediation knowledge used by the
 * blueprint. Evaluation logic lives in evaluators; this file is data only.
 */
import type { Horizon, Pillar, Severity, Tier, UxSeverity } from "../types.js";

/** Remediation knowledge attached to a control (used only when the control fails). */
export interface RemediationTemplate {
  change: string;
  why: string;
  to_be: string;
  alternatives: string[];
  steps: string[];
  acceptance: string[];
  regression: string;
  effort: "S" | "M" | "L" | null;
  human_review: boolean;
  depends_on: string[];
  horizon?: Horizon;
}

/** One control in the catalog. */
export interface ControlDef {
  id: string;
  pillar: Pillar;
  tier: Tier;
  title: string;
  expected: string;
  category: string;
  /** 3 = hard-gate/critical, 2 = core, 1 = hygiene. */
  weight: 1 | 2 | 3;
  gate: string | null;
  severity: Severity;
  ux: UxSeverity | null;
  pops: string[];
  impact: { customer: string | null; technology: string | null; trust: string | null };
  root_cause: string;
  remediation: RemediationTemplate;
}

/** Hard gates: a FAIL on any member control blocks READY regardless of scores. */
export const GATES: { id: string; title: string }[] = [
  { id: "G-SECRETS", title: "No exposed production secrets or client-side privileged keys" },
  { id: "G-AUTHZ", title: "No authentication or authorization bypass on privileged paths" },
  { id: "G-ISOLATION", title: "No cross-tenant or cross-user data exposure" },
];

const VERIFY =
  "Re-run Product Check with `product-check retest --baseline <previous results>` and confirm the control evaluates PASS with new evidence.";

/** Shorthand for a remediation template. */
function rem(
  r: Partial<RemediationTemplate> &
    Pick<RemediationTemplate, "change" | "why" | "to_be" | "acceptance" | "regression">
): RemediationTemplate {
  return {
    alternatives: [],
    steps: [],
    effort: null,
    human_review: false,
    depends_on: [],
    ...r,
  };
}

export const CONTROLS: ControlDef[] = [
  // ------------------------------------------------------------------------------------------------- Customer
  {
    id: "PC-C-01",
    pillar: "customer",
    tier: "CT-T1",
    title: "Application is reachable over HTTPS",
    expected: "The declared URL answers with a 2xx page over HTTPS (after same-origin redirects).",
    category: "availability",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: "UX0",
    pops: ["deployed-web"],
    impact: {
      customer: "Users cannot reach the product or see browser security warnings.",
      technology: "Deployment or routing is broken.",
      trust: "Plain HTTP exposes traffic to interception.",
    },
    root_cause: "The deployment is not serving the entry page successfully over HTTPS.",
    remediation: rem({
      change: "Serve the entry page over HTTPS with a 2xx response; fix the failing route or deployment.",
      why: "Every journey starts here; an unreachable or insecure entry page blocks all value.",
      to_be: "Entry page served over HTTPS by the hosting edge with a monitored 2xx response.",
      steps: [
        "Open the URL in a browser and the hosting provider's deployment log.",
        "Fix the failing route, build or certificate.",
        "Add an uptime/synthetic check for the entry page.",
      ],
      acceptance: [
        "GET <url> returns 2xx over HTTPS after at most 3 same-origin redirects.",
        "Control PC-C-01 evaluates PASS on retest.",
      ],
      regression:
        "A synthetic check (or end-to-end smoke test) requesting the entry page on every deployment.",
      effort: "S",
    }),
  },
  {
    id: "PC-C-02",
    pillar: "customer",
    tier: "CT-T1",
    title: "Page language is declared",
    expected: "The root <html> element declares a lang attribute.",
    category: "accessibility",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: "UX3",
    pops: ["deployed-web", "repository"],
    impact: { customer: "Screen readers may mispronounce content.", technology: null, trust: null },
    root_cause: "The document template omits the lang attribute.",
    remediation: rem({
      change:
        'Add a lang attribute (for example lang="en") to the root <html> element of every document template.',
      why: "Assistive technology uses it to choose pronunciation and translation tools use it to detect language.",
      to_be: "All document templates declare the content language.",
      acceptance: [
        "Every <html> element in templates and the served page has a non-empty lang attribute.",
        "Control PC-C-02 evaluates PASS on retest.",
      ],
      regression:
        "An accessibility lint rule (for example jsx-a11y/html-has-lang) or an end-to-end assertion on document.documentElement.lang.",
      effort: "S",
    }),
  },
  {
    id: "PC-C-03",
    pillar: "customer",
    tier: "CT-T1",
    title: "Page is configured for mobile viewports",
    expected: "A responsive viewport meta tag is present.",
    category: "experience",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: "UX2",
    pops: ["deployed-web", "repository"],
    impact: { customer: "Mobile users get a zoomed-out desktop layout.", technology: null, trust: null },
    root_cause: "No viewport meta tag is emitted by the document template.",
    remediation: rem({
      change:
        'Emit <meta name="viewport" content="width=device-width, initial-scale=1"> from the root template.',
      why: "Most first visits are on phones; without it the layout is unusable on small screens.",
      to_be: "Root template emits a responsive viewport declaration.",
      acceptance: [
        "The served entry page contains a viewport meta tag with width=device-width.",
        "Control PC-C-03 evaluates PASS on retest.",
      ],
      regression: "End-to-end test asserting the viewport meta tag on the entry page.",
      effort: "S",
    }),
  },
  {
    id: "PC-C-04",
    pillar: "customer",
    tier: "CT-T1",
    title: "Images have text alternatives",
    expected: "Every <img>/<Image> element has an alt attribute (empty alt for decorative images).",
    category: "accessibility",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: "UX2",
    pops: ["deployed-web", "repository"],
    impact: {
      customer: "Blind and low-vision users miss information conveyed by images.",
      technology: null,
      trust: null,
    },
    root_cause: "Image elements are rendered without alt attributes.",
    remediation: rem({
      change: 'Add meaningful alt text to informative images and alt="" to decorative ones.',
      why: "Text alternatives are a baseline accessibility requirement (WCAG 1.1.1).",
      to_be: "Image components require alt text by type or lint rule.",
      acceptance: [
        "No <img>/<Image> element without an alt attribute in the listed locations.",
        "Control PC-C-04 evaluates PASS on retest.",
      ],
      regression: "Enable jsx-a11y/alt-text (or an equivalent) in lint and CI.",
      effort: "S",
    }),
  },
  {
    id: "PC-C-05",
    pillar: "customer",
    tier: "CT-T1",
    title: "Entry page has a meaningful title",
    expected: "The entry page has a non-empty <title> that is not a framework starter default.",
    category: "experience",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: "UX3",
    pops: ["deployed-web"],
    impact: {
      customer:
        "Tabs, bookmarks and search results show a generic or empty name; the product looks unfinished.",
      technology: null,
      trust: "A starter-template title signals an unreviewed release.",
    },
    root_cause: "The starter template's metadata was never replaced.",
    remediation: rem({
      change: "Set a product-specific title (and description) in the root metadata.",
      why: "The title is the first product copy users and search engines see.",
      to_be: "Root metadata carries the product name and purpose.",
      acceptance: [
        "The entry page <title> is non-empty and not a known starter default.",
        "Control PC-C-05 evaluates PASS on retest.",
      ],
      regression: "End-to-end assertion on the page title.",
      effort: "S",
    }),
  },
  {
    id: "PC-C-06",
    pillar: "customer",
    tier: "CT-T1",
    title: "Unknown URLs return a real 404 page",
    expected: 'A request for a non-existent path returns HTTP 404 (not a 200 "soft 404").',
    category: "experience",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: "UX3",
    pops: ["deployed-web", "repository"],
    impact: {
      customer: "Broken links show confusing content instead of a helpful not-found page.",
      technology: "Soft 404s pollute monitoring and search indexes.",
      trust: null,
    },
    root_cause: "A catch-all route answers every path with 200.",
    remediation: rem({
      change:
        "Return status 404 with a helpful not-found page for unknown routes (for SPAs, configure the host's fallback to send 404 for unknown non-app paths or render a not-found view).",
      why: "Correct status codes let users, crawlers and monitors distinguish missing content from working pages.",
      to_be: "Router has an explicit not-found route that sets status 404.",
      acceptance: ["GET <origin>/<random path> returns 404.", "Control PC-C-06 evaluates PASS on retest."],
      regression: "Smoke test requesting a random path and asserting 404.",
      effort: "S",
    }),
  },
  {
    id: "PC-C-07",
    pillar: "customer",
    tier: "CT-T1",
    title: "Entry page responds quickly",
    expected: "The entry page's server response completes within 2,500 ms (single passive sample).",
    category: "performance",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: "UX2",
    pops: ["deployed-web"],
    impact: {
      customer: "Slow first responses increase abandonment.",
      technology: "May indicate cold starts or slow data fetching on the critical path.",
      trust: null,
    },
    root_cause:
      "Server-side work on the entry page's critical path is slow (cold start, blocking data fetch or missing cache).",
    remediation: rem({
      change:
        "Profile the entry route; cache or statically render it; move slow data fetching off the critical path.",
      why: "Time to first value starts with the first response.",
      to_be: "Entry page served from cache or static rendering with measured latency budgets.",
      acceptance: [
        "Median of 5 samples of the entry page under 2,500 ms.",
        "Control PC-C-07 evaluates PASS on retest.",
      ],
      regression: "A performance budget check (synthetic or Lighthouse CI) on the entry page.",
      effort: "M",
    }),
  },
  {
    id: "PC-C-08",
    pillar: "customer",
    tier: "CT-T1",
    title: "Critical journeys are covered by passing end-to-end tests",
    expected: "End-to-end tests exist and their imported results pass.",
    category: "journeys",
    weight: 2,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["automated-tests", "test-results"],
    impact: {
      customer: "Core journeys can break without anyone noticing before users do.",
      technology: "No executable definition of 'the product works'.",
      trust: null,
    },
    root_cause: "Critical user journeys have no executable end-to-end check, or the checks fail.",
    remediation: rem({
      change:
        "Write end-to-end tests (for example Playwright) for the declared critical journeys, run them in CI and import their JUnit results.",
      why: "Only executed journeys provide runtime evidence that the product works for users.",
      to_be: "Each critical journey has an end-to-end test that gates deployment.",
      acceptance: [
        "At least one end-to-end suite runs and all its cases pass in imported results.",
        "Control PC-C-08 evaluates PASS on retest.",
      ],
      regression: "The end-to-end suite itself, run on every pull request and deployment.",
      effort: "M",
      depends_on: ["PC-T-02"],
    }),
  },
  {
    id: "PC-C-09",
    pillar: "customer",
    tier: "CT-T1",
    title: "A new user can complete onboarding unaided",
    expected:
      "Imported test results mapped to this control (control_mappings) show the onboarding journey passing.",
    category: "journeys",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: "UX0",
    pops: ["test-results"],
    impact: { customer: "New users may fail to reach first value.", technology: null, trust: null },
    root_cause: "The onboarding journey fails or is not verified.",
    remediation: rem({
      change: "Fix the failing onboarding step and keep an end-to-end test of sign-up to first value.",
      why: "Onboarding failure loses users before they see any value.",
      to_be: "Onboarding journey covered by an end-to-end test that gates deployment.",
      acceptance: [
        "Mapped onboarding tests pass in imported results.",
        "Control PC-C-09 evaluates PASS on retest.",
      ],
      regression: "End-to-end onboarding test in CI.",
      effort: "M",
    }),
  },
  {
    id: "PC-C-10",
    pillar: "customer",
    tier: "CT-T0",
    title: "Requirements are specific and testable",
    expected: "An imported Spec Check report shows no high-severity requirement findings.",
    category: "intent",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["documentation"],
    impact: {
      customer: "Ambiguous intent produces features users did not ask for.",
      technology: "Untestable requirements cannot be verified.",
      trust: null,
    },
    root_cause: "Requirements contain ambiguous or unverifiable statements.",
    remediation: rem({
      change: "Resolve the high-severity Spec Check findings (add measurable acceptance criteria).",
      why: "Clear, testable intent is the start of the traceability chain.",
      to_be: "Each requirement has measurable acceptance criteria linked to tests.",
      acceptance: [
        "Spec Check reports zero high-severity findings.",
        "Control PC-C-10 evaluates PASS on retest.",
      ],
      regression: "Run Spec Check in CI on specification changes.",
      effort: "M",
    }),
  },
  {
    id: "PC-C-11",
    pillar: "customer",
    tier: "CT-T4",
    title: "Real-user journey health is observed in production",
    expected: "Production telemetry shows critical journeys succeeding for real users.",
    category: "launch-watch",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["observability"],
    impact: {
      customer: "Escaped defects affect real users without detection.",
      technology: null,
      trust: null,
    },
    root_cause: "No production journey telemetry is available to the assessment.",
    remediation: rem({
      change:
        "Instrument critical journeys (success/failure events) and make the telemetry available to the assessment.",
      why: "After launch, production evidence supersedes pre-launch assumptions.",
      to_be: "Journey success rates are measured and alerted on.",
      acceptance: [
        "Journey success metrics exist for each critical journey.",
        "Control PC-C-11 can be evaluated.",
      ],
      regression: "Alerting on journey success-rate drops.",
      effort: "M",
    }),
  },

  // ------------------------------------------------------------------------------------------------- Technology
  {
    id: "PC-T-01",
    pillar: "technology",
    tier: "CT-T0",
    title: "Dependency manifest and lockfile are present",
    expected: "A dependency manifest and a matching lockfile exist so builds are reproducible.",
    category: "build",
    weight: 2,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["dependency-manifests"],
    impact: {
      customer: null,
      technology: "Builds can silently pick up different dependency versions.",
      trust: "Unreviewed dependency changes can enter production.",
    },
    root_cause: "The lockfile was never generated or is not kept with the code.",
    remediation: rem({
      change:
        "Generate and commit the package manager's lockfile; use the frozen install command (npm ci / pnpm install --frozen-lockfile) in CI.",
      why: "Reproducible builds are a precondition for meaningful testing and rollback.",
      to_be: "Lockfile committed; CI installs with a frozen lockfile.",
      acceptance: ["A lockfile exists next to each manifest.", "Control PC-T-01 evaluates PASS on retest."],
      regression: "CI fails when the lockfile is out of date (frozen install).",
      effort: "S",
    }),
  },
  {
    id: "PC-T-02",
    pillar: "technology",
    tier: "CT-T0",
    title: "Automated tests exist",
    expected: "The repository contains automated test files and a test command.",
    category: "testability",
    weight: 2,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["automated-tests"],
    impact: {
      customer: "Regressions reach users.",
      technology: "Changes cannot be verified quickly or safely.",
      trust: null,
    },
    root_cause: "No test harness has been set up.",
    remediation: rem({
      change:
        "Add a test runner (for example Vitest or Jest) with a `test` script and start with tests for the riskiest logic.",
      why: "Tests turn 'it seemed to work' into repeatable evidence.",
      to_be: "Unit and integration tests run with one command locally and in CI.",
      steps: [
        "Install a test runner as a dev dependency.",
        "Add a `test` script.",
        "Write tests for authentication, payments and data-writing code first.",
      ],
      acceptance: [
        "Test files exist and `npm test` (or equivalent) is defined.",
        "Control PC-T-02 evaluates PASS on retest.",
      ],
      regression: "The test suite itself, required in CI.",
      effort: "M",
    }),
  },
  {
    id: "PC-T-03",
    pillar: "technology",
    tier: "CT-T0",
    title: "Automated tests pass",
    expected: "Imported test results (JUnit XML or Jest/Vitest JSON) show zero failures.",
    category: "testability",
    weight: 3,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["test-results"],
    impact: {
      customer: "Known-broken behaviour may ship.",
      technology: "The test suite reports failures.",
      trust: null,
    },
    root_cause: "Code or tests are broken at the scanned revision.",
    remediation: rem({
      change:
        "Fix the failing tests (or the code they reveal as broken); never skip or delete them to go green.",
      why: "Failing tests are direct evidence of broken behaviour.",
      to_be: "Main branch is always green; failures block merges.",
      acceptance: [
        "Imported test results show zero failures and zero errors.",
        "Control PC-T-03 evaluates PASS on retest.",
      ],
      regression: "Branch protection requiring the test job to pass.",
      effort: "M",
      human_review: true,
    }),
  },
  {
    id: "PC-T-04",
    pillar: "technology",
    tier: "CT-T0",
    title: "A CI pipeline is configured",
    expected: "A continuous-integration configuration exists (GitHub Actions, GitLab CI, CircleCI, …).",
    category: "delivery",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["ci-cd"],
    impact: { customer: null, technology: "Nothing checks changes before they ship.", trust: null },
    root_cause: "No automated pipeline was set up.",
    remediation: rem({
      change:
        "Add a CI workflow that installs with a frozen lockfile, builds, lints and runs tests on every pull request.",
      why: "CI is where tests become a gate rather than a suggestion.",
      to_be: "Every pull request runs build, lint and tests automatically.",
      acceptance: ["A CI configuration file exists.", "Control PC-T-04 evaluates PASS on retest."],
      regression: "Branch protection requiring CI.",
      effort: "S",
    }),
  },
  {
    id: "PC-T-05",
    pillar: "technology",
    tier: "CT-T1",
    title: "CI runs the tests",
    expected: "The CI configuration invokes the test command.",
    category: "delivery",
    weight: 2,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["ci-cd"],
    impact: { customer: null, technology: "Tests exist but do not gate changes.", trust: null },
    root_cause: "The CI workflow builds or deploys without running tests.",
    remediation: rem({
      change: "Add a test step (npm test / pnpm test / pytest …) to the CI workflow.",
      why: "Unexecuted tests provide no protection.",
      to_be: "Test step runs on every pull request and blocks merging on failure.",
      acceptance: ["A CI file contains a test command.", "Control PC-T-05 evaluates PASS on retest."],
      regression: "Branch protection requiring the test job.",
      effort: "S",
      depends_on: ["PC-T-02", "PC-T-04"],
    }),
  },
  {
    id: "PC-T-06",
    pillar: "technology",
    tier: "CT-T0",
    title: "Setup and run instructions are documented",
    expected: "A README explains how to install and run the project.",
    category: "operability",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["documentation"],
    impact: {
      customer: null,
      technology: "New contributors (human or agent) cannot reproduce the environment.",
      trust: null,
    },
    root_cause: "Documentation was not written alongside the code.",
    remediation: rem({
      change:
        "Add a README section with prerequisites, install, environment variables (names only) and run/test commands.",
      why: "Reproducible setup is a precondition for testing and handover.",
      to_be: "README documents setup, environment and test commands.",
      acceptance: [
        "README contains install and run instructions.",
        "Control PC-T-06 evaluates PASS on retest.",
      ],
      regression: "Review checklist item for setup changes.",
      effort: "S",
    }),
  },
  {
    id: "PC-T-07",
    pillar: "technology",
    tier: "CT-T0",
    title: "Runtime version is declared",
    expected:
      "The runtime version is pinned (engines field, .nvmrc, .node-version, .tool-versions or .python-version).",
    category: "build",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["dependency-manifests"],
    impact: {
      customer: null,
      technology: "Local, CI and production may run different runtime versions.",
      trust: null,
    },
    root_cause: "The runtime version is implicit.",
    remediation: rem({
      change: 'Declare the runtime version (for example "engines": {"node": ">=22"} and an .nvmrc).',
      why: "Runtime drift causes works-on-my-machine failures.",
      to_be: "Runtime version declared once and used by CI and hosting.",
      acceptance: ["A runtime version declaration exists.", "Control PC-T-07 evaluates PASS on retest."],
      regression: "CI uses the declared version file.",
      effort: "S",
    }),
  },
  {
    id: "PC-T-08",
    pillar: "technology",
    tier: "CT-T1",
    title: "Static type checking or linting is configured",
    expected: "A type checker in strict mode or a linter configuration exists.",
    category: "code-health",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: null,
      technology: "Classes of defects that tools catch for free reach runtime.",
      trust: null,
    },
    root_cause: "No static analysis is configured.",
    remediation: rem({
      change: "Enable TypeScript strict mode and/or a linter (ESLint, Biome, Ruff) and run it in CI.",
      why: "Cheap automated checks catch common defects introduced by fast iteration.",
      to_be: "Type check and lint run in CI.",
      acceptance: [
        "tsconfig has strict: true or a linter configuration exists.",
        "Control PC-T-08 evaluates PASS on retest.",
      ],
      regression: "Lint/typecheck CI step.",
      effort: "S",
    }),
  },
  {
    id: "PC-T-09",
    pillar: "technology",
    tier: "CT-T1",
    title: "Dependency versions are bounded",
    expected: 'No dependency uses "*", "latest", an empty range or an unpinned git/URL source.',
    category: "build",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["dependency-manifests"],
    impact: {
      customer: null,
      technology: "A new upstream release can change behaviour without any code change.",
      trust: "Supply-chain changes enter unreviewed.",
    },
    root_cause: "Dependencies were added with open-ended ranges.",
    remediation: rem({
      change: "Replace open-ended ranges with explicit versions (and keep the lockfile).",
      why: "Bounded versions make dependency changes reviewable events.",
      to_be: "All dependencies declared with bounded ranges; updates via reviewed pull requests.",
      acceptance: [
        'No "*", "latest", empty or unpinned URL versions in manifests.',
        "Control PC-T-09 evaluates PASS on retest.",
      ],
      regression: "Automated dependency-update tool opening reviewed pull requests.",
      effort: "S",
      depends_on: ["PC-T-01"],
    }),
  },
  {
    id: "PC-T-10",
    pillar: "technology",
    tier: "CT-T2",
    title: "Error monitoring is instrumented",
    expected:
      "An error-tracking or telemetry SDK is a dependency (presence only; runtime operation is not verified).",
    category: "operability",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["dependency-manifests", "observability"],
    impact: {
      customer: "Users hit errors nobody sees.",
      technology: "Production failures are invisible.",
      trust: null,
    },
    root_cause: "No error tracking or telemetry was added.",
    remediation: rem({
      change:
        "Add an error-tracking or OpenTelemetry SDK, initialise it on server and client, and configure alerting.",
      why: "You cannot fix what you cannot see; this is a precondition for launch watch.",
      to_be: "Errors and traces flow to a monitored backend with alerts.",
      acceptance: [
        "A monitoring SDK is installed and initialised.",
        "Control PC-T-10 evaluates PASS on retest.",
      ],
      regression: "A deliberate test error in staging appears in the monitoring tool.",
      effort: "S",
    }),
  },
  {
    id: "PC-T-11",
    pillar: "technology",
    tier: "CT-T0",
    title: "Database schema changes are versioned",
    expected: "When a database or ORM is used, schema migrations are kept in the repository.",
    category: "data",
    weight: 2,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["database-schema"],
    impact: {
      customer: "Data can be lost or corrupted by ad-hoc schema edits.",
      technology: "Environments drift; rollbacks are unreliable.",
      trust: "Schema changes are not reviewable.",
    },
    root_cause:
      "The schema is changed directly (dashboard or push) rather than through versioned migrations.",
    remediation: rem({
      change:
        "Generate migrations with the ORM/database tool (prisma migrate, drizzle-kit, supabase migration) and commit them.",
      why: "Versioned migrations make data changes reviewable, repeatable and reversible.",
      to_be: "Every schema change is a reviewed migration applied by the deployment pipeline.",
      acceptance: [
        "A migrations directory exists with at least one migration.",
        "Control PC-T-11 evaluates PASS on retest.",
      ],
      regression: "CI applies migrations to a fresh database.",
      effort: "M",
      human_review: true,
    }),
  },
  {
    id: "PC-T-12",
    pillar: "technology",
    tier: "CT-T3",
    title: "Change impact of the release candidate is reviewed",
    expected: "An imported Impact Check report shows no unreviewed high-severity impact findings.",
    category: "change",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: null,
      technology: "High-impact changes may ship without targeted verification.",
      trust: null,
    },
    root_cause: "The release candidate contains high-impact changes that have not been verified.",
    remediation: rem({
      change: "Review each high-severity Impact Check finding and run the suggested tests.",
      why: "A launch verdict applies only to the exact change that was verified.",
      to_be: "Impact review is part of the release checklist.",
      acceptance: [
        "High-severity impact findings are reviewed and their candidate tests executed.",
        "Control PC-T-12 evaluates PASS on retest.",
      ],
      regression: "Impact Check in pull-request CI.",
      effort: "S",
    }),
  },
  {
    id: "PC-T-13",
    pillar: "technology",
    tier: "CT-T3",
    title: "Rollback path is verified",
    expected: "Imported test results mapped to this control show a successful rollback/restore rehearsal.",
    category: "recovery",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["test-results"],
    impact: {
      customer: "A bad release cannot be undone quickly.",
      technology: "Recovery is unrehearsed.",
      trust: null,
    },
    root_cause: "Rollback and restore procedures have not been exercised.",
    remediation: rem({
      change:
        "Rehearse rollback (and database restore) in staging; automate it as a test and import its result.",
      why: "Launch is only safe when a known-good state can be restored.",
      to_be: "Rollback is a rehearsed, automated procedure.",
      acceptance: [
        "Mapped rollback test passes in imported results.",
        "Control PC-T-13 evaluates PASS on retest.",
      ],
      regression: "Periodic restore drill.",
      effort: "M",
      human_review: true,
    }),
  },
  {
    id: "PC-T-14",
    pillar: "technology",
    tier: "CT-T4",
    title: "Production monitoring and alerting are live",
    expected: "Production telemetry and alert configuration are available to the assessment.",
    category: "launch-watch",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["observability"],
    impact: {
      customer: "Incidents are discovered by users.",
      technology: "No detection of escaped defects.",
      trust: null,
    },
    root_cause: "No production telemetry is connected to the assessment.",
    remediation: rem({
      change:
        "Connect production metrics, logs and alerts; this release of Product Check has no telemetry adapter, so record evidence manually.",
      why: "Launch watch depends on detection speed.",
      to_be: "Alerts on error rate, latency and journey success.",
      acceptance: ["Alerting is configured for critical signals."],
      regression: "Alert test on deployment.",
      effort: "M",
    }),
  },
  {
    id: "PC-T-15",
    pillar: "technology",
    tier: "CT-T5",
    title: "Delivery is stable after launch",
    expected:
      "An imported Outcome Check report shows a CI first-pass rate of at least 80% and no reverted PRs.",
    category: "stabilization",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["ci-cd"],
    impact: {
      customer: null,
      technology: "Frequent CI failures or reverts indicate an unstable delivery process.",
      trust: null,
    },
    root_cause: "Changes frequently fail CI on first attempt or are reverted.",
    remediation: rem({
      change:
        "Investigate the main causes of first-pass CI failures and reverts; add tests where defects escaped.",
      why: "Stabilization means fewer escaped defects and less rework.",
      to_be: "Stable delivery with regression tests for escaped defects.",
      acceptance: [
        "Outcome Check CI first-pass rate ≥ 80% and zero reverts in the window.",
        "Control PC-T-15 evaluates PASS on retest.",
      ],
      regression: "Outcome Check reviewed monthly.",
      effort: "M",
    }),
  },
  {
    id: "PC-T-16",
    pillar: "technology",
    tier: "CT-T6",
    title: "No control regressed since the previous run",
    expected: "Compared with the baseline results, no control went from PASS to FAIL or PARTIAL.",
    category: "continuous-assurance",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["repository", "deployed-web"],
    impact: {
      customer: "Previously working behaviour broke.",
      technology: "Regression protection is missing for these controls.",
      trust: null,
    },
    root_cause: "A change reintroduced a previously fixed weakness.",
    remediation: rem({
      change: "Fix each regressed control and add the regression test described in its remediation.",
      why: "Continuous assurance means fixed things stay fixed.",
      to_be: "Every fixed finding has an automated regression check.",
      acceptance: ["No regressed controls on retest.", "Control PC-T-16 evaluates PASS on retest."],
      regression: "Run Product Check retest on every release.",
      effort: "M",
    }),
  },

  // ------------------------------------------------------------------------------------------------- Trust
  {
    id: "PC-T-17",
    pillar: "technology",
    tier: "CT-T3",
    title: "Architecture model matches the code",
    expected:
      "An imported Architecture Check report shows no verified drift of medium severity or above between the declared architecture model and the code.",
    category: "architecture",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: null,
      technology:
        "Reviews, onboarding and risk decisions rely on an architecture model that no longer describes the system.",
      trust: null,
    },
    root_cause: "The code changed (or the model was edited) without the other being updated.",
    remediation: rem({
      change:
        "Resolve each verified Architecture Check finding: update the model where the code is right, or change the code where it breaks a declared boundary.",
      why: "A launch decision about the architecture is only as good as the model it is made against.",
      to_be: "The declared model and the code agree, and Architecture Check runs on every pull request.",
      acceptance: [
        "The Architecture Check report has no verified finding of medium severity or above.",
        "Control PC-T-17 evaluates PASS on retest.",
      ],
      regression: "Architecture Check in pull-request CI.",
      effort: "S",
    }),
  },
  {
    id: "PC-S-01",
    pillar: "trust",
    tier: "CT-T0",
    title: "No credentials are committed in source",
    expected:
      "No secret-like credential (API keys, tokens, private keys, service-role JWTs, credentialed URLs) in repository files.",
    category: "secrets",
    weight: 3,
    gate: "G-SECRETS",
    severity: "P0",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: "Attackers can act as the product against customer data.",
      technology: null,
      trust: "Anyone with repository access (or a public mirror) holds working credentials.",
    },
    root_cause:
      "Credentials were pasted into code or committed configuration instead of the runtime secret store.",
    remediation: rem({
      change:
        "Rotate (revoke and reissue) every exposed credential first, then move it to environment variables / the hosting secret store and remove it from the code. Treat the history as compromised.",
      why: "A committed secret must be assumed leaked; deleting it from the latest commit does not revoke it.",
      to_be: "Secrets live only in the hosting provider's secret store and are read server-side at runtime.",
      alternatives: [
        "Use a secret manager (cloud KMS / Vault / Doppler) instead of plain environment variables.",
      ],
      steps: [
        "Revoke and reissue each credential at its provider.",
        "Replace literals with process.env lookups on the server.",
        "Add the secret file patterns to .gitignore.",
        "Optionally purge history (git filter-repo) after rotation.",
      ],
      acceptance: [
        "Each listed credential has been rotated at its provider (human confirmation).",
        "No secret pattern matches in repository files.",
        "Control PC-S-01 evaluates PASS on retest.",
      ],
      regression:
        "A secret-scanning pre-commit hook or CI step (for example gitleaks) on every pull request.",
      effort: "S",
      human_review: true,
      horizon: "NOW",
    }),
  },
  {
    id: "PC-S-02",
    pillar: "trust",
    tier: "CT-T0",
    title: "No server secrets are exposed through public environment prefixes",
    expected:
      "No secret-named variable uses a client-exposed prefix (NEXT_PUBLIC_, VITE_, REACT_APP_, EXPO_PUBLIC_, NUXT_PUBLIC_, GATSBY_, PUBLIC_).",
    category: "secrets",
    weight: 3,
    gate: "G-SECRETS",
    severity: "P0",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: "Any visitor can extract the key from the browser bundle.",
      technology: null,
      trust: "Service-role or provider keys in the client bypass every server-side control.",
    },
    root_cause:
      "A privileged key was given a client-exposed prefix so client code could call a privileged API directly.",
    remediation: rem({
      change:
        "Rename the variable without the public prefix, move the privileged call into a server route/function, rotate the key, and give the client only publishable keys.",
      why: "Bundlers inline public-prefixed variables into JavaScript that every visitor downloads.",
      to_be: "Client calls the product's own server API; privileged keys stay server-side.",
      alternatives: [
        "Use row-level security with the publishable/anon key for direct database access from the client.",
      ],
      steps: [
        "Rotate the key.",
        "Create a server route that performs the privileged operation with authorization checks.",
        "Update client code to call that route.",
        "Remove the public-prefixed variable everywhere.",
      ],
      acceptance: [
        "No secret-named variable with a public prefix in source or env files.",
        "Rotated key confirmed by a human.",
        "Control PC-S-02 evaluates PASS on retest.",
      ],
      regression: "Lint rule or CI grep rejecting public-prefixed secret names.",
      effort: "M",
      human_review: true,
      horizon: "NOW",
    }),
  },
  {
    id: "PC-S-03",
    pillar: "trust",
    tier: "CT-T0",
    title: "Environment files are excluded from version control",
    expected: "Local .env files are ignored by .gitignore and not tracked in the git index.",
    category: "secrets",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: null,
      technology: null,
      trust: "Local secrets get committed with the next `git add .`.",
    },
    root_cause: ".gitignore does not cover environment files, or one was committed before it did.",
    remediation: rem({
      change:
        "Add `.env*` (with `!.env.example`) to .gitignore and `git rm --cached` any tracked env file; rotate values that were committed.",
      why: "Environment files are where real secrets live during development.",
      to_be: "Only a placeholder .env.example is tracked.",
      acceptance: [
        ".gitignore ignores .env files.",
        "No .env file (other than examples) is tracked.",
        "Control PC-S-03 evaluates PASS on retest.",
      ],
      regression: "Secret-scanning pre-commit hook.",
      effort: "S",
      human_review: true,
    }),
  },
  {
    id: "PC-S-04",
    pillar: "trust",
    tier: "CT-T2",
    title: "HTTPS is enforced",
    expected: "Plain-HTTP requests redirect to HTTPS and responses carry Strict-Transport-Security.",
    category: "transport",
    weight: 2,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["deployed-web"],
    impact: {
      customer: null,
      technology: null,
      trust: "First visits and downgraded connections can be intercepted.",
    },
    root_cause: "The hosting edge does not force HTTPS or send HSTS.",
    remediation: rem({
      change:
        "Redirect HTTP to HTTPS at the edge and send `Strict-Transport-Security: max-age=31536000; includeSubDomains`.",
      why: "HSTS stops protocol-downgrade and cookie-stealing attacks after the first visit.",
      to_be: "Edge enforces HTTPS and HSTS for every response.",
      acceptance: [
        "GET http://<host>/ answers with a redirect to https://.",
        "HTTPS responses include Strict-Transport-Security with max-age ≥ 15552000.",
        "Control PC-S-04 evaluates PASS on retest.",
      ],
      regression: "Header assertion test (candidate below).",
      effort: "S",
    }),
  },
  {
    id: "PC-S-05",
    pillar: "trust",
    tier: "CT-T2",
    title: "A Content Security Policy is set",
    expected:
      "Responses carry a Content-Security-Policy that does not allow 'unsafe-inline' scripts without nonces/hashes.",
    category: "browser-hardening",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["deployed-web"],
    impact: {
      customer: null,
      technology: null,
      trust: "Any injection flaw becomes full script execution in users' browsers.",
    },
    root_cause: "No security headers are configured in the framework or hosting configuration.",
    remediation: rem({
      change:
        "Define a Content-Security-Policy (start with Content-Security-Policy-Report-Only, then enforce) in the framework or hosting header configuration.",
      why: "CSP is the main mitigation that limits the damage of cross-site scripting.",
      to_be: "Security headers defined once in framework/edge configuration and tested.",
      acceptance: [
        "Content-Security-Policy present on HTML responses.",
        "Control PC-S-05 evaluates PASS on retest.",
      ],
      regression: "Header assertion test (candidate below).",
      effort: "M",
    }),
  },
  {
    id: "PC-S-06",
    pillar: "trust",
    tier: "CT-T2",
    title: "Clickjacking protection is set",
    expected: "CSP frame-ancestors or X-Frame-Options (DENY/SAMEORIGIN) is present.",
    category: "browser-hardening",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["deployed-web"],
    impact: {
      customer: "Users can be tricked into clicking hidden controls.",
      technology: null,
      trust: "Pages can be framed by hostile sites.",
    },
    root_cause: "No framing policy is configured.",
    remediation: rem({
      change: "Send `Content-Security-Policy: frame-ancestors 'self'` (or X-Frame-Options: DENY).",
      why: "Prevents UI-redress attacks against signed-in users.",
      to_be: "Framing denied by default via security headers.",
      acceptance: [
        "frame-ancestors or X-Frame-Options present.",
        "Control PC-S-06 evaluates PASS on retest.",
      ],
      regression: "Header assertion test.",
      effort: "S",
      depends_on: ["PC-S-05"],
    }),
  },
  {
    id: "PC-S-07",
    pillar: "trust",
    tier: "CT-T2",
    title: "MIME-type sniffing is disabled",
    expected: "X-Content-Type-Options: nosniff is present.",
    category: "browser-hardening",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["deployed-web"],
    impact: {
      customer: null,
      technology: null,
      trust: "User uploads or JSON can be interpreted as script by some browsers.",
    },
    root_cause: "Security headers are not configured.",
    remediation: rem({
      change: "Send `X-Content-Type-Options: nosniff` on all responses.",
      why: "Cheap defence against content-type confusion.",
      to_be: "Baseline security headers on every response.",
      acceptance: ["Header present with value nosniff.", "Control PC-S-07 evaluates PASS on retest."],
      regression: "Header assertion test.",
      effort: "S",
    }),
  },
  {
    id: "PC-S-08",
    pillar: "trust",
    tier: "CT-T2",
    title: "Cookies are set with Secure, HttpOnly and SameSite",
    expected:
      "Every cookie observed on passive requests has Secure and SameSite; session-like cookies also have HttpOnly.",
    category: "session",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["deployed-web"],
    impact: {
      customer: null,
      technology: null,
      trust: "Session cookies can be stolen by scripts or sent cross-site.",
    },
    root_cause: "Cookie attributes are left at framework defaults.",
    remediation: rem({
      change: "Set Secure, HttpOnly (for session cookies) and SameSite=Lax/Strict on all cookies.",
      why: "Cookie flags are the cheapest defence for session integrity.",
      to_be: "Cookie policy defined centrally.",
      acceptance: [
        "All observed cookies carry the expected attributes.",
        "Control PC-S-08 evaluates PASS on retest.",
      ],
      regression: "Header assertion test on Set-Cookie.",
      effort: "S",
    }),
  },
  {
    id: "PC-S-09",
    pillar: "trust",
    tier: "CT-T0",
    title: "No sensitive files are publicly served",
    expected:
      "Well-known sensitive paths (/.env, /.env.local, /.git/HEAD, /.git/config) are not served with their content.",
    category: "secrets",
    weight: 3,
    gate: "G-SECRETS",
    severity: "P0",
    ux: null,
    pops: ["deployed-web"],
    impact: {
      customer: "Attackers can download credentials or source code.",
      technology: null,
      trust: "Complete compromise of backing services is likely.",
    },
    root_cause: "The deployment publishes the project root (including dotfiles) as static content.",
    remediation: rem({
      change:
        "Stop serving the project root: publish only the build output directory, block dotfiles at the edge, and rotate any exposed secrets.",
      why: "Exposed .env or .git content hands attackers credentials and source.",
      to_be: "Only build artefacts are deployed; dotfiles are never served.",
      steps: [
        "Rotate every secret in the exposed file.",
        "Change the hosting publish directory to the build output.",
        "Add an edge rule denying /.*",
      ],
      acceptance: [
        "Each probed path returns 404/403 or non-matching content.",
        "Control PC-S-09 evaluates PASS on retest.",
      ],
      regression: "Exposure probe on every deployment.",
      effort: "S",
      human_review: true,
      horizon: "NOW",
    }),
  },
  {
    id: "PC-S-10",
    pillar: "trust",
    tier: "CT-T2",
    title: "Server and framework versions are not disclosed",
    expected: "No X-Powered-By header and no version numbers in the Server header.",
    category: "browser-hardening",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["deployed-web"],
    impact: { customer: null, technology: null, trust: "Version banners make targeted attacks easier." },
    root_cause: "Framework defaults advertise the stack.",
    remediation: rem({
      change:
        "Disable X-Powered-By (Next.js: `poweredByHeader: false`; Express: `app.disable('x-powered-by')`) and strip versions from Server.",
      why: "Reduces information given to automated scanners.",
      to_be: "Responses do not advertise stack or versions.",
      acceptance: [
        "No X-Powered-By header; Server header without version numbers.",
        "Control PC-S-10 evaluates PASS on retest.",
      ],
      regression: "Header assertion test.",
      effort: "S",
    }),
  },
  {
    id: "PC-S-11",
    pillar: "trust",
    tier: "CT-T2",
    title: "A security contact is published",
    expected: "SECURITY.md in the repository or /.well-known/security.txt with a Contact field.",
    category: "governance",
    weight: 1,
    gate: null,
    severity: "P3",
    ux: null,
    pops: ["repository", "deployed-web"],
    impact: {
      customer: null,
      technology: null,
      trust: "Researchers who find a vulnerability have no channel to report it.",
    },
    root_cause: "No disclosure policy was written.",
    remediation: rem({
      change: "Publish /.well-known/security.txt (RFC 9116) and/or SECURITY.md with a contact address.",
      why: "Responsible disclosure needs a known channel.",
      to_be: "Security contact published and monitored.",
      acceptance: [
        "security.txt with Contact or SECURITY.md exists.",
        "Control PC-S-11 evaluates PASS on retest.",
      ],
      regression: "Release checklist item.",
      effort: "S",
    }),
  },
  {
    id: "PC-S-12",
    pillar: "trust",
    tier: "CT-T2",
    title: "A privacy notice is available",
    expected:
      "The entry page links to a privacy notice, /privacy answers 2xx, or a privacy page exists in source.",
    category: "privacy",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["deployed-web", "repository"],
    impact: {
      customer: "Users cannot learn what happens to their data.",
      technology: null,
      trust:
        "Personal-data processing without a notice is a legal and reputational risk (this is not a legal assessment).",
    },
    root_cause: "No privacy notice was published.",
    remediation: rem({
      change:
        "Publish a privacy notice describing data collected, purposes, processors and retention; link it from the footer.",
      why: "Transparency is a baseline expectation wherever personal data is processed.",
      to_be: "Privacy notice linked from every page footer and kept with the code.",
      acceptance: [
        "A privacy page is reachable from the entry page.",
        "Control PC-S-12 evaluates PASS on retest.",
      ],
      regression: "End-to-end link check.",
      effort: "S",
      human_review: true,
    }),
  },
  {
    id: "PC-S-13",
    pillar: "trust",
    tier: "CT-T0",
    title: "Authorization is enforced on privileged paths",
    expected:
      "Imported test results mapped to this control show unauthenticated and under-privileged requests to privileged routes being denied.",
    category: "access-control",
    weight: 3,
    gate: "G-AUTHZ",
    severity: "P0",
    ux: null,
    pops: ["test-results"],
    impact: {
      customer: "Other users' data or admin functions could be reachable.",
      technology: null,
      trust: "Authorization bypass is a critical breach path.",
    },
    root_cause: "Privileged routes do not verify the caller's identity and role on the server.",
    remediation: rem({
      change:
        "Enforce authentication and role checks server-side on every privileged route; add negative tests (no session, wrong role, other user's resource).",
      why: "Client-side checks are not access control.",
      to_be: "Central server-side authorization middleware with deny-by-default.",
      steps: [
        "List privileged routes.",
        "Add server-side checks.",
        "Write negative tests and map them with control_mappings to PC-S-13.",
      ],
      acceptance: [
        "Mapped authorization tests pass in imported results.",
        "Control PC-S-13 evaluates PASS on retest.",
      ],
      regression: "Negative authorization tests in CI.",
      effort: "M",
      human_review: true,
    }),
  },
  {
    id: "PC-S-14",
    pillar: "trust",
    tier: "CT-T2",
    title: "Tenant and user data are isolated",
    expected:
      "Imported test results mapped to this control show one tenant/user cannot read or change another's data.",
    category: "isolation",
    weight: 3,
    gate: "G-ISOLATION",
    severity: "P0",
    ux: null,
    pops: ["test-results"],
    impact: {
      customer: "Customers could see each other's data.",
      technology: null,
      trust: "Cross-tenant exposure is a critical breach.",
    },
    root_cause: "Queries are not scoped to the caller's tenant/user, or row-level security is missing.",
    remediation: rem({
      change:
        "Scope every data access to the authenticated tenant/user (row-level security or mandatory query scoping) and add two-tenant tests.",
      why: "Isolation failures expose every customer at once.",
      to_be: "Tenant scoping enforced in the data layer, not in UI code.",
      acceptance: ["Mapped two-tenant isolation tests pass.", "Control PC-S-14 evaluates PASS on retest."],
      regression: "Two-tenant isolation tests in CI.",
      effort: "L",
      human_review: true,
    }),
  },
  {
    id: "PC-S-15",
    pillar: "trust",
    tier: "CT-T2",
    title: "No critical or high known vulnerabilities in dependencies",
    expected: "An imported `npm audit --json` report shows zero critical and zero high vulnerabilities.",
    category: "supply-chain",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["dependency-manifests"],
    impact: {
      customer: null,
      technology: "Known-vulnerable code is in the build.",
      trust: "Publicly known exploits may apply.",
    },
    root_cause: "Dependencies are not updated when advisories are published.",
    remediation: rem({
      change:
        "Update or replace the vulnerable packages (npm audit fix, or upgrade the parent dependency); document any advisory that does not apply.",
      why: "Known vulnerabilities are the cheapest attack path.",
      to_be: "Automated dependency updates and audit in CI.",
      acceptance: [
        "npm audit reports zero critical/high vulnerabilities.",
        "Control PC-S-15 evaluates PASS on retest.",
      ],
      regression: "`npm audit --audit-level=high` in CI.",
      effort: "S",
      depends_on: ["PC-T-01"],
    }),
  },
  {
    id: "PC-S-16",
    pillar: "trust",
    tier: "CT-T1",
    title: "No high-risk code patterns",
    expected:
      "No dynamic code evaluation, raw HTML injection of non-literal values, or SQL built by string interpolation.",
    category: "injection",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: null,
      technology: null,
      trust: "These patterns are common roots of XSS, injection and remote code execution.",
    },
    root_cause:
      "Untrusted data may reach an interpreter (JavaScript, HTML or SQL) without parameterisation or sanitisation.",
    remediation: rem({
      change:
        "Replace eval/new Function; sanitise HTML (DOMPurify) or render text; use parameterised queries / the ORM's safe API.",
      why: "Injection remains a top cause of breaches.",
      to_be: "Data never concatenated into code, markup or queries.",
      acceptance: [
        "Each listed location is fixed or documented as handling only trusted constants.",
        "Control PC-S-16 evaluates PASS on retest.",
      ],
      regression:
        "Lint rules (no-eval, react/no-danger) and a test with a malicious payload for each fixed path.",
      effort: "M",
      human_review: true,
    }),
  },
  {
    id: "PC-S-17",
    pillar: "trust",
    tier: "CT-T2",
    title: "No credentialed wildcard CORS",
    expected: 'No CORS configuration allows any origin ("*") or reflects origins while allowing credentials.',
    category: "access-control",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["repository"],
    impact: {
      customer: null,
      technology: null,
      trust: "Other websites may call the API with users' credentials.",
    },
    root_cause: "CORS was opened to everything to make local development work.",
    remediation: rem({
      change:
        "Allow-list the product's own origins; never combine wildcard/reflected origins with credentials.",
      why: "Overly broad CORS lets hostile sites act with a user's session.",
      to_be: "CORS allow-list per environment.",
      acceptance: ["CORS configuration lists explicit origins.", "Control PC-S-17 evaluates PASS on retest."],
      regression: "Integration test sending a foreign Origin header.",
      effort: "S",
    }),
  },
  {
    id: "PC-AI-01",
    pillar: "trust",
    tier: "CT-T0",
    title: "AI provider calls run server-side only",
    expected: "AI provider SDKs are not imported in client-side code and browser use is not enabled.",
    category: "ai",
    weight: 3,
    gate: "G-SECRETS",
    severity: "P0",
    ux: null,
    pops: ["ai-integration", "repository"],
    impact: {
      customer: null,
      technology: "Cost and abuse are uncontrolled.",
      trust: "The AI provider key is shipped to every visitor's browser.",
    },
    root_cause: "The AI SDK is called directly from client components to avoid writing a server route.",
    remediation: rem({
      change:
        "Move AI calls into a server route with authentication, rate limiting and input validation; rotate the key.",
      why: "Any key used in the browser can be extracted and abused.",
      to_be: "Client → product API → AI provider, with server-side guardrails.",
      acceptance: [
        "No AI SDK import in client-side files; no dangerouslyAllowBrowser.",
        "Control PC-AI-01 evaluates PASS on retest.",
      ],
      regression: "Lint rule forbidding AI SDK imports in client code.",
      effort: "M",
      human_review: true,
      horizon: "NOW",
    }),
  },
  {
    id: "PC-AI-02",
    pillar: "trust",
    tier: "CT-T2",
    title: "An AI evaluation suite exists",
    expected: "AI behaviour has an evaluation suite (promptfoo config, evals directory or *.eval.* files).",
    category: "ai",
    weight: 1,
    gate: null,
    severity: "P2",
    ux: null,
    pops: ["ai-integration"],
    impact: {
      customer: "AI answers may degrade silently after prompt or model changes.",
      technology: "No regression signal for AI behaviour.",
      trust: null,
    },
    root_cause: "AI features were added without an evaluation harness.",
    remediation: rem({
      change:
        "Add an evaluation suite with representative and adversarial cases; run it when prompts or models change.",
      why: "AI behaviour changes with prompts, models and data; evals are its regression tests.",
      to_be: "Prompt/model changes gated by an eval suite.",
      acceptance: ["Eval suite present and runnable.", "Control PC-AI-02 evaluates PASS on retest."],
      regression: "Eval suite in CI on prompt changes.",
      effort: "M",
    }),
  },
  {
    id: "PC-AI-03",
    pillar: "trust",
    tier: "CT-T2",
    title: "Prompt-injection and guardrail behaviour is tested",
    expected: "Imported test results mapped to this control show adversarial AI cases passing.",
    category: "ai",
    weight: 2,
    gate: null,
    severity: "P1",
    ux: null,
    pops: ["test-results", "ai-integration"],
    impact: {
      customer: "Users may receive harmful or manipulated output.",
      technology: null,
      trust: "Injected instructions may trigger data leakage or unintended tool use.",
    },
    root_cause: "AI inputs are not treated as untrusted and guardrails are not tested.",
    remediation: rem({
      change:
        "Add adversarial test cases (prompt injection, data exfiltration, unsafe tool calls) and map them to PC-AI-03.",
      why: "AI features that act on user or retrieved content must resist instructions hidden in that content.",
      to_be: "Guardrails tested with adversarial suites before each release.",
      acceptance: ["Mapped adversarial AI tests pass.", "Control PC-AI-03 evaluates PASS on retest."],
      regression: "Adversarial eval suite in CI.",
      effort: "M",
      human_review: true,
    }),
  },
];

/** Catalog lookup by ID. */
export const CONTROL_BY_ID: ReadonlyMap<string, ControlDef> = new Map(CONTROLS.map((c) => [c.id, c]));

/** Returns a control or throws (programming error). */
export function control(id: string): ControlDef {
  const def = CONTROL_BY_ID.get(id);
  if (!def) throw new Error(`Unknown control ${id}`);
  return def;
}

export { VERIFY as VERIFY_INSTRUCTION };
