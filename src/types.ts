// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Result contract types (schema 0.1.0). Mirrors schemas/*.schema.json; tests validate real results against the
 * schemas with both the built-in validator and Ajv.
 */

export const SCHEMA_VERSION = "0.1.0" as const;
export const RUBRIC_VERSION = "pc-rubric-0.1" as const;

/** The three independent assessment pillars (CT3: Customer × Technology × Trust). */
export type Pillar = "customer" | "technology" | "trust";
export const PILLARS: readonly Pillar[] = ["customer", "technology", "trust"];

/** Lifecycle assurance tiers. Distinct from workflow phases. */
export type Tier = "CT-T0" | "CT-T1" | "CT-T2" | "CT-T3" | "CT-T4" | "CT-T5" | "CT-T6";
export const TIERS: readonly Tier[] = ["CT-T0", "CT-T1", "CT-T2", "CT-T3", "CT-T4", "CT-T5", "CT-T6"];

/** Declared product maturity; selects the lifecycle tier. */
export type LifecycleStage =
  | "DISCOVERY_BUILD"
  | "ALPHA"
  | "BETA_PILOT"
  | "PRE_LAUNCH"
  | "LAUNCH_GATE"
  | "JUST_LAUNCHED"
  | "POST_LAUNCH"
  | "PRODUCTION_SCALE"
  | "MAJOR_CHANGE";

export type InspectionMode = "SOURCE" | "APPLICATION" | "HYBRID" | "AUTO";

/** Actions a scan contract may authorize. Everything else is refused. */
export type AuthorizedAction = "read-local-source" | "import-artifacts" | "passive-http" | "exposure-probe";

/** Workflow phases (user-facing), distinct from lifecycle tiers. */
export type Phase = "SCAN" | "TEST" | "VALIDATE" | "BLUEPRINT" | "DASHBOARD" | "REMEDIATE" | "RETEST";

/** Outcome of evaluating one control. Missing evidence is never PASS. */
export type ValidationStatus = "PASS" | "PARTIAL" | "FAIL" | "BLOCKED" | "NOT_TESTED" | "NOT_APPLICABLE";

/** Point-of-presence availability. */
export type PopStatus = "AVAILABLE" | "PARTIAL" | "BLOCKED" | "NOT_APPLICABLE";

/** Finding priority. P0 = critical exposure; P3 = polish. */
export type Severity = "P0" | "P1" | "P2" | "P3";
export type UxSeverity = "UX0" | "UX1" | "UX2" | "UX3";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
/** fact = directly observed; inference = derived from facts by a stated rule; hypothesis = pattern heuristic. */
export type Epistemic = "fact" | "inference" | "hypothesis";
export type Verdict = "READY" | "READY_WITH_CONDITIONS" | "NOT_READY" | "INCONCLUSIVE";
export type RunStatus = "COMPLETED" | "PARTIAL" | "FAILED" | "ABORTED";
export type Horizon = "NOW" | "NEXT" | "BEFORE_SCALE" | "NEXT_CYCLE" | "LATER";

/** How strong a piece of evidence is, strongest first. */
export type EvidenceStrength =
  "runtime" | "executed-test" | "static" | "imported-report" | "declared" | "inferred";

export type EvidenceKind =
  | "source-location"
  | "file-presence"
  | "manifest-field"
  | "search-scope"
  | "http-response"
  | "test-result"
  | "imported-report"
  | "baseline-comparison"
  | "declaration";

// ---------------------------------------------------------------------------------------------------------------
// Scan contract

export interface RiskAcceptance {
  id: string;
  control_id: string | null;
  finding_id: string | null;
  rationale: string;
  owner: string;
  compensating_control: string;
  expires: string;
  closure_condition: string;
}

export interface ControlMapping {
  control_id: string;
  test_name_pattern: string;
}

export interface ScanContract {
  schema_version: typeof SCHEMA_VERSION;
  kind: "scan-contract";
  contract_id: string;
  labels: { demo: boolean };
  target: {
    name: string;
    purpose: string | null;
    repository: { path: string } | null;
    application: { url: string } | null;
  };
  mode: InspectionMode;
  lifecycle_stage: LifecycleStage;
  tiers: Tier[] | null;
  product: {
    has_user_accounts: boolean | null;
    multi_tenant: boolean | null;
    handles_personal_data: boolean | null;
    uses_ai: boolean | null;
    payments: boolean | null;
  };
  personas: string[];
  critical_journeys: string[];
  authorization: {
    authorized_actions: AuthorizedAction[];
    prohibited_actions: string[];
    scope: { origins: string[] };
    attestation: { statement: string; authorized_by: string; date: string } | null;
  };
  constraints: { max_requests: number; request_timeout_ms: number; max_files: number };
  imports: {
    test_results: string[];
    npm_audit: string | null;
    har: string | null;
    observations: string | null;
    spec_check: string | null;
    impact_check: string | null;
    outcome_check: string | null;
  };
  control_mappings: ControlMapping[];
  risk_acceptances: RiskAcceptance[];
  scoring: { min_coverage: number; pillar_threshold: number };
  release: { approver: string | null };
}

// ---------------------------------------------------------------------------------------------------------------
// PoP coverage

export interface PopEntry {
  id: string;
  category: "experience" | "interfaces" | "source-build" | "data" | "operations" | "ai" | "governance";
  name: string;
  status: PopStatus;
  relevant: boolean;
  access: "read-only" | "none";
  authorization: "authorized" | "not-authorized" | "not-required";
  scope: string | null;
  observed_at: string | null;
  provenance: "observed" | "imported" | "declared" | "inferred" | "none";
  limitations: string[];
  evidence_ids: string[];
}

export interface PopCoverage {
  schema_version: typeof SCHEMA_VERSION;
  kind: "pop-coverage";
  pops: PopEntry[];
  summary: { available: number; partial: number; blocked: number; not_applicable: number; relevant: number };
}

// ---------------------------------------------------------------------------------------------------------------
// Evidence

export interface Evidence {
  id: string;
  run_id: string;
  kind: EvidenceKind;
  pop: string;
  collected_at: string;
  strength: EvidenceStrength;
  provenance: "observed" | "imported" | "declared" | "inferred";
  source: {
    locator: string;
    line_start: number | null;
    line_end: number | null;
    revision: string | null;
  };
  summary: string;
  excerpt: string | null;
  checksum: { algorithm: "sha256"; value: string } | null;
  redaction: { applied: boolean; rules: string[] };
  validation_ids: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Validation

export interface Validation {
  id: string;
  control_id: string;
  pillar: Pillar;
  tier: Tier;
  title: string;
  expected: string;
  actual: string;
  status: ValidationStatus;
  method:
    | "static-analysis"
    | "passive-http"
    | "exposure-probe"
    | "imported-test-results"
    | "imported-report"
    | "baseline-comparison"
    | "none";
  strength: EvidenceStrength | null;
  reason: string | null;
  evidence_ids: string[];
  reproduction: string[];
  hard_gate: string | null;
  weight: number;
  finding_ids: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Finding

export type FindingLifecycle = "NEW" | "PERSISTING" | "REOPENED" | "RESOLVED" | "CARRIED_UNVERIFIED";
export type FindingStatus = "OPEN" | "ACCEPTED_RISK" | "RESOLVED" | "UNVERIFIED";

export interface FindingHistoryEntry {
  run_id: string;
  status: FindingStatus;
  evidence_ids: string[];
}

export interface Finding {
  id: string;
  control_id: string;
  title: string;
  category: string;
  pillar: Pillar;
  severity: Severity;
  ux_severity: UxSeverity | null;
  status: FindingStatus;
  lifecycle: FindingLifecycle;
  epistemic: Epistemic;
  confidence: Confidence;
  reproducibility: "deterministic" | "single-observation" | "not-reproduced";
  reproduction: string[];
  pop: string;
  location: string;
  expected: string;
  actual: string;
  impact: { customer: string | null; technology: string | null; trust: string | null };
  root_cause: { statement: string; certainty: Epistemic };
  evidence_ids: string[];
  validation_id: string;
  work_packet_id: string | null;
  first_seen_run: string;
  history: FindingHistoryEntry[];
}

// ---------------------------------------------------------------------------------------------------------------
// Scorecard

export interface PillarScore {
  score: number | null;
  state: "SCORED" | "INSUFFICIENT_EVIDENCE";
  coverage: number;
  confidence: Confidence | "NONE";
  cap: { applied: boolean; limit: number | null; reason: string | null };
  trend: { previous_score: number | null; delta: number | null; previous_run_id: string } | null;
  counts: Record<ValidationStatus, number>;
  applicable_weight: number;
  checked_weight: number;
}

export interface GateResult {
  gate_id: string;
  title: string;
  status: "PASS" | "FAIL" | "UNVERIFIED" | "NOT_APPLICABLE";
  control_ids: string[];
}

export interface Scorecard {
  schema_version: typeof SCHEMA_VERSION;
  kind: "scorecard";
  rubric_version: typeof RUBRIC_VERSION;
  pillars: Record<Pillar, PillarScore>;
  overall_coverage: number;
  gates: GateResult[];
  open_findings: Record<Severity, number>;
  accepted_risks: number;
  blocked_controls: string[];
  not_tested_controls: string[];
  parameters: { min_coverage: number; pillar_threshold: number };
}

// ---------------------------------------------------------------------------------------------------------------
// Blueprint

export interface ArchitectureComponent {
  id: string;
  category: string;
  name: string;
  certainty: "observed" | "inferred";
  evidence_ids: string[];
}

export interface TargetChange {
  id: string;
  statement: string;
  rationale: string;
  alternatives: string[];
  finding_ids: string[];
}

export interface Remediation {
  id: string;
  control_id: string;
  finding_ids: string[];
  problem: string;
  why_it_matters: string;
  recommended_change: string;
  benefits: { customer: string | null; technology: string | null; trust: string | null };
  horizon: Horizon;
  priority: Severity;
  effort: "S" | "M" | "L" | null;
  owner: string | null;
  depends_on: string[];
  human_review_required: boolean;
  acceptance_criteria: string[];
  regression_test: { description: string; candidate: { language: string; code: string } | null };
  verification: {
    status: "PROPOSED" | "VERIFIED" | "FAILED_VERIFICATION" | "UNVERIFIED";
    method: string;
    verified_in_run: string | null;
    evidence_ids: string[];
  };
}

export interface WorkPacket {
  id: string;
  remediation_id: string;
  title: string;
  objective: string;
  finding_ids: string[];
  context: { locations: string[]; evidence_ids: string[] };
  constraints: string[];
  suggested_steps: string[];
  acceptance_criteria: string[];
  verification_command: string;
  human_approval_required: boolean;
  status: "PROPOSED" | "VERIFIED" | "FAILED_VERIFICATION" | "UNVERIFIED";
}

export interface TraceLink {
  finding_id: string;
  intent: string | null;
  journey_or_requirement: string;
  observed_behavior: string;
  component: string;
  evidence_ids: string[];
  root_cause: string;
  remediation_id: string | null;
  acceptance_criterion: string | null;
  regression_test: string | null;
  retest_outcome: "NOT_RETESTED" | "VERIFIED" | "STILL_FAILING" | "UNVERIFIED";
}

export interface Blueprint {
  schema_version: typeof SCHEMA_VERSION;
  kind: "blueprint";
  as_is: {
    components: ArchitectureComponent[];
    uncertainties: string[];
    /** The as-built spec derived from the repository (absent when source was not inspected). */
    as_built?: AsBuiltBody;
  };
  to_be: { changes: TargetChange[] };
  remediations: Remediation[];
  work_packets: WorkPacket[];
  test_architecture: {
    layers: {
      layer: string;
      current: "present" | "absent" | "unknown";
      evidence_ids: string[];
      target: string;
    }[];
  };
  traceability: TraceLink[];
  human_review: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Release verdict

export interface ReleaseVerdict {
  schema_version: typeof SCHEMA_VERSION;
  kind: "release-verdict";
  verdict: Verdict;
  tier: Tier;
  tier_alias: string;
  reasons: string[];
  blocking_gates: string[];
  blocking_findings: string[];
  not_verified: string[];
  accepted_risks: { acceptance_id: string; finding_ids: string[]; owner: string; expires: string }[];
  rejected_acceptances: { acceptance_id: string; reason: string }[];
  bounded_by: string;
  approval: { required: boolean; approver: string | null; status: "UNAPPROVED" };
  rationale: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Aggregate results

export interface PhaseRecord {
  phase: Phase;
  status: "COMPLETED" | "PARTIAL" | "SKIPPED" | "FAILED" | "ADVISORY";
  notes: string[];
}

export interface RunSummary {
  run_id: string;
  finished_at: string;
  revision: string | null;
  verdict: Verdict;
  scores: Record<Pillar, number | null>;
  coverage: Record<Pillar, number>;
  open_findings: number;
}

export interface Comparison {
  baseline_run_id: string;
  baseline_sha256: string;
  score_delta: Record<Pillar, number | null>;
  coverage_delta: Record<Pillar, number>;
  regressed_controls: string[];
  improved_controls: string[];
  findings_new: string[];
  findings_resolved: string[];
  findings_reopened: string[];
  findings_persisting: string[];
  findings_unverified: string[];
}

export interface Limitation {
  code: string;
  message: string;
  count: number;
  paths: string[];
}

export interface Results {
  schema_version: typeof SCHEMA_VERSION;
  kind: "product-check-results";
  run: {
    run_id: string;
    status: RunStatus;
    started_at: string;
    finished_at: string;
    duration_ms: number;
    tool: "product-check";
    tool_version: string;
    node_version: string;
    methodology: { name: "CT3"; label: string; relationship: "inspired"; reference_version: string };
    mode_requested: InspectionMode;
    mode_effective: Exclude<InspectionMode, "AUTO"> | null;
    tier: Tier;
    tiers_applied: Tier[];
    target_revision: {
      repository: { label: string; commit: string | null; ref: string | null; source: string } | null;
      application: { origin: string; observed_at: string | null; final_status: number | null } | null;
    };
    phases: PhaseRecord[];
    errors: string[];
    network: { used: boolean; requests: number; origins: string[] };
    baseline: { run_id: string; sha256: string } | null;
    demo: boolean;
  };
  contract: ScanContract;
  pop_coverage: PopCoverage;
  evidence: Evidence[];
  validations: Validation[];
  findings: Finding[];
  scorecard: Scorecard;
  blueprint: Blueprint;
  verdict: ReleaseVerdict;
  comparison: Comparison | null;
  history: RunSummary[];
  limitations: Limitation[];
}

// ---------------------------------------------------------------------------------------------------------------
// As-built specification (reverse-engineered from a repository)

/** Certainty of a statement in an as-built specification. */
export type SpecCertainty = "observed" | "inferred" | "hypothesis";

/** One element of the discovered product surface, with its evidence. */
export interface SurfaceEntry {
  id: string;
  kind: "page" | "endpoint" | "entity" | "config" | "integration" | "auth-boundary" | "test";
  name: string;
  method: string | null;
  area: string;
  detail: string;
  location: { path: string; line: number | null };
  certainty: "observed" | "inferred";
  auth_hint: boolean;
  evidence_ids: string[];
}

/** A requirement statement derived from the surface. */
export interface SpecRequirement {
  id: string;
  statement: string;
  certainty: SpecCertainty;
  surface_ids: string[];
  evidence_ids: string[];
}

/** A user story grouping one area of the surface. */
export interface SpecStory {
  id: string;
  area: string;
  title: string;
  critical_journey: string | null;
  surface_ids: string[];
  requirement_ids: string[];
  test_behaviours: string[];
}

/** The as-built specification document. */
export interface AsBuiltSpec {
  schema_version: typeof SCHEMA_VERSION;
  kind: "as-built-spec";
  generated_at: string;
  tool: { name: "product-check"; version: string };
  target: { name: string; repository: string; commit: string | null; ref: string | null };
  surface: SurfaceEntry[];
  stories: SpecStory[];
  requirements: SpecRequirement[];
  non_functional: SpecRequirement[];
  success_criteria: SpecRequirement[];
  edge_cases: SpecRequirement[];
  clarifications: string[];
  uncertainties: string[];
  evidence: Evidence[];
  limitations: Limitation[];
}

/** The derived content of an as-built spec, as embedded in a blueprint. */
export type AsBuiltBody = Pick<
  AsBuiltSpec,
  | "surface"
  | "stories"
  | "requirements"
  | "non_functional"
  | "success_criteria"
  | "edge_cases"
  | "clarifications"
  | "uncertainties"
>;
