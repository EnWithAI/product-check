// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Types for the vibe-code review and verified-closure layer (methodology CT3 v3.2). These artifacts sit next to the
 * results document (schema 0.1.0, unchanged) and are versioned separately: assurance schema 0.1.0. They mirror
 * schemas/{change-review,closure-register,verification-run,fix-packet,approval,release-gate,assurance-policy,
 * evidence-record}.schema.json.
 */
import type { Confidence, Epistemic, Pillar, Severity, ValidationStatus } from "../types.js";

export const ASSURANCE_SCHEMA_VERSION = "0.1.0" as const;
/**
 * Methodology version the assurance design was inspired by (CLEAR CT v3.2, NetworkGain Consulting; internal and
 * unpublished). Relationship `inspired` per the Commons attribution standard: no text or catalog is reproduced.
 */
export const METHODOLOGY_VERSION = "CT3 v3.2" as const;

/** Execution phases (mechanics of review and closure). Distinct from CT-T0…T6 lifecycle tiers. */
export type VcPhase = "VC-P0" | "VC-P1" | "VC-P2" | "VC-P3" | "VC-P4" | "VC-P5" | "VC-P6" | "VC-P7";

export type ScanModeV32 =
  | "REPO_BASELINE"
  | "PRE_PR_LOCAL"
  | "PR_DIFF"
  | "DEPLOYED_APP"
  | "HYBRID_360"
  | "RETEST"
  | "RELEASE_GATE"
  | "POST_RELEASE_WATCH";

/** How far an alleged finding has been verified. Only CONFIRMED/CORROBORATED/REPRODUCED may drive a block. */
export type VerificationState =
  | "SUSPECTED"
  | "EVIDENCE_COLLECTED"
  | "REPRODUCED"
  | "CORROBORATED"
  | "CONFIRMED"
  | "DISPROVEN"
  | "NEEDS_HUMAN_TRIAGE";

export type ClosureState =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "FIX_PROPOSED"
  | "RETEST_REQUIRED"
  | "VERIFIED_FIXED"
  | "CLOSED"
  | "REJECTED_FALSE_POSITIVE"
  | "ACCEPTED_RISK"
  | "DEFERRED"
  | "REGRESSED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNDETERMINED";
export type GateStatus = "PASS" | "CONDITIONAL" | "BLOCK" | "NOT_EVALUATED";
export type ReleaseDecision = "GO" | "CONDITIONAL_GO" | "NO_GO" | "UNKNOWN";
export type FixStatus = "PROPOSED" | "IMPLEMENTED_UNVERIFIED" | "VERIFIED" | "REGRESSED";
export type ActorType = "human" | "agent" | "system";

export interface Actor {
  id: string;
  type: ActorType;
}

// ---------------------------------------------------------------------------------------------------------------
// Policy (operator-owned; never read implicitly from the scanned repository)

export interface CommandSpec {
  id: string;
  argv: string[];
  purpose: "build" | "typecheck" | "lint" | "test" | "smoke" | "reproduction" | "regression" | "other";
  timeout_ms: number;
  /** Directory relative to the repository root. */
  cwd: string;
  source: "policy" | "fix" | "corpus";
}

export interface PolicyApprover {
  id: string;
  type: "human" | "bot";
  roles: string[];
  /** Ed25519 public key, SPKI PEM. Approvals are verified against it. */
  public_key: string;
}

export interface AssurancePolicy {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "assurance-policy";
  policy_id: string;
  required_checks: CommandSpec[];
  approvers: PolicyApprover[];
  risk: {
    protected_paths: { pattern: string; owners: string[] }[];
    high_risk_paths: string[];
    low_risk_paths: string[];
    trusted_authors: string[];
    allow_low_risk_waiver: boolean;
    approvals: Record<"LOW" | "MEDIUM" | "HIGH", number>;
  };
  review: { max_cycles: number; fail_closed_unverified_p0: boolean };
  release: { rollback_plan: string | null; staged_rollout: string | null };
  exec: { env_allowlist: string[]; max_output_bytes: number };
}

// ---------------------------------------------------------------------------------------------------------------
// Executed evidence

export interface RunnerInfo {
  platform: string;
  arch: string;
  node_version: string;
  tool_version: string;
}

export interface EnvironmentRecord {
  environment_id: string;
  runner: RunnerInfo;
  lockfile_digest: string | null;
}

export interface CommandExecution {
  execution_id: string;
  command_id: string;
  purpose: CommandSpec["purpose"];
  argv: string[];
  cwd: string;
  status: ValidationStatus;
  exit_code: number | null;
  signal: string | null;
  duration_ms: number;
  started_at: string;
  environment_id: string;
  commit_sha: string | null;
  stdout_digest: string | null;
  stderr_digest: string | null;
  output_bytes: number;
  output_truncated: boolean;
  /** Redacted tail of the combined output (at most 400 characters). */
  excerpt: string | null;
  reason: string | null;
  evidence_id: string | null;
}

/** One line of review-evidence.jsonl: append-only and hash-chained. */
export interface EvidenceRecord {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "evidence-record";
  seq: number;
  evidence_id: string;
  recorded_at: string;
  type:
    | "command-execution"
    | "diff-hunk"
    | "source-recheck"
    | "results-artifact"
    | "approval"
    | "verification"
    | "imported-report"
    | "reviewer-claim"
    | "transition";
  subject: string;
  commit_sha: string | null;
  environment_id: string | null;
  summary: string;
  locator: string | null;
  line: number | null;
  payload_digest: string;
  payload: Record<string, unknown>;
  prev_digest: string | null;
  digest: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Change review (PR_DIFF / PRE_PR_LOCAL)

export type Lane = "spec-outcome" | "correctness" | "impact" | "trust-security" | "experience" | "operations";

export interface VerificationCheck {
  check: string;
  result: "pass" | "fail" | "not-run";
  detail: string;
}

export interface FindingVerification {
  state: VerificationState;
  checks: VerificationCheck[];
}

export interface ReviewFinding {
  id: string;
  rule_id: string;
  lane: Lane;
  reviewer: { id: string; type: "deterministic" | "ai" | "human" | "imported"; version: string };
  title: string;
  severity: Severity;
  pillars: Pillar[];
  location: { path: string; line: number | null; runtime: string | null };
  expected: string;
  actual: string;
  steps_or_command: string[];
  evidence_ids: string[];
  confidence: Confidence;
  epistemic: Epistemic;
  impact: string;
  affected_scope: string;
  baseline_sha: string | null;
  head_sha: string | null;
  uncertainty: string | null;
  verification: FindingVerification;
  dedupe_key: string;
  occurrences: number;
  repeat_of_review: string | null;
  blocking: boolean;
}

export interface ChangedFile {
  path: string;
  previous_path: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "binary";
  additions: number;
  deletions: number;
  surfaces: string[];
  protected: boolean;
}

export interface LaneResult {
  lane: Lane;
  reviewer: string;
  status: ValidationStatus;
  findings: number;
  notes: string[];
}

export interface ApprovalEvaluation {
  approval_id: string;
  approver_id: string;
  status:
    | "VALID"
    | "STALE"
    | "INVALID_SIGNATURE"
    | "UNSIGNED"
    | "UNKNOWN_APPROVER"
    | "NOT_HUMAN"
    | "SELF_APPROVAL"
    | "WRONG_SCOPE"
    | "REJECTED";
  reason: string;
}

export interface ChangeReview {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "change-review";
  methodology_version: typeof METHODOLOGY_VERSION;
  review_id: string;
  mode: "PR_DIFF" | "PRE_PR_LOCAL";
  /** What approvals of this change are scoped to (approve --scope change:<ref>). */
  change_ref: string;
  created_at: string;
  target: { name: string; repository: string };
  base_sha: string | null;
  head_sha: string | null;
  author: { id: string | null; source: "flag" | "git" | "unknown"; trusted: boolean };
  diff: { source: "git" | "file"; digest: string; files: ChangedFile[]; truncated: boolean };
  risk: {
    level: RiskLevel;
    effective_level: "LOW" | "MEDIUM" | "HIGH";
    surfaces: string[];
    reasons: string[];
    protected_paths: string[];
    impact_check: {
      schema_version: string;
      high: number;
      affected_modules: number;
      commit: string | null;
    } | null;
  };
  approvals_required: {
    humans: number;
    domain_owners: string[];
    waiver: { eligible: boolean; applied: boolean; reason: string };
  };
  approvals: ApprovalEvaluation[];
  lanes: LaneResult[];
  findings: ReviewFinding[];
  disproven: ReviewFinding[];
  checks: { proof_run_id: string | null; status: ValidationStatus; detail: string };
  baseline: { run_id: string; verdict: string; results_sha256: string } | null;
  cycle: {
    number: number;
    max: number;
    previous_review_id: string | null;
    repeated_unchanged: string[];
    new_findings: string[];
    escalated: boolean;
  };
  gate: { status: GateStatus; reasons: string[]; blocking_finding_ids: string[] };
  product_vs_change: string;
  limitations: string[];
  evidence_ids: string[];
  provenance: {
    tool: "product-check";
    tool_version: string;
    policy_id: string | null;
    policy_digest: string | null;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Approvals (signed)

export interface Approval {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "approval";
  approval_id: string;
  approver: { id: string; type: "human" | "bot" };
  scope: {
    type: "change" | "closure" | "risk-acceptance" | "false-positive" | "release" | "continue";
    ref: string;
  };
  reviewed_sha: string;
  decision: "approve" | "reject";
  comment: string;
  created_at: string;
  signature: { algorithm: "ed25519"; key_id: string; value: string } | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Verification runs

export interface VerificationCheckResult {
  check_id: string;
  kind:
    | "control-reassessment"
    | "rule-recheck"
    | "command"
    | "no-new-critical"
    | "no-regressed-controls"
    | "gate-recheck";
  role: "targeted" | "regression";
  status: ValidationStatus;
  detail: string;
  execution_id: string | null;
  evidence_ids: string[];
}

export interface VerificationRun {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "verification-run";
  verification_id: string;
  purpose: "closure" | "author-proof";
  finding_ids: string[];
  fix_id: string | null;
  exact_sha: string | null;
  worktree_clean: boolean | null;
  environment: EnvironmentRecord;
  started_at: string;
  finished_at: string;
  checks: VerificationCheckResult[];
  executions: CommandExecution[];
  before_evidence_ids: string[];
  after_evidence_ids: string[];
  after_results: {
    run_id: string;
    results_path: string;
    results_sha256: string;
    verdict: string;
    open: Record<Severity, number>;
  } | null;
  result: "PASS" | "FAIL" | "INCONCLUSIVE";
  reasons: string[];
  limitations: string[];
  actor: Actor;
}

// ---------------------------------------------------------------------------------------------------------------
// Fix packets

export interface FixPacket {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "fix-packet";
  methodology_version: typeof METHODOLOGY_VERSION;
  fix_id: string;
  finding_ids: string[];
  source_finding_ids: string[];
  title: string;
  status: FixStatus;
  risk_class: RiskLevel;
  severity: Severity;
  affected_surfaces: { path: string | null; line: number | null; runtime: string | null }[];
  user_impact: string;
  evidence_refs: string[];
  root_cause: { hypothesis: string; certainty: Epistemic; confidence: Confidence };
  constraints: string[];
  proposed_change: string;
  tests_required: {
    id: string;
    kind: "reproduction" | "regression" | "negative";
    description: string;
    /** Commands are never invented: null until the implementer declares one with `product-check fix`. */
    argv: string[] | null;
  }[];
  negative_cases: string[];
  dependencies: string[];
  acceptance_conditions: string[];
  owner: { id: string | null; accountable_human_required: true };
  rollback_plan: string;
  scope_guard: { allowed_paths: string[]; note: string };
  traceability: { control_or_rule: string; spec_requirement_ids: string[]; locations: string[] };
  implementation: { change_sha: string | null; implemented_by: Actor | null };
  generated_from: { results_run_id: string | null; review_id: string | null };
}

// ---------------------------------------------------------------------------------------------------------------
// Closure register

export interface Transition {
  seq: number;
  from: ClosureState | null;
  to: ClosureState;
  at: string;
  actor: Actor;
  reason: string;
  refs: {
    evidence_ids: string[];
    verification_id: string | null;
    approval_ids: string[];
    fix_id: string | null;
    run_id: string | null;
  };
  prev_digest: string | null;
  digest: string;
}

export interface RegisterEntry {
  finding_id: string;
  source: "baseline-scan" | "change-review" | "incident";
  source_finding_id: string;
  rule_or_control: string;
  title: string;
  severity: Severity;
  pillar: Pillar;
  epistemic: Epistemic;
  location: string;
  dedupe_key: string;
  verification: FindingVerification;
  state: ClosureState;
  opened_in: string;
  cycles: number;
  escalated: boolean;
  fix_ids: string[];
  verification_ids: string[];
  approval_ids: string[];
  acceptance_id: string | null;
  regressions: { at: string; run_id: string; previous_state: ClosureState }[];
  closure: {
    closure_id: string;
    actor: Actor;
    at: string;
    verification_id: string;
    approval_ids: string[];
  } | null;
  transitions: Transition[];
}

export interface FixRecord {
  fix_id: string;
  finding_ids: string[];
  change_sha: string;
  implemented_by: Actor;
  status: FixStatus;
  reproduction: CommandSpec[];
  recorded_at: string;
}

export interface RiskAcceptanceV32 {
  acceptance_id: string;
  finding_id: string;
  owner: string;
  scope: string;
  rationale: string;
  compensating_controls: string[];
  review_date: string;
  expires: string;
  closure_condition: string;
  approval_ids: string[];
  created_at: string;
}

export interface CorpusCase {
  case_id: string;
  finding_id: string;
  origin: "escaped-incident" | "regressed-finding" | "verified-fix";
  description: string;
  command: CommandSpec;
  added_at: string;
  added_by: Actor;
}

export interface ClosureRegister {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "closure-register";
  methodology_version: typeof METHODOLOGY_VERSION;
  register_id: string;
  target: { name: string; repository: string | null };
  created_at: string;
  updated_at: string;
  baseline: { run_id: string; results_sha256: string; baseline_sha: string | null };
  settings: { max_cycles: number };
  entries: RegisterEntry[];
  fixes: FixRecord[];
  verification_runs: VerificationRun[];
  approvals: Approval[];
  risk_acceptances: RiskAcceptanceV32[];
  regression_corpus: CorpusCase[];
  chain: { length: number; head_digest: string | null };
}

// ---------------------------------------------------------------------------------------------------------------
// Release gate

export interface PhaseProgress {
  phase: VcPhase;
  name: string;
  status: "COMPLETED" | "PARTIAL" | "NOT_STARTED" | "NOT_SUPPORTED";
  evidence: string[];
}

export interface GateCondition {
  id: string;
  title: string;
  status: "PASS" | "FAIL" | "NOT_EVALUATED";
  detail: string;
  refs: string[];
}

export interface ReleaseGate {
  schema_version: typeof ASSURANCE_SCHEMA_VERSION;
  kind: "release-gate";
  methodology_version: typeof METHODOLOGY_VERSION;
  gate_id: string;
  evaluated_at: string;
  target: { name: string; repository: string | null };
  head_sha: string | null;
  decision: ReleaseDecision;
  product_verdict: string;
  change_gate: GateStatus | null;
  conditions: GateCondition[];
  blocking_reasons: string[];
  open: Record<Severity, number>;
  open_blocking_ids: string[];
  accepted_risks: {
    acceptance_id: string;
    finding_id: string;
    expires: string;
    status: "ACTIVE" | "REVIEW_DUE" | "EXPIRED";
  }[];
  approvals: { required: number; valid: number; stale: number };
  executed_checks: { count: number; passed: number; failed: number; not_run: number };
  coverage: { customer: number; technology: number; trust: number; overall: number; gaps: string[] };
  rollback: { declared: boolean; ref: string | null };
  phases: PhaseProgress[];
  inputs: {
    results_sha256: string;
    register_digest: string | null;
    review_id: string | null;
    proof_run_id: string | null;
  };
}
