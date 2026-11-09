// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Agent-ready fix packets (VC-P4) for verified, high-priority findings. Each packet traces to source lines and/or
 * runtime paths through evidence, states the root-cause hypothesis and its certainty, the smallest systemic change,
 * acceptance conditions, regression and negative tests, a change-scope guard and a rollback plan. Test commands are
 * never invented: a command appears only when the operator's policy declares it; reproduction commands are declared
 * by the implementer when recording the fix. Packets are proposals: applying one needs permission, and a packet's
 * implementation is not a fix until verify passes.
 */
import type { Results } from "../types.js";
import { findingRisk } from "./register.js";
import {
  ASSURANCE_SCHEMA_VERSION,
  METHODOLOGY_VERSION,
  type AssurancePolicy,
  type ChangeReview,
  type ClosureRegister,
  type FixPacket,
  type RegisterEntry,
} from "./types.js";

const ELIGIBLE = new Set(["CONFIRMED", "CORROBORATED", "REPRODUCED"]);
const ACTIVE = new Set([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "FIX_PROPOSED",
  "RETEST_REQUIRED",
  "REGRESSED",
]);

const STANDARD_CONSTRAINTS = [
  "Change only what the packet's scope guard allows; anything else needs a new review.",
  "Do not disable, skip or weaken tests, checks or security controls to make verification pass.",
  "Use synthetic data; never commit credentials or real personal data.",
  "A proposed fix is not a verified fix: run product-check verify against the exact fix commit.",
  "An agent cannot approve its own change; closure needs signed human approval for the risk tier.",
];

const NEGATIVE: Record<string, string[]> = {
  trust: [
    "An unauthenticated request to the affected path is refused (401/403), not served.",
    "A signed-in user cannot read or change another user's or tenant's record by changing an ID.",
    "No credential or privileged value appears in the client bundle or responses.",
  ],
  technology: [
    "Error, empty and timeout paths return a handled response, not a crash or silent fallback.",
    "Retrying the operation does not repeat its side effect.",
  ],
  customer: ["Empty, error and loading states are understandable and keyboard-accessible."],
};

/** Packets for active, verified P0–P2 entries of the register. */
export function buildFixPackets(
  reg: ClosureRegister,
  results: Results | null,
  reviews: ChangeReview[],
  policy: AssurancePolicy
): FixPacket[] {
  const packets: FixPacket[] = [];
  const policyTests = policy.required_checks.map((c) => ({
    id: `regression:${c.id}`,
    kind: "regression" as const,
    description: `Policy required check ${c.id} (${c.purpose}).`,
    argv: c.argv,
  }));
  for (const e of reg.entries) {
    if (!ACTIVE.has(e.state) || !ELIGIBLE.has(e.verification.state) || e.severity === "P3") continue;
    packets.push(
      e.source === "baseline-scan"
        ? fromResults(e, results, policyTests, policy)
        : fromReview(e, reviews, policyTests, policy)
    );
  }
  return packets;
}

function base(
  e: RegisterEntry,
  policy: AssurancePolicy
): Pick<
  FixPacket,
  | "schema_version"
  | "kind"
  | "methodology_version"
  | "fix_id"
  | "finding_ids"
  | "source_finding_ids"
  | "status"
  | "risk_class"
  | "severity"
  | "owner"
  | "implementation"
  | "rollback_plan"
> {
  return {
    schema_version: ASSURANCE_SCHEMA_VERSION,
    kind: "fix-packet",
    methodology_version: METHODOLOGY_VERSION,
    fix_id: `FP-${e.finding_id}`,
    finding_ids: [e.finding_id],
    source_finding_ids: [e.source_finding_id],
    status:
      e.state === "RETEST_REQUIRED" || e.state === "FIX_PROPOSED"
        ? "IMPLEMENTED_UNVERIFIED"
        : e.state === "REGRESSED"
          ? "REGRESSED"
          : "PROPOSED",
    risk_class: findingRisk(e.severity),
    severity: e.severity,
    owner: { id: null, accountable_human_required: true },
    implementation: { change_sha: null, implemented_by: null },
    rollback_plan: `Revert the fix commit (git revert <fix-sha>) and redeploy the previous release${policy.release.rollback_plan ? `; follow ${policy.release.rollback_plan}` : ""}. If the fix includes a data migration, run its down step first and confirm with a backup restore test.`,
  };
}

function fromResults(
  e: RegisterEntry,
  results: Results | null,
  policyTests: FixPacket["tests_required"],
  policy: AssurancePolicy
): FixPacket {
  const f = results?.findings.find((x) => x.id === e.source_finding_id);
  const rem = results?.blueprint.remediations.find((r) => r.finding_ids.includes(e.source_finding_id));
  const wp = results?.blueprint.work_packets.find((w) => w.finding_ids.includes(e.source_finding_id));
  const trace = results?.blueprint.traceability.find((t) => t.finding_id === e.source_finding_id);
  const ev = (f?.evidence_ids ?? [])
    .map((id) => results?.evidence.find((x) => x.id === id))
    .filter((x) => x !== undefined);
  const surfaces = ev.length
    ? ev.map((x) =>
        x.kind === "http-response"
          ? { path: null, line: null, runtime: x.source.locator }
          : { path: x.source.locator, line: x.source.line_start, runtime: null }
      )
    : [{ path: e.location, line: null, runtime: null }];
  const files = [...new Set(surfaces.map((s) => s.path).filter((p): p is string => p !== null))];
  return {
    ...base(e, policy),
    title: `${e.rule_or_control}: ${e.title}`,
    affected_surfaces: surfaces,
    user_impact:
      [f?.impact.customer, f?.impact.trust, f?.impact.technology]
        .filter((x): x is string => typeof x === "string")
        .join(" ") || "Not stated in the results.",
    evidence_refs: f?.evidence_ids ?? [],
    root_cause: {
      hypothesis: f?.root_cause.statement ?? "Not stated.",
      certainty: f?.root_cause.certainty ?? "hypothesis",
      confidence: f?.confidence ?? "LOW",
    },
    constraints: [...new Set([...(wp?.constraints ?? []), ...STANDARD_CONSTRAINTS])],
    proposed_change: rem?.recommended_change ?? "See the control's remediation guidance.",
    tests_required: [
      {
        id: `reproduction:${e.finding_id}`,
        kind: "reproduction",
        description: `Product Check re-assesses ${e.rule_or_control} at the fix commit (built into verify). Also declare a test that fails before the fix and passes after it (fix --repro-cmd).`,
        argv: null,
      },
      {
        id: `regression:${e.finding_id}`,
        kind: "regression",
        description: rem?.regression_test.description ?? "A regression test for this behavior in CI.",
        argv: null,
      },
      ...policyTests,
    ],
    negative_cases: NEGATIVE[e.pillar] ?? [],
    dependencies: rem?.depends_on ?? [],
    acceptance_conditions: [
      ...(rem?.acceptance_criteria ?? []),
      `product-check verify --finding ${e.finding_id} passes at the exact fix commit (targeted + regression).`,
      `Signed human approval(s) for closure (${policy.risk.approvals[findingRisk(e.severity)]} for ${findingRisk(e.severity)} risk).`,
    ],
    scope_guard: {
      allowed_paths: [...files, "test/**", "tests/**", "**/*.test.*", "**/*.spec.*"],
      note: "Edits outside these paths need explicit approval or a new scan contract (scope drift).",
    },
    traceability: {
      control_or_rule: e.rule_or_control,
      spec_requirement_ids: trace
        ? [trace.journey_or_requirement.split(":")[0] ?? trace.journey_or_requirement]
        : [],
      locations: surfaces.map((s) => s.runtime ?? `${s.path}${s.line !== null ? `:${s.line}` : ""}`),
    },
    generated_from: { results_run_id: results?.run.run_id ?? null, review_id: null },
  };
}

function fromReview(
  e: RegisterEntry,
  reviews: ChangeReview[],
  policyTests: FixPacket["tests_required"],
  policy: AssurancePolicy
): FixPacket {
  const review = reviews.find((r) => r.findings.some((f) => f.id === e.source_finding_id));
  const f = review?.findings.find((x) => x.id === e.source_finding_id);
  const path = f?.location.path ?? e.location;
  return {
    ...base(e, policy),
    title: `${e.rule_or_control}: ${e.title}`,
    affected_surfaces: [{ path, line: f?.location.line ?? null, runtime: f?.location.runtime ?? null }],
    user_impact: f?.impact ?? "Not stated.",
    evidence_refs: f?.evidence_ids ?? [],
    root_cause: {
      hypothesis: f ? `${f.actual} Expected: ${f.expected}` : e.title,
      certainty: e.epistemic,
      confidence: f?.confidence ?? "LOW",
    },
    constraints: STANDARD_CONSTRAINTS,
    proposed_change: f?.expected ?? "Restore the expected behavior.",
    tests_required: [
      {
        id: `reproduction:${e.finding_id}`,
        kind: "reproduction",
        description: `The ${e.rule_or_control} rule no longer matches at the fix commit (built into verify), plus a declared test that fails before the fix.`,
        argv: null,
      },
      ...policyTests,
    ],
    negative_cases: NEGATIVE[e.pillar] ?? [],
    dependencies: [],
    acceptance_conditions: [
      f?.expected ?? "Expected behavior restored.",
      `product-check verify --finding ${e.finding_id} passes at the exact fix commit.`,
      `Signed human approval(s) for closure (${policy.risk.approvals[findingRisk(e.severity)]}).`,
    ],
    scope_guard: {
      allowed_paths: [path, "test/**", "tests/**", "**/*.test.*", "**/*.spec.*"],
      note: "Edits outside these paths need explicit approval or a new review.",
    },
    traceability: {
      control_or_rule: e.rule_or_control,
      spec_requirement_ids: [],
      locations: [`${path}${f?.location.line ? `:${f.location.line}` : ""}`],
    },
    generated_from: { results_run_id: null, review_id: review?.review_id ?? null },
  };
}
