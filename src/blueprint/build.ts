// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Builds the engineering blueprint from validated findings: discovered (as-is) architecture with stated
 * uncertainties, target (to-be) changes with rationale, prioritized remediations with measurable acceptance
 * criteria and regression tests, vendor-neutral work packets for humans or agents, the target test architecture
 * and the finding-to-retest traceability chain. Everything is advisory: Product Check never edits code, and a
 * remediation is VERIFIED only by retest evidence, never because someone reports it done.
 */
import type { EvidenceCollector } from "../evidence/collector.js";
import type { ObservationSet } from "../inspectors/http/observe.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type {
  ArchitectureComponent,
  Blueprint,
  Finding,
  Horizon,
  Remediation,
  ScanContract,
  Severity,
  TargetChange,
  TraceLink,
  Validation,
  WorkPacket,
} from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import { control, CONTROLS, VERIFY_INSTRUCTION } from "../validation/catalog.js";
import { regressionCandidate } from "./candidates.js";

const SEVERITY_ORDER: Severity[] = ["P0", "P1", "P2", "P3"];
const HORIZON_BY_SEVERITY: Record<Severity, Horizon> = { P0: "NOW", P1: "NOW", P2: "NEXT", P3: "LATER" };

/** Inputs for blueprint construction. */
export interface BlueprintInput {
  contract: ScanContract;
  repo: RepoFacts | null;
  app: ObservationSet | null;
  validations: Validation[];
  findings: Finding[];
  ev: EvidenceCollector;
  revision: string | null;
  runId: string;
  hasBaseline: boolean;
  testsImported: boolean;
  aiInScope: boolean;
}

const STANDARD_CONSTRAINTS = [
  "Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.",
  "Keep the change minimal and focused on the listed findings; do not refactor unrelated code.",
  "Do not disable, skip or delete tests or checks to make them pass.",
  "Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.",
];

/** As-is architecture components with evidence. */
function asIs(input: BlueprintInput): { components: ArchitectureComponent[]; uncertainties: string[] } {
  const components: ArchitectureComponent[] = [];
  const { repo, app, ev } = input;
  const add = (
    category: string,
    name: string,
    certainty: "observed" | "inferred",
    evidence: string[]
  ): void => {
    const id = `CMP-${category}-${name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^cmp/, "CMP");
    if (!components.some((c) => c.id === id))
      components.push({ id, category, name, certainty, evidence_ids: evidence });
  };
  if (repo) {
    const depEv = (dep: string): string[] => {
      const m = repo.deps.get(dep);
      return m
        ? [
            ev.add({
              kind: "manifest-field",
              pop: "dependency-manifests",
              strength: "static",
              provenance: "observed",
              locator: m.manifest,
              revision: input.revision,
              summary: `dependency ${dep} ${m.version}`,
              checksum: repo.snapshot.byPath.get(m.manifest)?.sha256 ?? null,
            }),
          ]
        : [];
    };
    const FW: Record<string, string> = {
      "Next.js": "next",
      React: "react",
      Vue: "vue",
      Nuxt: "nuxt",
      Svelte: "svelte",
      SvelteKit: "@sveltejs/kit",
      Astro: "astro",
      Remix: "@remix-run/react",
      Angular: "@angular/core",
      Solid: "solid-js",
      Vite: "vite",
      "Create React App": "react-scripts",
      Expo: "expo",
      "React Native": "react-native",
      Express: "express",
      Fastify: "fastify",
      NestJS: "@nestjs/core",
      Hono: "hono",
      Koa: "koa",
      Django: "django",
      Flask: "flask",
      FastAPI: "fastapi",
      Streamlit: "streamlit",
    };
    for (const fw of repo.frameworks) add("framework", fw, "observed", depEv(FW[fw] ?? fw));
    for (const d of repo.dbDeps) add("data", d, "observed", depEv(d));
    for (const d of repo.authDeps) add("authentication", d, "observed", depEv(d));
    for (const d of repo.aiDeps) add("ai", d, "observed", depEv(d));
    for (const d of repo.observability) add("observability", d, "observed", depEv(d));
    for (const h of repo.hosting)
      add("hosting", h, "observed", [
        ev.add({
          kind: "file-presence",
          pop: "iac",
          strength: "static",
          provenance: "observed",
          locator: h,
          revision: input.revision,
          summary: "hosting / infrastructure configuration",
          checksum: repo.snapshot.byPath.get(h)?.sha256 ?? null,
        }),
      ]);
    for (const c of repo.ciFiles)
      add("ci", c.path, "observed", [
        ev.add({
          kind: "file-presence",
          pop: "ci-cd",
          strength: "static",
          provenance: "observed",
          locator: c.path,
          revision: input.revision,
          summary: "CI configuration",
          checksum: c.sha256,
        }),
      ]);
    for (const t of ["vitest", "jest", "@playwright/test", "cypress", "pytest", "mocha"])
      if (repo.deps.has(t)) add("testing", t, "observed", depEv(t));
  }
  const landing = app?.observations.filter((o) => o.purpose === "landing").at(-1);
  if (app && landing && landing.status !== null) {
    const id = ev.add({
      kind: "http-response",
      pop: "deployed-web",
      strength: app.source === "har" ? "imported-report" : "runtime",
      provenance: app.source === "live" ? "observed" : "imported",
      locator: `GET ${landing.url}`,
      summary: `deployed entry point (status ${landing.status})`,
      checksum: landing.body_sha256,
    });
    add("deployment", app.origin, "observed", [id]);
    const server = landing.headers["server"];
    if (server) add("edge", server.split("/")[0] ?? server, "inferred", [id]);
  }
  const uncertainties: string[] = [];
  if (!repo)
    uncertainties.push(
      "Source code was not inspected: implementation, data model and dependencies are unknown."
    );
  if (!app)
    uncertainties.push(
      "No deployed application was observed: runtime behaviour, headers and real user experience are unknown."
    );
  if (!input.testsImported)
    uncertainties.push("No executed test results were imported: whether tests pass is unknown.");
  if (repo && !repo.snapshot.git.present)
    uncertainties.push("No git metadata: the exact revision and which files are committed are unknown.");
  if (repo && repo.snapshot.git.present && repo.snapshot.git.tracked === null)
    uncertainties.push(
      "The git index could not be read: tracked-file findings are inferences from .gitignore."
    );
  if (input.contract.product.multi_tenant === null)
    uncertainties.push(
      "Tenancy model not declared (product.multi_tenant): isolation requirements are unknown."
    );
  if (input.contract.product.uses_ai === null && !repo)
    uncertainties.push("AI use not declared and not detectable without source.");
  if (repo && repo.authDeps.length === 0 && repo.frameworks.length > 0)
    uncertainties.push(
      "No authentication library detected; whether the product has user accounts or custom auth was not determined."
    );
  if (repo && repo.dbDeps.length > 0 && repo.migrations.length === 0)
    uncertainties.push(
      "A database is used but its schema is not versioned in the repository; the live schema was not inspected."
    );
  uncertainties.push(
    "Authenticated, multi-step and data-changing journeys were not exercised (no browser automation or credentialed access in this release)."
  );
  return { components: components.sort((a, b) => (a.id < b.id ? -1 : 1)), uncertainties };
}

/** Remediation verification state for a control's findings. */
function verification(
  findings: Finding[],
  input: BlueprintInput,
  v: Validation | undefined
): Remediation["verification"] {
  const open = findings.filter((f) => f.status === "OPEN" || f.status === "ACCEPTED_RISK");
  if (findings.every((f) => f.status === "RESOLVED")) {
    return {
      status: "VERIFIED",
      method: "Retest: the control was re-evaluated and the findings were no longer observed.",
      verified_in_run: input.runId,
      evidence_ids: v?.evidence_ids ?? [],
    };
  }
  if (findings.some((f) => f.status === "UNVERIFIED") && open.length === 0) {
    return {
      status: "UNVERIFIED",
      method: "The control could not be re-checked in this run; earlier evidence is preserved.",
      verified_in_run: null,
      evidence_ids: [],
    };
  }
  if (input.hasBaseline && open.some((f) => f.lifecycle === "PERSISTING" || f.lifecycle === "REOPENED")) {
    return {
      status: "FAILED_VERIFICATION",
      method: "Retest still observes the finding(s).",
      verified_in_run: null,
      evidence_ids: v?.evidence_ids ?? [],
    };
  }
  return { status: "PROPOSED", method: VERIFY_INSTRUCTION, verified_in_run: null, evidence_ids: [] };
}

/** Builds the blueprint and links findings to work packets (mutates finding.work_packet_id). */
export function buildBlueprint(input: BlueprintInput): Blueprint {
  const validationsById = new Map(input.validations.map((v) => [v.control_id, v]));
  const byControl = new Map<string, Finding[]>();
  for (const f of input.findings) byControl.set(f.control_id, [...(byControl.get(f.control_id) ?? []), f]);
  const order = CONTROLS.map((c) => c.id);
  const controls = [...byControl.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const remediations: Remediation[] = [];
  const packets: WorkPacket[] = [];
  const changes: TargetChange[] = [];
  const origin =
    input.app?.origin ??
    (input.contract.target.application ? new URL(input.contract.target.application.url).origin : null);
  for (const cid of controls) {
    const def = control(cid);
    const fs = (byControl.get(cid) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
    const active = fs.filter((f) => f.status !== "RESOLVED");
    const relevant = active.length > 0 ? active : fs;
    const priority = SEVERITY_ORDER.find((s) => relevant.some((f) => f.severity === s)) ?? def.severity;
    const r = def.remediation;
    const remId = `REM-${cid}`;
    const ver = verification(fs, input, validationsById.get(cid));
    const locations = [...new Set(relevant.map((f) => f.location))];
    const acceptance = [
      ...r.acceptance,
      ...relevant.slice(0, 5).map((f) => `Finding ${f.id} (${f.location}) is no longer observed on retest.`),
    ];
    const humanReview = r.human_review || priority === "P0" || priority === "P1";
    remediations.push({
      id: remId,
      control_id: cid,
      finding_ids: fs.map((f) => f.id),
      problem: `${def.title}: ${relevant.length} finding(s) — ${relevant[0]?.actual ?? ""}`.slice(0, 1000),
      why_it_matters: r.why,
      recommended_change: r.change,
      benefits: { ...def.impact },
      horizon: r.horizon ?? HORIZON_BY_SEVERITY[priority],
      priority,
      effort: r.effort,
      owner: null,
      depends_on: [],
      human_review_required: humanReview,
      acceptance_criteria: acceptance,
      regression_test: { description: r.regression, candidate: regressionCandidate(cid, origin) },
      verification: ver,
    });
    const packetId = `WP-${cid}`;
    packets.push({
      id: packetId,
      remediation_id: remId,
      title: `Fix ${cid}: ${def.title}`,
      objective: r.change,
      finding_ids: fs.map((f) => f.id),
      context: {
        locations: locations.slice(0, 25),
        evidence_ids: [...new Set(relevant.flatMap((f) => f.evidence_ids))].slice(0, 25),
      },
      constraints: [
        ...STANDARD_CONSTRAINTS,
        ...(humanReview
          ? ["Security- or data-sensitive change: a human must review and approve before merge."]
          : []),
      ],
      suggested_steps:
        r.steps.length > 0
          ? r.steps
          : [
              `Inspect each location listed in context.`,
              r.change,
              `Add the regression protection: ${r.regression}`,
            ],
      acceptance_criteria: acceptance,
      verification_command:
        "product-check retest --baseline <this results file> (with the same inputs as this run)",
      human_approval_required: humanReview,
      status: ver.status,
    });
    for (const f of fs) f.work_packet_id = packetId;
    if (active.length > 0) {
      const existing = changes.find((c) => c.statement === r.to_be);
      if (existing)
        existing.finding_ids = [...new Set([...existing.finding_ids, ...active.map((f) => f.id)])].sort();
      else
        changes.push({
          id: `TB-${cid}`,
          statement: r.to_be,
          rationale: r.why,
          alternatives: r.alternatives,
          finding_ids: active.map((f) => f.id),
        });
    }
  }
  for (const rem of remediations) {
    rem.depends_on = control(rem.control_id)
      .remediation.depends_on.map((d) => `REM-${d}`)
      .filter((id) => remediations.some((x) => x.id === id && x.verification.status !== "VERIFIED"));
  }
  remediations.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.priority) - SEVERITY_ORDER.indexOf(b.priority) ||
      order.indexOf(a.control_id) - order.indexOf(b.control_id)
  );
  packets.sort(
    (a, b) =>
      remediations.findIndex((r) => r.id === a.remediation_id) -
      remediations.findIndex((r) => r.id === b.remediation_id)
  );

  const repo = input.repo;
  const ciText = repo?.ciFiles.map((f) => f.text ?? "").join("\n") ?? "";
  const unitTests = repo?.testFiles.filter((p) => !repo.e2eFiles.includes(p)) ?? [];
  const evFor = (paths: string[], what: string): string[] =>
    paths.slice(0, 3).map((p) =>
      input.ev.add({
        kind: "file-presence",
        pop: "automated-tests",
        strength: "static",
        provenance: "observed",
        locator: p,
        revision: input.revision,
        summary: what,
        checksum: repo?.snapshot.byPath.get(p)?.sha256 ?? null,
      })
    );
  const state = (present: boolean): "present" | "absent" | "unknown" =>
    repo ? (present ? "present" : "absent") : "unknown";
  const layers: Blueprint["test_architecture"]["layers"] = [
    {
      layer: "unit and integration",
      current: state(unitTests.length > 0),
      evidence_ids: evFor(unitTests, "unit/integration test file"),
      target:
        "Fast tests for business logic, data access and authorization rules, run on every pull request.",
    },
    {
      layer: "end-to-end journeys",
      current: state((repo?.e2eFiles.length ?? 0) > 0),
      evidence_ids: evFor(repo?.e2eFiles ?? [], "end-to-end test file"),
      target:
        "One end-to-end test per critical journey (sign-up to first value first), gating deployment; import results with --test-results.",
    },
    {
      layer: "security regression",
      current: state(/gitleaks|trufflehog|codeql|semgrep|npm audit|snyk|product-check/i.test(ciText)),
      evidence_ids: [],
      target:
        "Secret scanning, dependency audit and negative authorization tests in CI; Product Check retest on each release.",
    },
    {
      layer: "accessibility",
      current: state(
        !!repo &&
          (repo.deps.has("eslint-plugin-jsx-a11y") ||
            repo.deps.has("@axe-core/playwright") ||
            repo.deps.has("axe-core"))
      ),
      evidence_ids: [],
      target: "Lint rules plus automated axe checks on key pages.",
    },
  ];
  if (input.aiInScope)
    layers.push({
      layer: "AI evaluation",
      current: state((repo?.aiEvals.length ?? 0) > 0),
      evidence_ids: evFor(repo?.aiEvals ?? [], "AI evaluation file"),
      target: "Representative and adversarial eval suites run when prompts, models or retrieval data change.",
    });

  const journeys = input.contract.critical_journeys;
  const traceability: TraceLink[] = input.findings.map((f) => {
    const rem = remediations.find((r) => r.finding_ids.includes(f.id));
    return {
      finding_id: f.id,
      intent: input.contract.target.purpose,
      journey_or_requirement:
        f.pillar === "customer" && journeys.length > 0
          ? `Journey: ${journeys[0] ?? ""}`
          : `Requirement ${f.control_id}: ${f.expected}`,
      observed_behavior: f.actual,
      component: f.location,
      evidence_ids: f.evidence_ids,
      root_cause: f.root_cause.statement,
      remediation_id: rem?.id ?? null,
      acceptance_criterion: rem?.acceptance_criteria[0] ?? null,
      regression_test: rem?.regression_test.description ?? null,
      retest_outcome:
        f.lifecycle === "RESOLVED"
          ? "VERIFIED"
          : f.lifecycle === "PERSISTING" || f.lifecycle === "REOPENED"
            ? "STILL_FAILING"
            : f.lifecycle === "CARRIED_UNVERIFIED"
              ? "UNVERIFIED"
              : "NOT_RETESTED",
    };
  });

  return {
    schema_version: SCHEMA_VERSION,
    kind: "blueprint",
    as_is: asIs(input),
    to_be: { changes },
    remediations,
    work_packets: packets,
    test_architecture: { layers },
    traceability,
    human_review: remediations
      .filter((r) => r.human_review_required && r.verification.status !== "VERIFIED")
      .map(
        (r) =>
          `${r.id} (${r.priority}): ${control(r.control_id).title} — security-, data- or release-sensitive; a human must approve the change and confirm any credential rotation.`
      ),
  };
}
