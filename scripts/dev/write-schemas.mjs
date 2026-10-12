// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
// One-off authoring helper kept for transparency: writes schemas/*.schema.json from the definitions below.
// The committed schemas are the source of truth; re-run only when deliberately changing the contract.
import { writeFileSync } from "node:fs";

const BASE = "https://github.com/enwithai/product-check/schemas/";
const doc = (name, title, description, body) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${BASE}${name}.schema.json`,
  title,
  description,
  ...body,
});
const obj = (properties, extra = {}) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...extra,
});
const str = (extra = {}) => ({ type: "string", ...extra });
const nstr = (extra = {}) => ({ type: ["string", "null"], ...extra });
const arr = (items, extra = {}) => ({ type: "array", items, ...extra });
const ref = (r) => ({ $ref: r });
const C = (d) => ref(`common.schema.json#/$defs/${d}`);
const ratio = { type: "number", minimum: 0, maximum: 1 };

const common = doc(
  "common",
  "Product Check shared definitions",
  "Enumerations and small shapes shared by every Product Check artifact.",
  {
    $defs: {
      schema_version: { const: "0.1.0" },
      pillar: { enum: ["customer", "technology", "trust"] },
      tier: { enum: ["CT-T0", "CT-T1", "CT-T2", "CT-T3", "CT-T4", "CT-T5", "CT-T6"] },
      stage: {
        enum: [
          "DISCOVERY_BUILD",
          "ALPHA",
          "BETA_PILOT",
          "PRE_LAUNCH",
          "LAUNCH_GATE",
          "JUST_LAUNCHED",
          "POST_LAUNCH",
          "PRODUCTION_SCALE",
          "MAJOR_CHANGE",
        ],
      },
      mode: { enum: ["SOURCE", "APPLICATION", "HYBRID", "AUTO"] },
      action: { enum: ["read-local-source", "import-artifacts", "passive-http", "exposure-probe"] },
      validation_status: { enum: ["PASS", "PARTIAL", "FAIL", "BLOCKED", "NOT_TESTED", "NOT_APPLICABLE"] },
      pop_status: { enum: ["AVAILABLE", "PARTIAL", "BLOCKED", "NOT_APPLICABLE"] },
      severity: { enum: ["P0", "P1", "P2", "P3"] },
      ux_severity: { enum: ["UX0", "UX1", "UX2", "UX3", null] },
      confidence: { enum: ["HIGH", "MEDIUM", "LOW"] },
      epistemic: { enum: ["fact", "inference", "hypothesis"] },
      verdict: { enum: ["READY", "READY_WITH_CONDITIONS", "NOT_READY", "INCONCLUSIVE"] },
      strength: { enum: ["runtime", "executed-test", "static", "imported-report", "declared", "inferred"] },
      horizon: { enum: ["NOW", "NEXT", "BEFORE_SCALE", "NEXT_CYCLE", "LATER"] },
      timestamp: { type: "string", format: "date-time" },
      evidence_id: { type: "string", pattern: "^EV-[0-9A-F]{12}$" },
      finding_id: { type: "string", pattern: "^PCF-[0-9A-F]{10}$" },
      control_id: { type: "string", pattern: "^PC-(C|T|S|AI)-[0-9]{2}$" },
      validation_id: { type: "string", pattern: "^VAL-PC-(C|T|S|AI)-[0-9]{2}$" },
      run_id: { type: "string", pattern: "^PCR-[0-9]{8}T[0-9]{6}Z-[0-9A-F]{6}$" },
      work_packet_id: { type: "string", pattern: "^WP-PC-(C|T|S|AI)-[0-9]{2}$" },
      remediation_id: { type: "string", pattern: "^REM-PC-(C|T|S|AI)-[0-9]{2}$" },
      pillar_map_nullable_number: obj({
        customer: { type: ["number", "null"] },
        technology: { type: ["number", "null"] },
        trust: { type: ["number", "null"] },
      }),
      pillar_map_number: obj({
        customer: { type: "number" },
        technology: { type: "number" },
        trust: { type: "number" },
      }),
    },
  }
);

const contract = doc(
  "scan-contract",
  "Product Check scan contract",
  "What is assessed, how, at which lifecycle tier, and which actions are authorized. Network actions require an attestation and an origin scope.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "scan-contract" },
      contract_id: str({ minLength: 1, maxLength: 200 }),
      labels: obj({ demo: { type: "boolean" } }),
      target: obj({
        name: str({ minLength: 1, maxLength: 200 }),
        purpose: nstr({ maxLength: 2000 }),
        repository: { oneOf: [{ type: "null" }, obj({ path: str({ minLength: 1 }) })] },
        application: { oneOf: [{ type: "null" }, obj({ url: str({ pattern: "^https?://" }) })] },
      }),
      mode: C("mode"),
      lifecycle_stage: C("stage"),
      tiers: { oneOf: [{ type: "null" }, arr(C("tier"), { minItems: 1, uniqueItems: true })] },
      product: obj({
        has_user_accounts: { type: ["boolean", "null"] },
        multi_tenant: { type: ["boolean", "null"] },
        handles_personal_data: { type: ["boolean", "null"] },
        uses_ai: { type: ["boolean", "null"] },
        payments: { type: ["boolean", "null"] },
      }),
      personas: arr(str({ maxLength: 200 }), { maxItems: 50 }),
      critical_journeys: arr(str({ maxLength: 500 }), { maxItems: 100 }),
      authorization: obj({
        authorized_actions: arr(C("action"), { uniqueItems: true }),
        prohibited_actions: arr(str(), { uniqueItems: true }),
        scope: obj({ origins: arr(str({ pattern: "^https?://[^/]+$" }), { uniqueItems: true }) }),
        attestation: {
          oneOf: [
            { type: "null" },
            obj({
              statement: str({ minLength: 10, maxLength: 1000 }),
              authorized_by: str({ minLength: 1, maxLength: 200 }),
              date: str({ format: "date" }),
            }),
          ],
        },
      }),
      constraints: obj({
        max_requests: { type: "integer", minimum: 1, maximum: 50 },
        request_timeout_ms: { type: "integer", minimum: 500, maximum: 30000 },
        max_files: { type: "integer", minimum: 1, maximum: 100000 },
      }),
      imports: obj({
        test_results: arr(str({ minLength: 1 }), { maxItems: 50 }),
        npm_audit: nstr(),
        har: nstr(),
        observations: nstr(),
        spec_check: nstr(),
        impact_check: nstr(),
        outcome_check: nstr(),
      }),
      control_mappings: arr(
        obj({ control_id: C("control_id"), test_name_pattern: str({ minLength: 1, maxLength: 500 }) }),
        { maxItems: 200 }
      ),
      risk_acceptances: arr(
        obj({
          id: str({ minLength: 1, maxLength: 100 }),
          control_id: { oneOf: [{ type: "null" }, C("control_id")] },
          finding_id: { oneOf: [{ type: "null" }, C("finding_id")] },
          rationale: str({ minLength: 10 }),
          owner: str({ minLength: 1 }),
          compensating_control: str({ minLength: 1 }),
          expires: str({ format: "date" }),
          closure_condition: str({ minLength: 1 }),
        }),
        { maxItems: 200 }
      ),
      scoring: obj({ min_coverage: ratio, pillar_threshold: { type: "number", minimum: 0, maximum: 100 } }),
      release: obj({ approver: nstr({ maxLength: 200 }) }),
    }),
  }
);

const pop = doc(
  "pop-coverage",
  "Product Check point-of-presence coverage",
  "Every place the assessment could observe the product, whether it was accessible, under which authorization, and what evidence came from it.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "pop-coverage" },
      pops: arr(
        obj({
          id: str({ pattern: "^[a-z0-9-]+$" }),
          category: {
            enum: ["experience", "interfaces", "source-build", "data", "operations", "ai", "governance"],
          },
          name: str(),
          status: C("pop_status"),
          relevant: { type: "boolean" },
          access: { enum: ["read-only", "none"] },
          authorization: { enum: ["authorized", "not-authorized", "not-required"] },
          scope: nstr(),
          observed_at: { oneOf: [{ type: "null" }, C("timestamp")] },
          provenance: { enum: ["observed", "imported", "declared", "inferred", "none"] },
          limitations: arr(str()),
          evidence_ids: arr(C("evidence_id")),
        })
      ),
      summary: obj({
        available: { type: "integer", minimum: 0 },
        partial: { type: "integer", minimum: 0 },
        blocked: { type: "integer", minimum: 0 },
        not_applicable: { type: "integer", minimum: 0 },
        relevant: { type: "integer", minimum: 0 },
      }),
    }),
  }
);

const evidenceItem = obj({
  id: C("evidence_id"),
  run_id: C("run_id"),
  kind: {
    enum: [
      "source-location",
      "file-presence",
      "manifest-field",
      "search-scope",
      "http-response",
      "test-result",
      "imported-report",
      "baseline-comparison",
      "declaration",
    ],
  },
  pop: str(),
  collected_at: C("timestamp"),
  strength: C("strength"),
  provenance: { enum: ["observed", "imported", "declared", "inferred"] },
  source: obj({
    locator: str({ minLength: 1, maxLength: 2000 }),
    line_start: { type: ["integer", "null"], minimum: 1 },
    line_end: { type: ["integer", "null"], minimum: 1 },
    revision: nstr(),
  }),
  summary: str({ minLength: 1, maxLength: 1000 }),
  excerpt: nstr({ maxLength: 400 }),
  checksum: {
    oneOf: [
      { type: "null" },
      obj({ algorithm: { const: "sha256" }, value: str({ pattern: "^[0-9a-f]{64}$" }) }),
    ],
  },
  redaction: obj({ applied: { type: "boolean" }, rules: arr(str()) }),
  validation_ids: arr(C("validation_id")),
});
const evidence = doc(
  "evidence",
  "Product Check evidence item",
  "One piece of evidence: where it came from, when, how strong it is, a checksum and a short redacted excerpt (never full file or response contents).",
  {
    ...evidenceItem,
  }
);

const validationItem = {
  ...obj({
    id: C("validation_id"),
    control_id: C("control_id"),
    pillar: C("pillar"),
    tier: C("tier"),
    title: str(),
    expected: str(),
    actual: str(),
    status: C("validation_status"),
    method: {
      enum: [
        "static-analysis",
        "passive-http",
        "exposure-probe",
        "imported-test-results",
        "imported-report",
        "baseline-comparison",
        "none",
      ],
    },
    strength: { oneOf: [{ type: "null" }, C("strength")] },
    reason: nstr(),
    evidence_ids: arr(C("evidence_id"), { uniqueItems: true }),
    reproduction: arr(str()),
    hard_gate: nstr({ pattern: "^G-[A-Z-]+$" }),
    weight: { enum: [1, 2, 3] },
    finding_ids: arr(C("finding_id"), { uniqueItems: true }),
  }),
  allOf: [
    {
      $comment: "Never PASS/PARTIAL/FAIL without evidence.",
      if: { properties: { status: { enum: ["PASS", "PARTIAL", "FAIL"] } } },
      then: { properties: { evidence_ids: { type: "array", minItems: 1 }, strength: C("strength") } },
    },
    {
      $comment: "Unchecked controls must say why.",
      if: { properties: { status: { enum: ["BLOCKED", "NOT_TESTED", "NOT_APPLICABLE"] } } },
      then: { properties: { reason: { type: "string", minLength: 1 } } },
    },
  ],
};
const validation = doc(
  "validation",
  "Product Check control validation",
  "The evaluation of one control: expected vs actual, status and evidence links. PASS, PARTIAL and FAIL require evidence; BLOCKED, NOT_TESTED and NOT_APPLICABLE require a reason.",
  validationItem
);

const findingItem = obj({
  id: C("finding_id"),
  control_id: C("control_id"),
  title: str({ minLength: 1 }),
  category: str(),
  pillar: C("pillar"),
  severity: C("severity"),
  ux_severity: C("ux_severity"),
  status: { enum: ["OPEN", "ACCEPTED_RISK", "RESOLVED", "UNVERIFIED"] },
  lifecycle: { enum: ["NEW", "PERSISTING", "REOPENED", "RESOLVED", "CARRIED_UNVERIFIED"] },
  epistemic: C("epistemic"),
  confidence: C("confidence"),
  reproducibility: { enum: ["deterministic", "single-observation", "not-reproduced"] },
  reproduction: arr(str()),
  pop: str(),
  location: str(),
  expected: str(),
  actual: str(),
  impact: obj({ customer: nstr(), technology: nstr(), trust: nstr() }),
  root_cause: obj({ statement: str(), certainty: C("epistemic") }),
  evidence_ids: arr(C("evidence_id"), { minItems: 1, uniqueItems: true }),
  validation_id: C("validation_id"),
  work_packet_id: { oneOf: [{ type: "null" }, C("work_packet_id")] },
  first_seen_run: C("run_id"),
  history: arr(
    obj({
      run_id: C("run_id"),
      status: { enum: ["OPEN", "ACCEPTED_RISK", "RESOLVED", "UNVERIFIED"] },
      evidence_ids: arr(C("evidence_id")),
    })
  ),
});
const finding = doc(
  "finding",
  "Product Check finding",
  "A substantiated weakness tied to one control, with severity, epistemic status, confidence, evidence, root cause and lifecycle across retests.",
  findingItem
);

const counts = obj(
  Object.fromEntries(
    ["PASS", "PARTIAL", "FAIL", "BLOCKED", "NOT_TESTED", "NOT_APPLICABLE"].map((k) => [
      k,
      { type: "integer", minimum: 0 },
    ])
  )
);
const pillarScore = obj({
  score: { type: ["number", "null"], minimum: 0, maximum: 100 },
  state: { enum: ["SCORED", "INSUFFICIENT_EVIDENCE"] },
  coverage: ratio,
  confidence: { enum: ["HIGH", "MEDIUM", "LOW", "NONE"] },
  cap: obj({ applied: { type: "boolean" }, limit: { type: ["number", "null"] }, reason: nstr() }),
  trend: {
    oneOf: [
      { type: "null" },
      obj({
        previous_score: { type: ["number", "null"] },
        delta: { type: ["number", "null"] },
        previous_run_id: C("run_id"),
      }),
    ],
  },
  counts,
  applicable_weight: { type: "number", minimum: 0 },
  checked_weight: { type: "number", minimum: 0 },
});
const scorecard = doc(
  "scorecard",
  "Product Check scorecard",
  "Customer, Technology and Trust scored separately, each with coverage and confidence. A score is null when evidence is insufficient. There is deliberately no composite score.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "scorecard" },
      rubric_version: { const: "pc-rubric-0.1" },
      pillars: obj({ customer: pillarScore, technology: pillarScore, trust: pillarScore }),
      overall_coverage: ratio,
      gates: arr(
        obj({
          gate_id: str({ pattern: "^G-[A-Z-]+$" }),
          title: str(),
          status: { enum: ["PASS", "FAIL", "UNVERIFIED", "NOT_APPLICABLE"] },
          control_ids: arr(C("control_id")),
        })
      ),
      open_findings: obj({
        P0: { type: "integer", minimum: 0 },
        P1: { type: "integer", minimum: 0 },
        P2: { type: "integer", minimum: 0 },
        P3: { type: "integer", minimum: 0 },
      }),
      accepted_risks: { type: "integer", minimum: 0 },
      blocked_controls: arr(C("control_id")),
      not_tested_controls: arr(C("control_id")),
      parameters: obj({
        min_coverage: ratio,
        pillar_threshold: { type: "number", minimum: 0, maximum: 100 },
      }),
    }),
  }
);

const vstatus = { enum: ["PROPOSED", "VERIFIED", "FAILED_VERIFICATION", "UNVERIFIED"] };
const blueprint = doc(
  "blueprint",
  "Product Check blueprint",
  "As-is and to-be architecture, prioritized remediations, agent-ready work packets, target test architecture and the finding-to-retest traceability chain. Remediations are advisory: nothing is applied to code.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "blueprint" },
      as_is: obj({
        components: arr(
          obj({
            id: str({ pattern: "^CMP-" }),
            category: str(),
            name: str(),
            certainty: { enum: ["observed", "inferred"] },
            evidence_ids: arr(C("evidence_id")),
          })
        ),
        uncertainties: arr(str()),
      }),
      to_be: obj({
        changes: arr(
          obj({
            id: str({ pattern: "^TB-" }),
            statement: str(),
            rationale: str(),
            alternatives: arr(str()),
            finding_ids: arr(C("finding_id")),
          })
        ),
      }),
      remediations: arr(
        obj({
          id: C("remediation_id"),
          control_id: C("control_id"),
          finding_ids: arr(C("finding_id"), { minItems: 1 }),
          problem: str(),
          why_it_matters: str(),
          recommended_change: str(),
          benefits: obj({ customer: nstr(), technology: nstr(), trust: nstr() }),
          horizon: C("horizon"),
          priority: C("severity"),
          effort: { enum: ["S", "M", "L", null] },
          owner: nstr(),
          depends_on: arr(C("remediation_id")),
          human_review_required: { type: "boolean" },
          acceptance_criteria: arr(str({ minLength: 5 }), { minItems: 1 }),
          regression_test: obj({
            description: str(),
            candidate: { oneOf: [{ type: "null" }, obj({ language: str(), code: str() })] },
          }),
          verification: obj({
            status: vstatus,
            method: str(),
            verified_in_run: { oneOf: [{ type: "null" }, C("run_id")] },
            evidence_ids: arr(C("evidence_id")),
          }),
        })
      ),
      work_packets: arr(
        obj({
          id: C("work_packet_id"),
          remediation_id: C("remediation_id"),
          title: str(),
          objective: str(),
          finding_ids: arr(C("finding_id"), { minItems: 1 }),
          context: obj({ locations: arr(str()), evidence_ids: arr(C("evidence_id")) }),
          constraints: arr(str()),
          suggested_steps: arr(str()),
          acceptance_criteria: arr(str({ minLength: 5 }), { minItems: 1 }),
          verification_command: str({ minLength: 1 }),
          human_approval_required: { type: "boolean" },
          status: vstatus,
        })
      ),
      test_architecture: obj({
        layers: arr(
          obj({
            layer: str(),
            current: { enum: ["present", "absent", "unknown"] },
            evidence_ids: arr(C("evidence_id")),
            target: str(),
          })
        ),
      }),
      traceability: arr(
        obj({
          finding_id: C("finding_id"),
          intent: nstr(),
          journey_or_requirement: str(),
          observed_behavior: str(),
          component: str(),
          evidence_ids: arr(C("evidence_id"), { minItems: 1 }),
          root_cause: str(),
          remediation_id: { oneOf: [{ type: "null" }, C("remediation_id")] },
          acceptance_criterion: nstr(),
          regression_test: nstr(),
          retest_outcome: { enum: ["NOT_RETESTED", "VERIFIED", "STILL_FAILING", "UNVERIFIED"] },
        })
      ),
      human_review: arr(str()),
    }),
  }
);

const verdict = doc(
  "release-verdict",
  "Product Check release verdict",
  "Readiness for the declared lifecycle objective, bounded by the evidence collected. Hard-gate failures and open P0/P1 findings cannot be averaged away.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "release-verdict" },
      verdict: C("verdict"),
      tier: C("tier"),
      tier_alias: str(),
      reasons: arr(str(), { minItems: 1 }),
      blocking_gates: arr(str({ pattern: "^G-[A-Z-]+$" })),
      blocking_findings: arr(C("finding_id")),
      not_verified: arr(C("control_id")),
      accepted_risks: arr(
        obj({
          acceptance_id: str(),
          finding_ids: arr(C("finding_id")),
          owner: str(),
          expires: str({ format: "date" }),
        })
      ),
      rejected_acceptances: arr(obj({ acceptance_id: str(), reason: str() })),
      bounded_by: str({ minLength: 1 }),
      approval: obj({ required: { type: "boolean" }, approver: nstr(), status: { const: "UNAPPROVED" } }),
      rationale: str(),
    }),
    allOf: [
      {
        $comment: "READY is impossible with blocking gates or findings.",
        if: { properties: { verdict: { const: "READY" } } },
        then: {
          properties: {
            blocking_gates: { type: "array", maxItems: 0 },
            blocking_findings: { type: "array", maxItems: 0 },
            not_verified: { type: "array", maxItems: 0 },
          },
        },
      },
    ],
  }
);

const summary = obj({
  run_id: C("run_id"),
  finished_at: C("timestamp"),
  revision: nstr(),
  verdict: C("verdict"),
  scores: C("pillar_map_nullable_number"),
  coverage: C("pillar_map_number"),
  open_findings: { type: "integer", minimum: 0 },
});
const results = doc(
  "product-check-results",
  "Product Check results",
  "The authoritative, versioned aggregate of one assessment run. Markdown, HTML and the dashboard are renderings of this document. Supports partial, failed and aborted runs.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "product-check-results" },
      run: obj({
        run_id: C("run_id"),
        status: { enum: ["COMPLETED", "PARTIAL", "FAILED", "ABORTED"] },
        started_at: C("timestamp"),
        finished_at: C("timestamp"),
        duration_ms: { type: "number", minimum: 0 },
        tool: { const: "product-check" },
        tool_version: str(),
        node_version: str(),
        methodology: obj({
          name: { const: "CT3" },
          label: str(),
          relationship: { const: "inspired" },
          reference_version: str(),
        }),
        mode_requested: C("mode"),
        mode_effective: { enum: ["SOURCE", "APPLICATION", "HYBRID", null] },
        tier: C("tier"),
        tiers_applied: arr(C("tier"), { minItems: 1 }),
        target_revision: obj({
          repository: {
            oneOf: [
              { type: "null" },
              obj({
                label: str(),
                commit: nstr({ pattern: "^[0-9a-f]{40,64}$" }),
                ref: nstr(),
                source: str(),
              }),
            ],
          },
          application: {
            oneOf: [
              { type: "null" },
              obj({
                origin: str(),
                observed_at: { oneOf: [{ type: "null" }, C("timestamp")] },
                final_status: { type: ["integer", "null"] },
              }),
            ],
          },
        }),
        phases: arr(
          obj({
            phase: { enum: ["SCAN", "TEST", "VALIDATE", "BLUEPRINT", "DASHBOARD", "REMEDIATE", "RETEST"] },
            status: { enum: ["COMPLETED", "PARTIAL", "SKIPPED", "FAILED", "ADVISORY"] },
            notes: arr(str()),
          })
        ),
        errors: arr(str()),
        network: obj({
          used: { type: "boolean" },
          requests: { type: "integer", minimum: 0 },
          origins: arr(str()),
        }),
        baseline: {
          oneOf: [{ type: "null" }, obj({ run_id: C("run_id"), sha256: str({ pattern: "^[0-9a-f]{64}$" }) })],
        },
        demo: { type: "boolean" },
      }),
      contract: ref("scan-contract.schema.json"),
      pop_coverage: ref("pop-coverage.schema.json"),
      evidence: arr(ref("evidence.schema.json")),
      validations: arr(ref("validation.schema.json")),
      findings: arr(ref("finding.schema.json")),
      scorecard: ref("scorecard.schema.json"),
      blueprint: ref("blueprint.schema.json"),
      verdict: ref("release-verdict.schema.json"),
      comparison: {
        oneOf: [
          { type: "null" },
          obj({
            baseline_run_id: C("run_id"),
            baseline_sha256: str({ pattern: "^[0-9a-f]{64}$" }),
            score_delta: C("pillar_map_nullable_number"),
            coverage_delta: C("pillar_map_number"),
            regressed_controls: arr(C("control_id")),
            improved_controls: arr(C("control_id")),
            findings_new: arr(C("finding_id")),
            findings_resolved: arr(C("finding_id")),
            findings_reopened: arr(C("finding_id")),
            findings_persisting: arr(C("finding_id")),
            findings_unverified: arr(C("finding_id")),
          }),
        ],
      },
      history: arr(summary),
      limitations: arr(
        obj({ code: str(), message: str(), count: { type: "integer", minimum: 0 }, paths: arr(str()) })
      ),
    }),
  }
);

const observation = obj({
  url: str({ pattern: "^https?://" }),
  method: { enum: ["GET", "HEAD"] },
  purpose: str({
    pattern: "^(landing|http-redirect|not-found|robots|security-txt|privacy|exposure:/[A-Za-z0-9._/-]+)$",
  }),
  requested_at: C("timestamp"),
  status: { type: ["integer", "null"] },
  redirect_location: nstr(),
  final_url: nstr(),
  headers: { type: "object", additionalProperties: { type: "string" } },
  timing_ms: { type: ["number", "null"], minimum: 0 },
  body_sha256: nstr({ pattern: "^[0-9a-f]{64}$" }),
  body_bytes: { type: ["integer", "null"], minimum: 0 },
  truncated: { type: "boolean" },
  html: {
    oneOf: [
      { type: "null" },
      obj({
        title: nstr({ maxLength: 300 }),
        lang: nstr({ maxLength: 50 }),
        has_viewport: { type: "boolean" },
        meta_csp: nstr({ maxLength: 2000 }),
        img_total: { type: "integer", minimum: 0 },
        img_missing_alt: { type: "integer", minimum: 0 },
        privacy_link: nstr({ maxLength: 500 }),
      }),
    ],
  },
  exposure: { oneOf: [{ type: "null" }, obj({ looks_sensitive: { type: "boolean" }, signature: nstr() })] },
  error: nstr(),
});
const observations = doc(
  "observations",
  "Product Check recorded application observations",
  "Passive HTTP observations (live, recorded with --record-observations, or converted from a HAR file). Only security-relevant response headers and derived page facts are kept, never bodies or request headers.",
  {
    ...obj({
      schema_version: C("schema_version"),
      kind: { const: "observations" },
      origin: str({ pattern: "^https?://[^/]+$" }),
      source: { enum: ["live", "har", "recorded"] },
      observations: arr(observation, { maxItems: 200 }),
    }),
  }
);

for (const s of [
  common,
  contract,
  pop,
  evidence,
  validation,
  finding,
  scorecard,
  blueprint,
  verdict,
  results,
  observations,
]) {
  const name = s.$id.slice(BASE.length);
  writeFileSync(new URL(`../../schemas/${name}`, import.meta.url), `${JSON.stringify(s, null, 2)}\n`);
}
console.log("schemas written");
