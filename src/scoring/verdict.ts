// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Release-verdict rules (pure; recomputed by `validate`):
 *  1. Any failed hard gate or open P0 → NOT_READY.
 *  2. Any open P1 (not covered by a valid risk acceptance) → NOT_READY.
 *  3. Any unverified hard-gate control, or any pillar without a score → INCONCLUSIVE.
 *  4. Any pillar below the threshold, LOW confidence, open P2, or accepted risk → READY_WITH_CONDITIONS.
 *  5. Otherwise READY.
 * The verdict is always bounded by the evidence: the exact revision/origin and what was not verified.
 */
import type { Finding, ReleaseVerdict, Results, Scorecard, Tier, Validation, Verdict } from "../types.js";
import { PILLARS, SCHEMA_VERSION } from "../types.js";
import { tierIndex, verdictAlias } from "../validation/tiers.js";
import { isOpen } from "./score.js";

/** Inputs that bound the verdict statement. */
export interface VerdictBounds {
  repository: Results["run"]["target_revision"]["repository"];
  application: Results["run"]["target_revision"]["application"];
  finishedAt: string;
}

/** Computes the release verdict. */
export function computeVerdict(
  scorecard: Scorecard,
  findings: Finding[],
  validations: Validation[],
  tier: Tier,
  approver: string | null,
  rejected: { acceptance_id: string; reason: string }[],
  acceptances: { acceptance_id: string; finding_ids: string[]; owner: string; expires: string }[],
  bounds: VerdictBounds
): ReleaseVerdict {
  const reasons: string[] = [];
  const blockingGates = scorecard.gates.filter((g) => g.status === "FAIL").map((g) => g.gate_id);
  const open = findings.filter(isOpen);
  const p0 = open.filter((f) => f.severity === "P0");
  const p1 = open.filter((f) => f.severity === "P1");
  const blockingFindings = [...p0, ...p1].map((f) => f.id).sort();
  const unverifiedGateControls = validations
    .filter((v) => v.hard_gate !== null && (v.status === "BLOCKED" || v.status === "NOT_TESTED"))
    .map((v) => v.control_id);
  const unscored = PILLARS.filter((p) => scorecard.pillars[p].score === null);
  let verdict: Verdict;
  if (blockingGates.length > 0 || p0.length > 0) {
    verdict = "NOT_READY";
    if (blockingGates.length > 0) reasons.push(`Hard gate failed: ${blockingGates.join(", ")}.`);
    if (p0.length > 0) reasons.push(`${p0.length} open P0 finding(s).`);
    if (p1.length > 0) reasons.push(`${p1.length} open P1 finding(s).`);
  } else if (p1.length > 0) {
    verdict = "NOT_READY";
    reasons.push(`${p1.length} open P1 finding(s) without a valid risk acceptance.`);
  } else if (unverifiedGateControls.length > 0 || unscored.length > 0) {
    verdict = "INCONCLUSIVE";
    if (unverifiedGateControls.length > 0)
      reasons.push(`Hard-gate controls not verified: ${unverifiedGateControls.join(", ")}.`);
    if (unscored.length > 0) reasons.push(`Insufficient evidence to score: ${unscored.join(", ")}.`);
  } else {
    const below = PILLARS.filter(
      (p) => (scorecard.pillars[p].score ?? 0) < scorecard.parameters.pillar_threshold
    );
    const low = PILLARS.filter((p) => scorecard.pillars[p].confidence === "LOW");
    const p2 = open.filter((f) => f.severity === "P2");
    if (below.length > 0)
      reasons.push(
        `Below the pillar threshold (${scorecard.parameters.pillar_threshold}): ${below.join(", ")}.`
      );
    if (low.length > 0) reasons.push(`Low confidence: ${low.join(", ")}.`);
    if (p2.length > 0) reasons.push(`${p2.length} open P2 finding(s).`);
    if (scorecard.accepted_risks > 0)
      reasons.push(`${scorecard.accepted_risks} finding(s) released under accepted risk.`);
    verdict = reasons.length > 0 ? "READY_WITH_CONDITIONS" : "READY";
    if (verdict === "READY")
      reasons.push(
        "All applicable hard gates passed, no open P0–P2 findings, every pillar scored at or above the threshold."
      );
  }
  const notTested = validations.filter((v) => v.status === "BLOCKED" || v.status === "NOT_TESTED").length;
  const applicable = validations.filter((v) => v.status !== "NOT_APPLICABLE").length;
  const repo = bounds.repository
    ? `repository "${bounds.repository.label}" at revision ${bounds.repository.commit?.slice(0, 12) ?? "unknown"}`
    : "no repository";
  const app = bounds.application
    ? `application ${bounds.application.origin} as observed ${bounds.application.observed_at ?? "(no successful observation)"}`
    : "no deployed application";
  return {
    schema_version: SCHEMA_VERSION,
    kind: "release-verdict",
    verdict,
    tier,
    tier_alias: verdictAlias(tier, verdict),
    reasons,
    blocking_gates: blockingGates,
    blocking_findings: verdict === "NOT_READY" ? blockingFindings : [],
    not_verified: verdict === "READY" ? [] : unverifiedGateControls,
    accepted_risks: acceptances,
    rejected_acceptances: rejected,
    bounded_by: `Applies only to ${repo} and ${app}, assessed ${bounds.finishedAt}. ${applicable - notTested} of ${applicable} applicable controls were checked; ${notTested} were blocked or not tested. A material change invalidates this verdict.`,
    approval: { required: tierIndex(tier) >= 3 || acceptances.length > 0, approver, status: "UNAPPROVED" },
    rationale:
      verdict === "INCONCLUSIVE"
        ? "Evidence is insufficient for a readiness decision; see reasons and the not-verified list for the next evidence to collect."
        : verdict === "NOT_READY"
          ? "At least one blocking condition was substantiated by evidence."
          : "Readiness is bounded by the evidence listed; untested areas remain unknown, not passed.",
  };
}
