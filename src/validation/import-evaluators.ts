// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Evaluators backed by imported artifacts: executed test results (including contract control_mappings that link
 * named tests to any control), npm audit, Spec/Impact/Outcome/Architecture Check reports, and the operational
 * files of CT-T4 (operational-evaluators.ts). Imported results are evidence
 * of executions that happened elsewhere; Product Check records where they came from and their checksum.
 */
import { isEndToEnd, tally, type TestCase, type TestRun } from "../importers/tests.js";
import {
  checked,
  unchecked,
  type EvalContext,
  type Evaluator,
  type FindingDraft,
  type Outcome,
} from "./context.js";
import { OPERATIONAL_EVALUATORS } from "./operational-evaluators.js";

/** Evidence for a set of test cases from one results file. */
function testEv(ctx: EvalContext, run: TestRun, cases: TestCase[], what: string): string {
  const t = tally(cases);
  const failing = cases
    .filter((c) => c.status === "failed")
    .slice(0, 5)
    .map((c) => c.name);
  return ctx.ev.add({
    kind: "test-result",
    pop: "test-results",
    strength: "executed-test",
    provenance: "imported",
    locator: run.source,
    revision: null,
    summary: `${what}: ${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped (${run.format})${failing.length ? `; failing: ${failing.join(" | ")}` : ""}`,
    checksum: run.sha256,
  });
}

/** Evaluates a control from tests mapped to it in the contract. */
export function mappedOutcome(ctx: EvalContext, controlId: string): Outcome | null {
  const patterns = ctx.contract.control_mappings
    .filter((m) => m.control_id === controlId)
    .map((m) => new RegExp(m.test_name_pattern, "i"));
  if (patterns.length === 0) return null;
  const ids: string[] = [];
  const findings: FindingDraft[] = [];
  let total = 0;
  let failed = 0;
  for (const run of ctx.tests) {
    const cases = run.cases.filter((c) => c.status !== "skipped" && patterns.some((p) => p.test(c.name)));
    if (cases.length === 0) continue;
    total += cases.length;
    const id = testEv(ctx, run, cases, `tests mapped to ${controlId}`);
    ids.push(id);
    for (const c of cases.filter((x) => x.status === "failed")) {
      failed++;
      findings.push({
        fingerprint: `test|${c.name}`,
        location: c.file ?? run.source,
        actual: `Mapped test failed: ${c.name}`,
        evidence: [id],
        epistemic: "fact",
        confidence: "HIGH",
        reproducibility: "deterministic",
        title: `Failing test: ${c.name}`.slice(0, 200),
        reproduction: [`Re-run the test "${c.name}" and inspect its failure output.`],
      });
    }
  }
  if (total === 0) {
    return unchecked(
      "NOT_TESTED",
      ctx.tests.length === 0
        ? `Mapped tests for ${controlId} were declared but no test results were imported.`
        : `No imported test case matches the patterns mapped to ${controlId}.`
    );
  }
  if (failed === 0)
    return checked(
      "PASS",
      `${total} mapped test case(s) passed.`,
      "imported-test-results",
      "executed-test",
      ids
    );
  return checked(
    "FAIL",
    `${failed} of ${total} mapped test case(s) failed.`,
    "imported-test-results",
    "executed-test",
    ids,
    findings.slice(0, 25)
  );
}

/** A control only verifiable through mapped tests. */
const mappedOnly =
  (controlId: string, hint: string): Evaluator =>
  (ctx) =>
    mappedOutcome(ctx, controlId) ??
    unchecked(
      "NOT_TESTED",
      `${hint} No adapter in this release can verify it directly; map executed tests to ${controlId} with contract.control_mappings.`
    );

const PC_T_03: Evaluator = (ctx) => {
  if (ctx.tests.length === 0)
    return unchecked(
      "NOT_TESTED",
      "No test results were imported (Product Check never runs repository code; pass --test-results <junit.xml>)."
    );
  const ids: string[] = [];
  const findings: FindingDraft[] = [];
  let total = 0;
  for (const run of ctx.tests) {
    const id = testEv(ctx, run, run.cases, "imported test results");
    ids.push(id);
    total += run.cases.filter((c) => c.status !== "skipped").length;
    for (const c of run.cases.filter((x) => x.status === "failed").slice(0, 25)) {
      findings.push({
        fingerprint: `test|${c.name}`,
        location: c.file ?? run.source,
        actual: `Test failed: ${c.name}`,
        evidence: [id],
        epistemic: "fact",
        confidence: "HIGH",
        reproducibility: "deterministic",
        title: `Failing test: ${c.name}`.slice(0, 200),
        reproduction: [`Re-run the test "${c.name}".`],
      });
    }
  }
  if (total === 0)
    return checked(
      "PARTIAL",
      "Imported results contain no executed (non-skipped) test cases.",
      "imported-test-results",
      "executed-test",
      ids,
      [
        {
          fingerprint: "tests-all-skipped",
          location: ctx.tests[0]?.source ?? "tests",
          actual: "Every imported test was skipped.",
          evidence: ids,
          epistemic: "fact",
          confidence: "HIGH",
          severity: "P2",
          title: "All imported tests were skipped",
        },
      ]
    );
  if (findings.length === 0)
    return checked(
      "PASS",
      `${total} executed test case(s), none failed.`,
      "imported-test-results",
      "executed-test",
      ids
    );
  return checked(
    "FAIL",
    `${findings.length} failing test case(s) of ${total}.`,
    "imported-test-results",
    "executed-test",
    ids,
    findings
  );
};

const PC_C_08: Evaluator = (ctx) => {
  const mapped = mappedOutcome(ctx, "PC-C-08");
  if (mapped) return mapped;
  const e2e = ctx.tests
    .map((run) => ({ run, cases: run.cases.filter((c) => c.status !== "skipped" && isEndToEnd(c)) }))
    .filter((x) => x.cases.length > 0);
  if (e2e.length > 0) {
    const ids = e2e.map((x) => testEv(ctx, x.run, x.cases, "end-to-end tests"));
    const failing = e2e.flatMap((x) =>
      x.cases.filter((c) => c.status === "failed").map((c) => ({ c, id: ids[e2e.indexOf(x)] as string }))
    );
    if (failing.length === 0)
      return checked(
        "PASS",
        `${e2e.reduce((n, x) => n + x.cases.length, 0)} end-to-end case(s) passed.`,
        "imported-test-results",
        "executed-test",
        ids
      );
    return checked(
      "FAIL",
      `${failing.length} end-to-end case(s) failed.`,
      "imported-test-results",
      "executed-test",
      ids,
      failing.slice(0, 25).map(({ c, id }) => ({
        fingerprint: `test|${c.name}`,
        location: c.file ?? "e2e",
        actual: `End-to-end test failed: ${c.name}`,
        evidence: [id],
        epistemic: "fact" as const,
        confidence: "HIGH" as const,
        reproducibility: "deterministic" as const,
        title: `Failing journey test: ${c.name}`.slice(0, 200),
      }))
    );
  }
  const repo = ctx.repo;
  if (repo && repo.e2eFiles.length > 0) {
    const ids = repo.e2eFiles.slice(0, 3).map((p) =>
      ctx.ev.add({
        kind: "file-presence",
        pop: "automated-tests",
        strength: "static",
        provenance: "observed",
        locator: p,
        revision: ctx.revision,
        summary: "end-to-end test file (not executed by Product Check)",
        checksum: repo.snapshot.byPath.get(p)?.sha256 ?? null,
      })
    );
    return checked(
      "PARTIAL",
      `${repo.e2eFiles.length} end-to-end test file(s) exist, but no executed end-to-end results were imported.`,
      "static-analysis",
      "static",
      ids,
      [
        {
          fingerprint: "e2e-not-executed",
          location: repo.e2eFiles[0] as string,
          actual: "End-to-end tests exist but their results were not imported.",
          evidence: ids,
          epistemic: "fact",
          confidence: "HIGH",
          severity: "P3",
          title: "End-to-end results not provided",
        },
      ]
    );
  }
  if (repo) {
    const id = ctx.ev.add({
      kind: "search-scope",
      pop: "automated-tests",
      strength: "static",
      provenance: "observed",
      locator: `repository (${repo.snapshot.files.length} files)`,
      revision: ctx.revision,
      summary: "Searched for end-to-end test files and Playwright/Cypress configuration; none found.",
    });
    return checked(
      "FAIL",
      "No end-to-end tests for critical journeys.",
      "static-analysis",
      "static",
      [id],
      [
        {
          fingerprint: "no-e2e",
          location: "repository",
          actual: "No end-to-end tests found.",
          evidence: [id],
          epistemic: "fact",
          confidence: "HIGH",
          title: "Critical journeys have no end-to-end tests",
        },
      ]
    );
  }
  return null;
};

const PC_S_15: Evaluator = (ctx) => {
  if (!ctx.audit)
    return unchecked(
      "NOT_TESTED",
      "No dependency audit was imported (pass --npm-audit <npm audit --json output>)."
    );
  const a = ctx.audit.data;
  const id = ctx.ev.add({
    kind: "imported-report",
    pop: "dependency-manifests",
    strength: "imported-report",
    provenance: "imported",
    locator: ctx.audit.source,
    revision: null,
    summary: `npm audit: ${a.critical} critical, ${a.high} high, ${a.moderate} moderate, ${a.low} low`,
    checksum: ctx.audit.sha256,
  });
  if (a.critical + a.high === 0)
    return checked(
      "PASS",
      `No critical or high vulnerabilities (${a.moderate} moderate, ${a.low} low).`,
      "imported-report",
      "imported-report",
      [id]
    );
  const pkgs = a.packages.filter((p) => p.severity === "critical" || p.severity === "high");
  const findings: FindingDraft[] = (
    pkgs.length > 0 ? pkgs : [{ name: "(unspecified)", severity: a.critical > 0 ? "critical" : "high" }]
  )
    .slice(0, 25)
    .map((p) => ({
      fingerprint: `audit|${p.name}`,
      location: p.name,
      actual: `${p.name}: ${p.severity} vulnerability reported by npm audit.`,
      evidence: [id],
      epistemic: "fact",
      confidence: "MEDIUM",
      severity: p.severity === "critical" ? "P1" : "P2",
      title: `Vulnerable dependency: ${p.name} (${p.severity})`,
    }));
  return checked(
    "FAIL",
    `${a.critical} critical and ${a.high} high vulnerabilities.`,
    "imported-report",
    "imported-report",
    [id],
    findings
  );
};

const PC_C_10: Evaluator = (ctx) => {
  if (!ctx.spec)
    return unchecked(
      "NOT_TESTED",
      "No Spec Check report was imported (optional; pass --spec-check <report.json>)."
    );
  const s = ctx.spec.data;
  const id = ctx.ev.add({
    kind: "imported-report",
    pop: "documentation",
    strength: "imported-report",
    provenance: "imported",
    locator: ctx.spec.source,
    revision: null,
    summary: `Spec Check: ${s.requirements} requirement(s), ${s.high} high- and ${s.medium} medium-severity finding(s)`,
    checksum: ctx.spec.sha256,
  });
  if (s.high === 0)
    return checked(
      "PASS",
      `${s.requirements} requirement(s); no high-severity Spec Check findings.`,
      "imported-report",
      "imported-report",
      [id]
    );
  return checked(
    "FAIL",
    `${s.high} high-severity Spec Check finding(s).`,
    "imported-report",
    "imported-report",
    [id],
    [
      {
        fingerprint: "spec-check-high",
        location: ctx.spec.source,
        actual: `${s.high} high-severity requirement finding(s).`,
        evidence: [id],
        epistemic: "fact",
        confidence: "MEDIUM",
        title: "Requirements are not specific or testable enough",
      },
    ]
  );
};

const PC_T_12: Evaluator = (ctx) => {
  if (!ctx.impact)
    return unchecked(
      "NOT_TESTED",
      "No Impact Check report was imported (optional; pass --impact-check <report.json>)."
    );
  const s = ctx.impact.data;
  const id = ctx.ev.add({
    kind: "imported-report",
    pop: "repository",
    strength: "imported-report",
    provenance: "imported",
    locator: ctx.impact.source,
    revision: s.commit,
    summary: `Impact Check: ${s.findings} finding(s) (${s.high} high), ${s.affected_modules} affected module(s), ${s.test_candidates} test candidate(s)`,
    checksum: ctx.impact.sha256,
  });
  if (s.high === 0)
    return checked(
      "PASS",
      "No high-severity impact findings for the change.",
      "imported-report",
      "imported-report",
      [id]
    );
  return checked(
    "PARTIAL",
    `${s.high} high-severity impact finding(s) need targeted verification.`,
    "imported-report",
    "imported-report",
    [id],
    [
      {
        fingerprint: "impact-high",
        location: ctx.impact.source,
        actual: `${s.high} high-severity impact finding(s).`,
        evidence: [id],
        epistemic: "inference",
        confidence: "MEDIUM",
        title: "High-impact changes need targeted verification",
      },
    ]
  );
};

const PC_T_17: Evaluator = (ctx) => {
  if (!ctx.architecture)
    return unchecked(
      "NOT_TESTED",
      "No Architecture Check report was imported (optional; pass --architecture-check <report.json>)."
    );
  const s = ctx.architecture.data;
  const rules = s.verified_rules.length > 0 ? ` (${s.verified_rules.join(", ")})` : "";
  const id = ctx.ev.add({
    kind: "imported-report",
    pop: "repository",
    strength: "imported-report",
    provenance: "imported",
    locator: ctx.architecture.source,
    revision: null,
    summary: `Architecture Check ${s.schema_version}: ${s.model_path ?? "model"} (${s.model_format ?? "unknown format"}), ${s.findings} finding(s); ${s.verified_drift} verified drift${rules}, ${s.hypotheses} hypotheses, ${s.unknown} unknown`,
    checksum: ctx.architecture.sha256,
  });
  if (s.verified_drift === 0)
    return checked(
      "PASS",
      "No verified architecture drift of medium severity or above.",
      "imported-report",
      "imported-report",
      [id]
    );
  return checked(
    "PARTIAL",
    `${s.verified_drift} verified architecture drift finding(s)${rules}.`,
    "imported-report",
    "imported-report",
    [id],
    [
      {
        fingerprint: "architecture-drift",
        location: s.model_path ?? ctx.architecture.source,
        actual: `${s.verified_drift} verified drift finding(s) of medium severity or above${rules}.`,
        evidence: [id],
        epistemic: "fact",
        confidence: "HIGH",
        title: "The architecture model and the code have drifted",
      },
    ]
  );
};

const PC_T_15: Evaluator = (ctx) => {
  if (!ctx.outcome)
    return unchecked(
      "NOT_TESTED",
      "No Outcome Check report was imported (optional; pass --outcome-check <report.json>)."
    );
  const s = ctx.outcome.data;
  if (s.ci_first_pass_rate === null)
    return unchecked(
      "NOT_TESTED",
      "The Outcome Check report withholds the CI first-pass rate (insufficient sample or no CI data)."
    );
  const id = ctx.ev.add({
    kind: "imported-report",
    pop: "ci-cd",
    strength: "imported-report",
    provenance: "imported",
    locator: ctx.outcome.source,
    revision: null,
    summary: `Outcome Check: CI first-pass rate ${Math.round(s.ci_first_pass_rate * 1000) / 10}%, reverted PRs ${s.reverted_prs ?? "unknown"}`,
    checksum: ctx.outcome.sha256,
  });
  if (s.ci_first_pass_rate >= 0.8 && (s.reverted_prs ?? 0) === 0)
    return checked("PASS", "CI first-pass rate ≥ 80% and no reverts.", "imported-report", "imported-report", [
      id,
    ]);
  return checked(
    "PARTIAL",
    `CI first-pass rate ${Math.round(s.ci_first_pass_rate * 1000) / 10}%, reverted PRs ${s.reverted_prs ?? "unknown"}.`,
    "imported-report",
    "imported-report",
    [id],
    [
      {
        fingerprint: "delivery-stability",
        location: ctx.outcome.source,
        actual: "Delivery stability below target.",
        evidence: [id],
        epistemic: "fact",
        confidence: "MEDIUM",
        title: "Delivery is not yet stable",
      },
    ]
  );
};

const PC_S_14: Evaluator = (ctx) => {
  if (ctx.contract.product.multi_tenant === false)
    return unchecked(
      "NOT_APPLICABLE",
      "The contract declares a single-tenant product with no per-user data separation requirement."
    );
  const mapped = mappedOutcome(ctx, "PC-S-14");
  if (mapped) return mapped;
  if (ctx.contract.product.multi_tenant === null)
    return unchecked(
      "BLOCKED",
      "Declare product.multi_tenant in the scan contract; tenant isolation cannot be scoped until it is known."
    );
  return unchecked(
    "NOT_TESTED",
    "Two-tenant isolation needs credentialed tests; map executed isolation tests to PC-S-14 with contract.control_mappings."
  );
};

const PC_AI_03: Evaluator = (ctx) => {
  if (!ctx.aiInScope)
    return unchecked(
      "NOT_APPLICABLE",
      "No AI SDK dependency was found and the contract does not declare AI use."
    );
  return mappedOnly("PC-AI-03", "Adversarial AI behaviour needs executed evaluations.")(ctx);
};

/** Import-backed evaluators by control ID. */
export const IMPORT_EVALUATORS: Record<string, Evaluator> = {
  "PC-C-08": PC_C_08,
  "PC-C-09": mappedOnly(
    "PC-C-09",
    "Onboarding needs an executed journey (browser automation is not built into this release)."
  ),
  "PC-C-10": PC_C_10,
  "PC-C-11": (ctx) =>
    mappedOutcome(ctx, "PC-C-11") ??
    unchecked(
      "NOT_TESTED",
      "No production telemetry adapter exists in this release; real-user journey health cannot be observed."
    ),
  "PC-T-03": PC_T_03,
  "PC-T-12": PC_T_12,
  "PC-T-13": mappedOnly("PC-T-13", "Rollback needs an executed rehearsal."),
  "PC-T-14": (ctx) => mappedOutcome(ctx, "PC-T-14") ?? (OPERATIONAL_EVALUATORS["PC-T-14"] as Evaluator)(ctx),
  "PC-T-15": PC_T_15,
  "PC-T-17": PC_T_17,
  "PC-T-18": OPERATIONAL_EVALUATORS["PC-T-18"] as Evaluator,
  "PC-T-19": OPERATIONAL_EVALUATORS["PC-T-19"] as Evaluator,
  "PC-T-20": OPERATIONAL_EVALUATORS["PC-T-20"] as Evaluator,
  "PC-S-13": (ctx) =>
    ctx.contract.product.has_user_accounts === false
      ? unchecked(
          "NOT_APPLICABLE",
          "The contract declares that the product has no user accounts or privileged paths."
        )
      : mappedOnly(
          "PC-S-13",
          "Authorization bypass testing needs credentialed negative tests, which Product Check does not run itself."
        )(ctx),
  "PC-S-14": PC_S_14,
  "PC-S-15": PC_S_15,
  "PC-AI-03": PC_AI_03,
};
