// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
// One-off authoring helper kept for transparency: writes the assurance (CT3 v3.2) schemas from the definitions
// below. The committed schemas are the source of truth; re-run only when deliberately changing the contract:
//   node scripts/dev/write-assurance-schemas.mjs && npx prettier --write schemas
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
const int = (extra = {}) => ({ type: "integer", minimum: 0, ...extra });
const nint = { type: ["integer", "null"] };
const bool = { type: "boolean" };
const nbool = { type: ["boolean", "null"] };
const arr = (items, extra = {}) => ({ type: "array", items, ...extra });
const A = (d) => ({ $ref: `assurance-common.schema.json#/$defs/${d}` });
const C = (d) => ({ $ref: `common.schema.json#/$defs/${d}` });
const dt = str({ format: "date-time" });
const date = str({ format: "date" });
const sha = str({ pattern: "^[0-9a-f]{40}([0-9a-f]{24})?$" });
const nsha = nstr({ pattern: "^[0-9a-f]{40}([0-9a-f]{24})?$" });
const digest = str({ pattern: "^[0-9a-f]{64}$" });
const ndigest = nstr({ pattern: "^[0-9a-f]{64}$" });

const common = doc(
  "assurance-common",
  "Product Check assurance shared definitions",
  "Enumerations and shapes shared by the CT3 v3.2 review and closure artifacts.",
  {
    $defs: {
      schema_version: { const: "0.1.0" },
      methodology_version: { const: "CT3 v3.2" },
      verification_state: {
        enum: [
          "SUSPECTED",
          "EVIDENCE_COLLECTED",
          "REPRODUCED",
          "CORROBORATED",
          "CONFIRMED",
          "DISPROVEN",
          "NEEDS_HUMAN_TRIAGE",
        ],
      },
      closure_state: {
        enum: [
          "OPEN",
          "ACKNOWLEDGED",
          "IN_PROGRESS",
          "FIX_PROPOSED",
          "RETEST_REQUIRED",
          "VERIFIED_FIXED",
          "CLOSED",
          "REJECTED_FALSE_POSITIVE",
          "ACCEPTED_RISK",
          "DEFERRED",
          "REGRESSED",
        ],
      },
      risk_level: { enum: ["LOW", "MEDIUM", "HIGH", "UNDETERMINED"] },
      gate_status: { enum: ["PASS", "CONDITIONAL", "BLOCK", "NOT_EVALUATED"] },
      release_decision: { enum: ["GO", "CONDITIONAL_GO", "NO_GO", "UNKNOWN"] },
      fix_status: { enum: ["PROPOSED", "IMPLEMENTED_UNVERIFIED", "VERIFIED", "REGRESSED"] },
      lane: { enum: ["spec-outcome", "correctness", "impact", "trust-security", "experience", "operations"] },
      phase: { enum: ["VC-P0", "VC-P1", "VC-P2", "VC-P3", "VC-P4", "VC-P5", "VC-P6", "VC-P7"] },
      actor: obj({ id: str({ minLength: 1 }), type: { enum: ["human", "agent", "system"] } }),
      command_spec: obj({
        id: str({ minLength: 1 }),
        argv: arr(str(), { minItems: 1 }),
        purpose: {
          enum: ["build", "typecheck", "lint", "test", "smoke", "reproduction", "regression", "other"],
        },
        timeout_ms: int({ minimum: 1 }),
        cwd: str(),
        source: { enum: ["policy", "fix", "corpus"] },
      }),
      environment: obj({
        environment_id: str(),
        runner: obj({ platform: str(), arch: str(), node_version: str(), tool_version: str() }),
        lockfile_digest: ndigest,
      }),
      execution: obj({
        execution_id: str(),
        command_id: str(),
        purpose: {
          enum: ["build", "typecheck", "lint", "test", "smoke", "reproduction", "regression", "other"],
        },
        argv: arr(str()),
        cwd: str(),
        status: C("validation_status"),
        exit_code: nint,
        signal: nstr(),
        duration_ms: int(),
        started_at: dt,
        environment_id: str(),
        commit_sha: nsha,
        stdout_digest: ndigest,
        stderr_digest: ndigest,
        output_bytes: int(),
        output_truncated: bool,
        excerpt: nstr({ maxLength: 400 }),
        reason: nstr(),
        evidence_id: nstr(),
      }),
      check: obj({ check: str(), result: { enum: ["pass", "fail", "not-run"] }, detail: str() }),
      verification: obj({ state: A("verification_state"), checks: arr(A("check")) }),
      approval_evaluation: obj({
        approval_id: str(),
        approver_id: str(),
        status: {
          enum: [
            "VALID",
            "STALE",
            "INVALID_SIGNATURE",
            "UNSIGNED",
            "UNKNOWN_APPROVER",
            "NOT_HUMAN",
            "SELF_APPROVAL",
            "WRONG_SCOPE",
            "REJECTED",
          ],
        },
        reason: str(),
      }),
    },
  }
);

const policy = doc(
  "assurance-policy",
  "Product Check assurance policy",
  "Operator-owned policy: required checks (argv, no shell), approvers with Ed25519 public keys, risk routing, review convergence, release and execution settings. Never read implicitly from the scanned repository.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "assurance-policy" },
    policy_id: str({ minLength: 1 }),
    required_checks: arr(A("command_spec")),
    approvers: arr(
      obj({
        id: str({ minLength: 1 }),
        type: { enum: ["human", "bot"] },
        roles: arr(str()),
        public_key: str({ pattern: "BEGIN PUBLIC KEY" }),
      })
    ),
    risk: obj({
      protected_paths: arr(obj({ pattern: str({ minLength: 1 }), owners: arr(str()) })),
      high_risk_paths: arr(str()),
      low_risk_paths: arr(str()),
      trusted_authors: arr(str()),
      allow_low_risk_waiver: bool,
      approvals: obj({ LOW: int(), MEDIUM: int({ minimum: 1 }), HIGH: int({ minimum: 1 }) }),
    }),
    review: obj({ max_cycles: int({ minimum: 1, maximum: 20 }), fail_closed_unverified_p0: bool }),
    release: obj({ rollback_plan: nstr(), staged_rollout: nstr() }),
    exec: obj({
      env_allowlist: arr(str({ pattern: "^[A-Za-z_][A-Za-z0-9_]*$" })),
      max_output_bytes: int({ minimum: 1024, maximum: 268435456 }),
    }),
  })
);

const evidenceRecord = doc(
  "evidence-record",
  "Product Check evidence record (review-evidence.jsonl line)",
  "One append-only, hash-chained evidence record. digest = SHA-256 of the canonical JSON of every other field; prev_digest links to the previous line.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "evidence-record" },
    seq: int({ minimum: 1 }),
    evidence_id: str({ pattern: "^EVR-[0-9A-F]{12}$" }),
    recorded_at: dt,
    type: {
      enum: [
        "command-execution",
        "diff-hunk",
        "source-recheck",
        "results-artifact",
        "approval",
        "verification",
        "imported-report",
        "reviewer-claim",
        "transition",
      ],
    },
    subject: str(),
    commit_sha: nsha,
    environment_id: nstr(),
    summary: str({ maxLength: 500 }),
    locator: nstr(),
    line: nint,
    payload_digest: digest,
    payload: { type: "object" },
    prev_digest: ndigest,
    digest,
  })
);

const finding = obj({
  id: str({ pattern: "^RF-[0-9A-F]{10}$" }),
  rule_id: str(),
  lane: A("lane"),
  reviewer: obj({ id: str(), type: { enum: ["deterministic", "ai", "human", "imported"] }, version: str() }),
  title: str(),
  severity: C("severity"),
  pillars: arr(C("pillar")),
  location: obj({ path: str(), line: nint, runtime: nstr() }),
  expected: str(),
  actual: str(),
  steps_or_command: arr(str()),
  evidence_ids: arr(str()),
  confidence: C("confidence"),
  epistemic: C("epistemic"),
  impact: str(),
  affected_scope: str(),
  baseline_sha: nsha,
  head_sha: nsha,
  uncertainty: nstr(),
  verification: A("verification"),
  dedupe_key: str({ pattern: "^[0-9a-f]{20}$" }),
  occurrences: int({ minimum: 1 }),
  repeat_of_review: nstr(),
  blocking: bool,
});

const review = doc(
  "change-review",
  "Product Check change review",
  "Layered review of one change (PR_DIFF or PRE_PR_LOCAL): risk, lanes, independently verified findings, approvals, convergence cycle and the change gate. A change PASS never implies product readiness.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "change-review" },
    methodology_version: A("methodology_version"),
    review_id: str({ pattern: "^CR-[0-9A-F]{10}$" }),
    mode: { enum: ["PR_DIFF", "PRE_PR_LOCAL"] },
    change_ref: str({ minLength: 1 }),
    created_at: dt,
    target: obj({ name: str(), repository: str() }),
    base_sha: nsha,
    head_sha: nsha,
    author: obj({ id: nstr(), source: { enum: ["flag", "git", "unknown"] }, trusted: bool }),
    diff: obj({
      source: { enum: ["git", "file"] },
      digest,
      files: arr(
        obj({
          path: str(),
          previous_path: nstr(),
          status: { enum: ["added", "modified", "deleted", "renamed", "binary"] },
          additions: int(),
          deletions: int(),
          surfaces: arr(str()),
          protected: bool,
        })
      ),
      truncated: bool,
    }),
    risk: obj({
      level: A("risk_level"),
      effective_level: { enum: ["LOW", "MEDIUM", "HIGH"] },
      surfaces: arr(str()),
      reasons: arr(str()),
      protected_paths: arr(str()),
      impact_check: {
        oneOf: [
          { type: "null" },
          obj({ schema_version: str(), high: int(), affected_modules: int(), commit: nstr() }),
        ],
      },
    }),
    approvals_required: obj({
      humans: int(),
      domain_owners: arr(str()),
      waiver: obj({ eligible: bool, applied: bool, reason: str() }),
    }),
    approvals: arr(A("approval_evaluation")),
    lanes: arr(
      obj({
        lane: A("lane"),
        reviewer: str(),
        status: C("validation_status"),
        findings: int(),
        notes: arr(str()),
      })
    ),
    findings: arr(finding),
    disproven: arr(finding),
    checks: obj({ proof_run_id: nstr(), status: C("validation_status"), detail: str() }),
    baseline: { oneOf: [{ type: "null" }, obj({ run_id: str(), verdict: str(), results_sha256: digest })] },
    cycle: obj({
      number: int({ minimum: 1 }),
      max: int({ minimum: 1 }),
      previous_review_id: nstr(),
      repeated_unchanged: arr(str()),
      new_findings: arr(str()),
      escalated: bool,
    }),
    gate: obj({ status: A("gate_status"), reasons: arr(str()), blocking_finding_ids: arr(str()) }),
    product_vs_change: str(),
    limitations: arr(str()),
    evidence_ids: arr(str()),
    provenance: obj({
      tool: { const: "product-check" },
      tool_version: str(),
      policy_id: nstr(),
      policy_digest: ndigest,
    }),
  })
);

const approval = doc(
  "approval",
  "Product Check approval",
  "A signed accountable decision. Counts only when the Ed25519 signature verifies against an approver key in the policy, the approver is human, the scope matches and reviewed_sha is the current commit.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "approval" },
    approval_id: str({ pattern: "^AP-[0-9A-F]{12}$" }),
    approver: obj({ id: str({ minLength: 1 }), type: { enum: ["human", "bot"] } }),
    scope: obj({
      type: { enum: ["change", "closure", "risk-acceptance", "false-positive", "release", "continue"] },
      ref: str({ minLength: 1 }),
    }),
    reviewed_sha: str({ minLength: 7 }),
    decision: { enum: ["approve", "reject"] },
    comment: str(),
    created_at: dt,
    signature: {
      oneOf: [
        { type: "null" },
        obj({ algorithm: { const: "ed25519" }, key_id: str({ pattern: "^[0-9a-f]{16}$" }), value: str() }),
      ],
    },
  })
);

const verificationRun = doc(
  "verification-run",
  "Product Check verification run",
  "Executed proof bound to an exact commit and environment: author-side proof (VC-P1) or closure verification (VC-P5) with targeted and regression checks and retained before/after evidence.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "verification-run" },
    verification_id: str({ pattern: "^(VR-\\d{3,}|PR-[0-9A-F]{10})$" }),
    purpose: { enum: ["closure", "author-proof"] },
    finding_ids: arr(str()),
    fix_id: nstr(),
    exact_sha: nsha,
    worktree_clean: nbool,
    environment: A("environment"),
    started_at: dt,
    finished_at: dt,
    checks: arr(
      obj({
        check_id: str(),
        kind: {
          enum: [
            "control-reassessment",
            "rule-recheck",
            "command",
            "no-new-critical",
            "no-regressed-controls",
            "gate-recheck",
          ],
        },
        role: { enum: ["targeted", "regression"] },
        status: C("validation_status"),
        detail: str(),
        execution_id: nstr(),
        evidence_ids: arr(str()),
      })
    ),
    executions: arr(A("execution")),
    before_evidence_ids: arr(str()),
    after_evidence_ids: arr(str()),
    after_results: {
      oneOf: [
        { type: "null" },
        obj({
          run_id: str(),
          results_path: str(),
          results_sha256: digest,
          verdict: str(),
          open: obj({ P0: int(), P1: int(), P2: int(), P3: int() }),
        }),
      ],
    },
    result: { enum: ["PASS", "FAIL", "INCONCLUSIVE"] },
    reasons: arr(str()),
    limitations: arr(str()),
    actor: A("actor"),
  })
);

const fixPacket = doc(
  "fix-packet",
  "Product Check fix packet",
  "Agent-ready proposal for one verified finding: surfaces, evidence, root cause, change, tests (commands only when declared, never invented), negative cases, acceptance, owner, scope guard and rollback.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "fix-packet" },
    methodology_version: A("methodology_version"),
    fix_id: str({ pattern: "^FP-F-\\d{3,}$" }),
    finding_ids: arr(str(), { minItems: 1 }),
    source_finding_ids: arr(str()),
    title: str(),
    status: A("fix_status"),
    risk_class: A("risk_level"),
    severity: C("severity"),
    affected_surfaces: arr(obj({ path: nstr(), line: nint, runtime: nstr() }), { minItems: 1 }),
    user_impact: str(),
    evidence_refs: arr(str()),
    root_cause: obj({ hypothesis: str(), certainty: C("epistemic"), confidence: C("confidence") }),
    constraints: arr(str()),
    proposed_change: str(),
    tests_required: arr(
      obj({
        id: str(),
        kind: { enum: ["reproduction", "regression", "negative"] },
        description: str(),
        argv: { oneOf: [{ type: "null" }, arr(str(), { minItems: 1 })] },
      }),
      { minItems: 1 }
    ),
    negative_cases: arr(str()),
    dependencies: arr(str()),
    acceptance_conditions: arr(str(), { minItems: 1 }),
    owner: obj({ id: nstr(), accountable_human_required: { const: true } }),
    rollback_plan: str({ minLength: 1 }),
    scope_guard: obj({ allowed_paths: arr(str()), note: str() }),
    traceability: obj({ control_or_rule: str(), spec_requirement_ids: arr(str()), locations: arr(str()) }),
    implementation: obj({ change_sha: nsha, implemented_by: { oneOf: [{ type: "null" }, A("actor")] } }),
    generated_from: obj({ results_run_id: nstr(), review_id: nstr() }),
  })
);

const transition = obj({
  seq: int({ minimum: 1 }),
  from: { oneOf: [{ type: "null" }, A("closure_state")] },
  to: A("closure_state"),
  at: dt,
  actor: A("actor"),
  reason: str(),
  refs: obj({
    evidence_ids: arr(str()),
    verification_id: nstr(),
    approval_ids: arr(str()),
    fix_id: nstr(),
    run_id: nstr(),
  }),
  prev_digest: ndigest,
  digest,
});

const register = doc(
  "closure-register",
  "Product Check closure register",
  "Verified-closure state of every finding with hash-chained transitions, fixes, verification runs, signed approvals, risk acceptances and the regression corpus.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "closure-register" },
    methodology_version: A("methodology_version"),
    register_id: str(),
    target: obj({ name: str(), repository: nstr() }),
    created_at: dt,
    updated_at: dt,
    baseline: obj({ run_id: str(), results_sha256: digest, baseline_sha: nsha }),
    settings: obj({ max_cycles: int({ minimum: 1 }) }),
    entries: arr(
      obj({
        finding_id: str({ pattern: "^F-\\d{3,}$" }),
        source: { enum: ["baseline-scan", "change-review", "incident"] },
        source_finding_id: str(),
        rule_or_control: str(),
        title: str(),
        severity: C("severity"),
        pillar: C("pillar"),
        epistemic: C("epistemic"),
        location: str(),
        dedupe_key: str(),
        verification: A("verification"),
        state: A("closure_state"),
        opened_in: str(),
        cycles: int(),
        escalated: bool,
        fix_ids: arr(str()),
        verification_ids: arr(str()),
        approval_ids: arr(str()),
        acceptance_id: nstr(),
        regressions: arr(obj({ at: dt, run_id: str(), previous_state: A("closure_state") })),
        closure: {
          oneOf: [
            { type: "null" },
            obj({
              closure_id: str({ pattern: "^CL-\\d{3,}$" }),
              actor: A("actor"),
              at: dt,
              verification_id: str(),
              approval_ids: arr(str(), { minItems: 1 }),
            }),
          ],
        },
        transitions: arr(transition, { minItems: 1 }),
      })
    ),
    fixes: arr(
      obj({
        fix_id: str({ pattern: "^FX-\\d{3,}$" }),
        finding_ids: arr(str(), { minItems: 1 }),
        change_sha: sha,
        implemented_by: A("actor"),
        status: A("fix_status"),
        reproduction: arr(A("command_spec")),
        recorded_at: dt,
      })
    ),
    verification_runs: arr({ $ref: "verification-run.schema.json" }),
    approvals: arr({ $ref: "approval.schema.json" }),
    risk_acceptances: arr(
      obj({
        acceptance_id: str({ pattern: "^RA-\\d{3,}$" }),
        finding_id: str(),
        owner: str({ minLength: 1 }),
        scope: str({ minLength: 1 }),
        rationale: str({ minLength: 1 }),
        compensating_controls: arr(str(), { minItems: 1 }),
        review_date: date,
        expires: date,
        closure_condition: str({ minLength: 1 }),
        approval_ids: arr(str(), { minItems: 1 }),
        created_at: dt,
      })
    ),
    regression_corpus: arr(
      obj({
        case_id: str(),
        finding_id: str(),
        origin: { enum: ["escaped-incident", "regressed-finding", "verified-fix"] },
        description: str(),
        command: A("command_spec"),
        added_at: dt,
        added_by: A("actor"),
      })
    ),
    chain: obj({ length: int(), head_digest: ndigest }),
  })
);

const gate = doc(
  "release-gate",
  "Product Check release gate",
  "Explicit GO / CONDITIONAL_GO / NO_GO / UNKNOWN decision with release conditions, open blockers, accepted-risk expiry, approvals for the head commit, executed checks, disclosed coverage gaps and VC-P0…P7 phase progress.",
  obj({
    schema_version: A("schema_version"),
    kind: { const: "release-gate" },
    methodology_version: A("methodology_version"),
    gate_id: str({ pattern: "^RG-[0-9A-F]{10}$" }),
    evaluated_at: dt,
    target: obj({ name: str(), repository: nstr() }),
    head_sha: nsha,
    decision: A("release_decision"),
    product_verdict: C("verdict"),
    change_gate: { oneOf: [{ type: "null" }, A("gate_status")] },
    conditions: arr(
      obj({
        id: str({ pattern: "^RC-\\d+$" }),
        title: str(),
        status: { enum: ["PASS", "FAIL", "NOT_EVALUATED"] },
        detail: str(),
        refs: arr(str()),
      }),
      { minItems: 1 }
    ),
    blocking_reasons: arr(str(), { minItems: 1 }),
    open: obj({ P0: int(), P1: int(), P2: int(), P3: int() }),
    open_blocking_ids: arr(str()),
    accepted_risks: arr(
      obj({
        acceptance_id: str(),
        finding_id: str(),
        expires: date,
        status: { enum: ["ACTIVE", "REVIEW_DUE", "EXPIRED"] },
      })
    ),
    approvals: obj({ required: int(), valid: int(), stale: int() }),
    executed_checks: obj({ count: int(), passed: int(), failed: int(), not_run: int() }),
    coverage: obj({
      customer: { type: "number", minimum: 0, maximum: 1 },
      technology: { type: "number", minimum: 0, maximum: 1 },
      trust: { type: "number", minimum: 0, maximum: 1 },
      overall: { type: "number", minimum: 0, maximum: 1 },
      gaps: arr(str()),
    }),
    rollback: obj({ declared: bool, ref: nstr() }),
    phases: arr(
      obj({
        phase: A("phase"),
        name: str(),
        status: { enum: ["COMPLETED", "PARTIAL", "NOT_STARTED", "NOT_SUPPORTED"] },
        evidence: arr(str()),
      }),
      { minItems: 8, maxItems: 8 }
    ),
    inputs: obj({
      results_sha256: digest,
      register_digest: ndigest,
      review_id: nstr(),
      proof_run_id: nstr(),
    }),
  })
);

const claims = doc(
  "reviewer-findings",
  "External reviewer findings (input)",
  "Claims from an external reviewer (for example an AI code reviewer). They are proposals: Product Check verifies each against the code and never treats one as a human approval or a proven defect.",
  obj({
    kind: { const: "reviewer-findings" },
    reviewer: str({ minLength: 1 }),
    type: { enum: ["ai", "human", "imported"] },
    findings: arr(
      obj({
        path: str({ minLength: 1 }),
        line: { type: ["integer", "null"], minimum: 1 },
        title: str({ minLength: 1 }),
        severity: C("severity"),
        body: str(),
      })
    ),
  })
);

for (const [name, schema] of Object.entries({
  "assurance-common": common,
  "assurance-policy": policy,
  "evidence-record": evidenceRecord,
  "change-review": review,
  approval,
  "verification-run": verificationRun,
  "fix-packet": fixPacket,
  "closure-register": register,
  "release-gate": gate,
  "reviewer-findings": claims,
}))
  writeFileSync(
    new URL(`../../schemas/${name}.schema.json`, import.meta.url),
    `${JSON.stringify(schema, null, 2)}\n`
  );
