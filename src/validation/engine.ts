// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Runs every catalog control through the source, application and import evaluators and merges the outcomes:
 * - controls above the selected tier are NOT_APPLICABLE (tiers carry forward downwards, never upwards);
 * - when several sources checked a control, the worst status wins (FAIL > PARTIAL > PASS) and the strongest
 *   evidence strength is reported; evidence and findings are unioned;
 * - with no checked outcome, the control is NOT_APPLICABLE, BLOCKED (its points of presence were inaccessible)
 *   or NOT_TESTED, always with a reason. Nothing unchecked is ever reported as PASS.
 */
import type { EvidenceStrength, Finding, PopEntry, Tier, Validation, ValidationStatus } from "../types.js";
import { stableId } from "../util/hash.js";
import { APP_EVALUATORS } from "./app-evaluators.js";
import { CONTROLS, type ControlDef } from "./catalog.js";
import { unchecked, type EvalContext, type FindingDraft, type Outcome } from "./context.js";
import { IMPORT_EVALUATORS, mappedOutcome } from "./import-evaluators.js";
import { SOURCE_EVALUATORS } from "./source-evaluators.js";
import { TIER_INFO, tierIndex } from "./tiers.js";

const STRENGTH_ORDER: EvidenceStrength[] = [
  "runtime",
  "executed-test",
  "static",
  "imported-report",
  "declared",
  "inferred",
];
const STATUS_RANK: Record<string, number> = { FAIL: 3, PARTIAL: 2, PASS: 1 };

/** Result of evaluating all controls. */
export interface Evaluation {
  validations: Validation[];
  findings: Finding[];
}

/** Why a control could not be checked, derived from its points of presence. */
function defaultUnchecked(def: ControlDef, pops: Map<string, PopEntry>): Outcome {
  const entries = def.pops.map((id) => pops.get(id)).filter((p): p is PopEntry => p !== undefined);
  const blocked = entries.filter((p) => p.status === "BLOCKED");
  if (entries.length > 0 && blocked.length === entries.length) {
    return unchecked(
      "BLOCKED",
      blocked.map((p) => `${p.name}: ${p.limitations[0] ?? "not accessible"}`).join(" ")
    );
  }
  return unchecked("NOT_TESTED", "No evaluator produced evidence for this control in this run.");
}

/** Merges outcomes from several evaluators. */
function merge(outcomes: Outcome[], def: ControlDef, pops: Map<string, PopEntry>): Outcome {
  const checked = outcomes.filter(
    (o) => o.status === "PASS" || o.status === "PARTIAL" || o.status === "FAIL"
  );
  if (checked.length === 0) {
    const na = outcomes.find((o) => o.status === "NOT_APPLICABLE");
    if (na) return na;
    const blocked = outcomes.find((o) => o.status === "BLOCKED");
    if (blocked) return blocked;
    const nt = outcomes.filter((o) => o.status === "NOT_TESTED");
    if (nt.length > 0) return unchecked("NOT_TESTED", [...new Set(nt.map((o) => o.reason ?? ""))].join(" "));
    return defaultUnchecked(def, pops);
  }
  const sorted = [...checked].sort(
    (a, b) =>
      STRENGTH_ORDER.indexOf(a.strength as EvidenceStrength) -
      STRENGTH_ORDER.indexOf(b.strength as EvidenceStrength)
  );
  const strongest = sorted[0] as Outcome;
  const status = checked.reduce<ValidationStatus>(
    (worst, o) => ((STATUS_RANK[o.status] ?? 0) > (STATUS_RANK[worst] ?? 0) ? o.status : worst),
    "PASS"
  );
  const findings = new Map<string, FindingDraft>();
  for (const o of sorted)
    for (const f of o.findings) if (!findings.has(f.fingerprint)) findings.set(f.fingerprint, f);
  return {
    status,
    actual: sorted.map((o) => o.actual).join(" "),
    method: strongest.method,
    strength: strongest.strength,
    reason: null,
    evidence: [...new Set(sorted.flatMap((o) => o.evidence))],
    findings: [...findings.values()],
    reproduction: [...new Set(sorted.flatMap((o) => o.reproduction))],
  };
}

/** Evaluates every control. Baseline-dependent PC-T-16 is evaluated afterwards by retest. */
export function evaluateControls(
  ctx: EvalContext,
  primary: Tier,
  pops: Map<string, PopEntry>,
  runId: string
): Evaluation {
  const validations: Validation[] = [];
  const findings: Finding[] = [];
  for (const def of CONTROLS) {
    const vid = `VAL-${def.id}`;
    let outcome: Outcome;
    if (tierIndex(def.tier) > tierIndex(primary)) {
      outcome = unchecked(
        "NOT_APPLICABLE",
        `Belongs to ${def.tier} (${TIER_INFO[def.tier].name}), beyond the selected tier ${primary}.`
      );
    } else if (def.id === "PC-T-16") {
      outcome = unchecked(
        "NOT_TESTED",
        "Needs a baseline: run `product-check retest --baseline <previous results>`."
      );
    } else {
      const outcomes: Outcome[] = [];
      for (const family of [SOURCE_EVALUATORS, APP_EVALUATORS, IMPORT_EVALUATORS]) {
        const fn = family[def.id];
        if (!fn) continue;
        const o = fn(ctx);
        if (o) outcomes.push(o);
      }
      if (!(def.id in IMPORT_EVALUATORS)) {
        const mapped = mappedOutcome(ctx, def.id);
        if (mapped) outcomes.push(mapped);
      }
      outcome = merge(outcomes, def, pops);
    }
    const drafts = outcome.status === "FAIL" || outcome.status === "PARTIAL" ? outcome.findings : [];
    if ((outcome.status === "FAIL" || outcome.status === "PARTIAL") && drafts.length === 0) {
      drafts.push({
        fingerprint: "control",
        location: "see evidence",
        actual: outcome.actual,
        evidence: outcome.evidence,
        epistemic: "fact",
        confidence: "MEDIUM",
      });
    }
    const findingIds: string[] = [];
    for (const d of drafts) {
      const id = stableId("PCF", [def.id, d.fingerprint]);
      if (findingIds.includes(id)) continue;
      findingIds.push(id);
      findings.push({
        id,
        control_id: def.id,
        title: d.title ?? def.title,
        category: def.category,
        pillar: def.pillar,
        severity: d.severity ?? def.severity,
        ux_severity: d.ux !== undefined ? d.ux : def.ux,
        status: "OPEN",
        lifecycle: "NEW",
        epistemic: d.epistemic,
        confidence: d.confidence,
        reproducibility:
          d.reproducibility ?? (d.epistemic === "hypothesis" ? "not-reproduced" : "deterministic"),
        reproduction: d.reproduction ?? outcome.reproduction,
        pop: ctx.ev.get(d.evidence[0] ?? "")?.pop ?? def.pops[0] ?? "repository",
        location: d.location,
        expected: def.expected,
        actual: d.actual,
        impact: { ...def.impact },
        root_cause: {
          statement: def.root_cause,
          certainty: d.epistemic === "fact" ? "inference" : "hypothesis",
        },
        evidence_ids: [...new Set(d.evidence)],
        validation_id: vid,
        work_packet_id: null,
        first_seen_run: runId,
        history: [],
      });
    }
    for (const e of outcome.evidence) ctx.ev.link(e, vid);
    validations.push({
      id: vid,
      control_id: def.id,
      pillar: def.pillar,
      tier: def.tier,
      title: def.title,
      expected: def.expected,
      actual: outcome.actual,
      status: outcome.status,
      method: outcome.method,
      strength: outcome.strength,
      reason: outcome.reason,
      evidence_ids: outcome.evidence,
      reproduction: outcome.reproduction,
      hard_gate: def.gate,
      weight: def.weight,
      finding_ids: findingIds.sort(),
    });
  }
  return { validations, findings };
}
