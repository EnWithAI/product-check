// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Shared types for control evaluation: the context every evaluator reads, and the outcome it returns.
 */
import type { EvidenceCollector } from "../evidence/collector.js";
import type { ObservationSet } from "../inspectors/http/observe.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type {
  ArchitectureCheckSummary,
  AuditSummary,
  ImpactCheckSummary,
  OutcomeCheckSummary,
  SpecCheckSummary,
} from "../importers/reports.js";
import type { TestRun } from "../importers/tests.js";
import type {
  Confidence,
  Epistemic,
  EvidenceStrength,
  Results,
  ScanContract,
  Severity,
  UxSeverity,
  Validation,
  ValidationStatus,
} from "../types.js";

/** An imported artifact with its source path and checksum. */
export interface Imported<T> {
  data: T;
  source: string;
  sha256: string;
}

/** Everything evaluators may read. */
export interface EvalContext {
  contract: ScanContract;
  ev: EvidenceCollector;
  repo: RepoFacts | null;
  revision: string | null;
  app: ObservationSet | null;
  appBlockedReason: string | null;
  exposureAuthorized: boolean;
  tests: TestRun[];
  audit: Imported<AuditSummary> | null;
  spec: Imported<SpecCheckSummary> | null;
  impact: Imported<ImpactCheckSummary> | null;
  outcome: Imported<OutcomeCheckSummary> | null;
  architecture: Imported<ArchitectureCheckSummary> | null;
  baseline: Results | null;
  aiInScope: boolean;
}

/** A finding proposed by an evaluator, before IDs and lifecycle are assigned. */
export interface FindingDraft {
  /** Stable identity of the weakness within its control (location + what). Never includes line numbers. */
  fingerprint: string;
  location: string;
  actual: string;
  evidence: string[];
  epistemic: Epistemic;
  confidence: Confidence;
  severity?: Severity;
  ux?: UxSeverity | null;
  title?: string;
  reproduction?: string[];
  reproducibility?: "deterministic" | "single-observation" | "not-reproduced";
}

/** What one evaluator concluded about one control. */
export interface Outcome {
  status: ValidationStatus;
  actual: string;
  method: Validation["method"];
  strength: EvidenceStrength | null;
  reason: string | null;
  evidence: string[];
  findings: FindingDraft[];
  reproduction: string[];
}

/** An evaluator for one control; null means "this source cannot evaluate it in this run". */
export type Evaluator = (ctx: EvalContext) => Outcome | null;

/** Builds a checked outcome (PASS/PARTIAL/FAIL), which must carry evidence. */
export function checked(
  status: "PASS" | "PARTIAL" | "FAIL",
  actual: string,
  method: Validation["method"],
  strength: EvidenceStrength,
  evidence: string[],
  findings: FindingDraft[] = [],
  reproduction: string[] = []
): Outcome {
  if (evidence.length === 0) throw new Error(`checked outcome without evidence: ${actual}`);
  return {
    status,
    actual,
    method,
    strength,
    reason: null,
    evidence: [...new Set(evidence)],
    findings,
    reproduction,
  };
}

/** Builds an unchecked outcome (BLOCKED/NOT_TESTED/NOT_APPLICABLE), which must carry a reason. */
export function unchecked(
  status: "BLOCKED" | "NOT_TESTED" | "NOT_APPLICABLE",
  reason: string,
  evidence: string[] = []
): Outcome {
  return {
    status,
    actual: "Not evaluated.",
    method: "none",
    strength: null,
    reason,
    evidence,
    findings: [],
    reproduction: [],
  };
}
