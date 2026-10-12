// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Scorecard computation (rubric pc-rubric-0.1). Pure and deterministic, so `product-check validate` can recompute
 * it from validations and findings and detect hand-edited figures.
 *
 * - Customer, Technology and Trust are scored separately; there is no composite score.
 * - coverage = checked weight ÷ applicable weight (NOT_APPLICABLE excluded; BLOCKED and NOT_TESTED count as unchecked).
 * - score = Σ weight × value ÷ checked weight × 100, with PASS = 1, PARTIAL = 0.5, FAIL = 0; withheld (null) when
 *   coverage < min_coverage or fewer than 2 controls were checked. Untested never counts as passed.
 * - Open P0 caps the pillar at 39, open P1 at 59: a critical failure is never averaged away.
 * - confidence: HIGH needs coverage ≥ 0.8 with ≥ 50% of checked weight backed by runtime or executed-test
 *   evidence and no unverified hard gate in the pillar; MEDIUM needs coverage ≥ 0.5 and ≥ 50% static-or-better
 *   evidence; otherwise LOW; NONE when nothing was checked.
 */
import { CONTROL_BY_ID, GATES } from "../validation/catalog.js";
import type {
  Finding,
  GateResult,
  Pillar,
  PillarScore,
  RunSummary,
  Scorecard,
  Severity,
  Validation,
  ValidationStatus,
} from "../types.js";
import { PILLARS, RUBRIC_VERSION, SCHEMA_VERSION } from "../types.js";

const VALUE: Partial<Record<ValidationStatus, number>> = { PASS: 1, PARTIAL: 0.5, FAIL: 0 };
const isChecked = (s: ValidationStatus): boolean => s === "PASS" || s === "PARTIAL" || s === "FAIL";
const round = (n: number, digits: number): number => Math.round(n * 10 ** digits) / 10 ** digits;

/** Findings that still count as open (not accepted, not resolved). */
export const isOpen = (f: Finding): boolean => f.status === "OPEN" || f.status === "UNVERIFIED";

/** Gate results from validations. */
export function computeGates(validations: Validation[]): GateResult[] {
  return GATES.map((gate) => {
    const members = validations.filter((v) => v.hard_gate === gate.id && v.status !== "NOT_APPLICABLE");
    const status: GateResult["status"] =
      members.length === 0
        ? "NOT_APPLICABLE"
        : members.some((v) => v.status === "FAIL")
          ? "FAIL"
          : members.some((v) => !isChecked(v.status))
            ? "UNVERIFIED"
            : "PASS";
    return {
      gate_id: gate.id,
      title: gate.title,
      status,
      control_ids: validations.filter((v) => v.hard_gate === gate.id).map((v) => v.control_id),
    };
  });
}

/** Computes the scorecard. `previous` is the summary of the baseline run, if any. */
export function computeScorecard(
  validations: Validation[],
  findings: Finding[],
  parameters: { min_coverage: number; pillar_threshold: number },
  previous: RunSummary | null
): Scorecard {
  const gates = computeGates(validations);
  const pillars = {} as Record<Pillar, PillarScore>;
  for (const pillar of PILLARS) {
    const vs = validations.filter((v) => v.pillar === pillar);
    const counts: Record<ValidationStatus, number> = {
      PASS: 0,
      PARTIAL: 0,
      FAIL: 0,
      BLOCKED: 0,
      NOT_TESTED: 0,
      NOT_APPLICABLE: 0,
    };
    for (const v of vs) counts[v.status]++;
    const applicable = vs.filter((v) => v.status !== "NOT_APPLICABLE");
    const checkedVs = applicable.filter((v) => isChecked(v.status));
    const applicableWeight = applicable.reduce((n, v) => n + v.weight, 0);
    const checkedWeight = checkedVs.reduce((n, v) => n + v.weight, 0);
    const coverage = applicableWeight === 0 ? 0 : round(checkedWeight / applicableWeight, 4);
    const scored = checkedVs.length >= 2 && coverage >= parameters.min_coverage;
    let score: number | null = null;
    const cap: PillarScore["cap"] = { applied: false, limit: null, reason: null };
    if (scored) {
      score = Math.round(
        (checkedVs.reduce((n, v) => n + v.weight * (VALUE[v.status] ?? 0), 0) / checkedWeight) * 100
      );
      const open = findings.filter((f) => f.pillar === pillar && isOpen(f));
      const limit = open.some((f) => f.severity === "P0")
        ? 39
        : open.some((f) => f.severity === "P1")
          ? 59
          : null;
      if (limit !== null && score > limit) {
        cap.applied = true;
        cap.limit = limit;
        cap.reason = limit === 39 ? "open P0 finding in this pillar" : "open P1 finding in this pillar";
        score = limit;
      }
    }
    let confidence: PillarScore["confidence"] = "NONE";
    if (checkedVs.length > 0) {
      const strong =
        checkedVs
          .filter((v) => v.strength === "runtime" || v.strength === "executed-test")
          .reduce((n, v) => n + v.weight, 0) / checkedWeight;
      const moderate =
        checkedVs
          .filter(
            (v) =>
              v.strength === "runtime" ||
              v.strength === "executed-test" ||
              v.strength === "static" ||
              v.strength === "imported-report"
          )
          .reduce((n, v) => n + v.weight, 0) / checkedWeight;
      const gateGap = gates.some(
        (g) =>
          g.status === "UNVERIFIED" &&
          vs.some((v) => v.hard_gate === g.gate_id && !isChecked(v.status) && v.status !== "NOT_APPLICABLE")
      );
      confidence =
        coverage >= 0.8 && strong >= 0.5 && !gateGap
          ? "HIGH"
          : coverage >= 0.5 && moderate >= 0.5
            ? "MEDIUM"
            : "LOW";
      if (!scored) confidence = "LOW";
    }
    const prev = previous?.scores[pillar] ?? null;
    pillars[pillar] = {
      score,
      state: scored ? "SCORED" : "INSUFFICIENT_EVIDENCE",
      coverage,
      confidence,
      cap,
      trend: previous
        ? {
            previous_score: prev,
            delta: prev !== null && score !== null ? score - prev : null,
            previous_run_id: previous.run_id,
          }
        : null,
      counts,
      applicable_weight: applicableWeight,
      checked_weight: checkedWeight,
    };
  }
  const applicableAll = validations.filter((v) => v.status !== "NOT_APPLICABLE");
  const totalWeight = applicableAll.reduce((n, v) => n + v.weight, 0);
  const checkedAll = applicableAll.filter((v) => isChecked(v.status)).reduce((n, v) => n + v.weight, 0);
  const open_findings: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) if (isOpen(f)) open_findings[f.severity]++;
  return {
    schema_version: SCHEMA_VERSION,
    kind: "scorecard",
    rubric_version: RUBRIC_VERSION,
    pillars,
    overall_coverage: totalWeight === 0 ? 0 : round(checkedAll / totalWeight, 4),
    gates,
    open_findings,
    accepted_risks: findings.filter((f) => f.status === "ACCEPTED_RISK").length,
    blocked_controls: validations.filter((v) => v.status === "BLOCKED").map((v) => v.control_id),
    not_tested_controls: validations.filter((v) => v.status === "NOT_TESTED").map((v) => v.control_id),
    parameters,
  };
}

/** Weight of a control from the catalog (fallback 1 for unknown IDs). */
export const weightOf = (controlId: string): 1 | 2 | 3 => CONTROL_BY_ID.get(controlId)?.weight ?? 1;
