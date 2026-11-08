// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Closure verification (VC-P5) against the exact fix commit.
 *
 * Targeted reproduction, per finding:
 *  - baseline-scan findings: Product Check re-assesses the repository at the fix commit (offline; same contract,
 *    imports cleared unless re-supplied) and the finding's control must no longer produce the finding or any
 *    finding of equal or higher severity. A control that cannot be evaluated is NOT_TESTED, never PASS.
 *  - change-review findings: the rule is re-run over the whole file at the fix commit; it must no longer match.
 *  - the implementer's declared reproduction commands must exit 0.
 * Regression: the policy's required checks and the regression corpus must pass; the re-assessment must show no new
 * P0/P1 finding and no regressed control compared with the baseline.
 *
 * Preconditions: the repository HEAD is the fix commit, the working tree is clean, and the finding is
 * RETEST_REQUIRED. Before/after results are retained (the after-results are written next to the register).
 */
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { defaultContract } from "../contract/contract.js";
import type { Results, ScanContract, Severity } from "../types.js";
import { runAssessment } from "../run.js";
import { sha256 } from "../util/hash.js";
import { CONTROL_BY_ID } from "../validation/catalog.js";
import type { ExecPermission } from "../exec/process.js";
import type { EvidenceLog } from "./evidence-log.js";
import { lineHits } from "./lanes.js";
import { FILE_RULES } from "./verification.js";
import { overall, runCommands } from "./proof.js";
import {
  ASSURANCE_SCHEMA_VERSION,
  type AssurancePolicy,
  type ClosureRegister,
  type EnvironmentRecord,
  type VerificationCheckResult,
  type VerificationRun,
} from "./types.js";
import { seqId } from "./util.js";

const RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export interface VerifyInput {
  register: ClosureRegister;
  findingIds: string[];
  repo: string;
  head: string;
  clean: boolean | null;
  baseline: { results: Results; sha256: string };
  contract: ScanContract | null;
  extraTestResults: string[];
  policy: AssurancePolicy;
  permission: ExecPermission;
  env: EnvironmentRecord;
  log: EvidenceLog;
  now: () => Date;
  baseDir: string;
  writeAfterResults: (verificationId: string, results: Results) => string;
}

/** Runs one verification and returns the run (the caller applies it to the register). */
export async function verifyFindings(input: VerifyInput): Promise<VerificationRun> {
  const reg = input.register;
  const started = input.now().toISOString();
  const verificationId = seqId("VR", reg.verification_runs.length + 1);
  const entries = input.findingIds.map((id) => reg.entries.find((e) => e.finding_id === id));
  const reasons: string[] = [];
  const limitations: string[] = [];
  const checks: VerificationCheckResult[] = [];
  const fixIds = [...new Set(entries.map((e) => e?.fix_ids.at(-1) ?? null))];
  const fix = reg.fixes.find((f) => f.fix_id === fixIds[0]) ?? null;
  let executions: VerificationRun["executions"] = [];
  let afterResults: VerificationRun["after_results"] = null;
  const precondition = (msg: string): void => {
    reasons.push(msg);
  };
  if (entries.some((e) => e === undefined)) precondition("Unknown finding ID.");
  else if (entries.some((e) => e?.state !== "RETEST_REQUIRED"))
    precondition(
      `Every finding must be RETEST_REQUIRED (got ${entries.map((e) => `${e?.finding_id}=${e?.state}`).join(", ")}).`
    );
  if (fixIds.length !== 1 || fix === null) precondition("The findings must share one recorded fix.");
  else if (fix.change_sha !== input.head)
    precondition(
      `HEAD ${input.head.slice(0, 12)} is not the fix commit ${fix.change_sha.slice(0, 12)}; verification must run against the exact fix SHA.`
    );
  if (input.clean !== true)
    precondition(
      input.clean === false
        ? "The working tree is not clean; results would not describe the fix commit."
        : "Could not determine whether the working tree is clean."
    );

  const run = (): VerificationRun => ({
    schema_version: ASSURANCE_SCHEMA_VERSION,
    kind: "verification-run",
    verification_id: verificationId,
    purpose: "closure",
    finding_ids: input.findingIds,
    fix_id: fix?.fix_id ?? null,
    exact_sha: input.head,
    worktree_clean: input.clean,
    environment: input.env,
    started_at: started,
    finished_at: input.now().toISOString(),
    checks,
    executions,
    before_evidence_ids: [],
    after_evidence_ids: [],
    after_results: afterResults,
    result: "INCONCLUSIVE",
    reasons,
    limitations,
    actor: { id: "product-check", type: "system" },
  });
  if (reasons.length > 0) {
    const r = run();
    r.result = "INCONCLUSIVE";
    reasons.unshift("Preconditions not met; nothing was verified.");
    return r;
  }
  const es = entries as NonNullable<(typeof entries)[number]>[];

  // Re-assessment at the fix commit (offline) -----------------------------------------------------------------------
  const base = input.baseline.results;
  const contract: ScanContract = input.contract ?? structuredClone(base.contract);
  if (!input.contract) {
    contract.imports = defaultContract().imports;
    limitations.push(
      "Imported artifacts from the baseline (test results, reports, observations) were not reused; controls that need them are NOT_TESTED unless re-supplied."
    );
  }
  contract.target.repository = { path: input.repo };
  contract.imports.test_results = [...contract.imports.test_results, ...input.extraTestResults];
  const { results: after } = await runAssessment({
    contract,
    permissions: {
      network: false,
      exposureProbe: false,
      origin: null,
      appBlockedReason: contract.target.application
        ? "Closure verification runs offline; supply recorded observations with --contract to re-check application controls."
        : null,
    },
    baseline: input.baseline,
    baseDir: input.baseDir,
    now: input.now,
  });
  const path = input.writeAfterResults(verificationId, after);
  const afterSha = sha256(`${JSON.stringify(after, null, 2)}\n`);
  const afterEvidence = input.log.append({
    type: "results-artifact",
    subject: verificationId,
    commit_sha: input.head,
    environment_id: input.env.environment_id,
    summary: `Re-assessment ${after.run.run_id} at ${input.head.slice(0, 12)}: ${after.verdict.verdict}`,
    locator: path,
    line: null,
    payload: {
      run_id: after.run.run_id,
      results_sha256: afterSha,
      verdict: after.verdict.verdict,
      open: after.scorecard.open_findings,
    },
  });
  afterResults = {
    run_id: after.run.run_id,
    results_path: path,
    results_sha256: afterSha,
    verdict: after.verdict.verdict,
    open: after.scorecard.open_findings,
  };

  for (const e of es) {
    if (e.source === "baseline-scan") {
      const v = after.validations.find((x) => x.control_id === e.rule_or_control);
      const still = after.findings.find((f) => f.id === e.source_finding_id && f.status !== "RESOLVED");
      const sameOrWorse = after.findings.filter(
        (f) =>
          f.control_id === e.rule_or_control &&
          (f.status === "OPEN" || f.status === "UNVERIFIED") &&
          RANK[f.severity] <= RANK[e.severity]
      );
      let status: VerificationCheckResult["status"];
      let detail: string;
      if (!v || v.status === "NOT_TESTED" || v.status === "BLOCKED") {
        status = "NOT_TESTED";
        detail = `${e.rule_or_control} could not be evaluated at the fix commit${v?.reason ? `: ${v.reason}` : ""}.`;
      } else if (still) {
        status = "FAIL";
        detail = `${e.rule_or_control} still reports the original finding (${still.location}).`;
      } else if (sameOrWorse.length > 0) {
        status = "FAIL";
        detail = `The original location is gone but ${e.rule_or_control} still fails at ${sameOrWorse
          .map((f) => f.location)
          .slice(0, 3)
          .join(", ")} (${sameOrWorse[0]?.severity}): the fix moved the problem.`;
      } else {
        status = "PASS";
        detail = `${e.rule_or_control} is ${v.status} at the fix commit and no longer reports the finding.`;
      }
      checks.push({
        check_id: `targeted:${e.finding_id}:control`,
        kind: "control-reassessment",
        role: "targeted",
        status,
        detail,
        execution_id: null,
        evidence_ids: [afterEvidence],
      });
      const gate = CONTROL_BY_ID.get(e.rule_or_control)?.gate ?? null;
      if (gate) {
        const g = after.scorecard.gates.find((x) => x.gate_id === gate);
        checks.push({
          check_id: `targeted:${e.finding_id}:gate`,
          kind: "gate-recheck",
          role: "targeted",
          status: g === undefined ? "NOT_TESTED" : g.status === "FAIL" ? "FAIL" : "PASS",
          detail:
            g === undefined
              ? `Associated hard gate ${gate} was not evaluated.`
              : g.status === "UNVERIFIED"
                ? `Associated hard gate ${gate} no longer fails; it stays UNVERIFIED overall because other gate controls were not testable here (disclosed by the release gate).`
                : `Associated hard gate ${gate}: ${g.status}.`,
          execution_id: null,
          evidence_ids: [afterEvidence],
        });
      }
    } else {
      const [path0, lineStr] = e.location.split(/:(?=\d+$)/);
      const filePath = path0 ?? e.location;
      let text: string | null;
      try {
        const root = resolve(input.repo);
        const abs = resolve(root, filePath);
        text = abs.startsWith(root + sep) ? readFileSync(abs, "utf8") : null;
      } catch {
        text = null;
      }
      const still =
        text === null
          ? []
          : lineHits(
              filePath,
              text.split("\n").map((t, i) => ({ line: i + 1, text: t }))
            ).filter((h) => h.rule_id === e.rule_or_control);
      const fileRule =
        FILE_RULES.has(e.rule_or_control) ||
        e.rule_or_control.startsWith("VC-EXT") ||
        e.rule_or_control.startsWith("VC-SP");
      checks.push(
        fileRule
          ? {
              check_id: `targeted:${e.finding_id}:rule`,
              kind: "rule-recheck",
              role: "targeted",
              status: "NOT_TESTED",
              detail: `${e.rule_or_control} is a change-level or external finding; a declared reproduction command is the targeted check.`,
              execution_id: null,
              evidence_ids: [],
            }
          : {
              check_id: `targeted:${e.finding_id}:rule`,
              kind: "rule-recheck",
              role: "targeted",
              status: still.length === 0 ? "PASS" : "FAIL",
              detail:
                still.length === 0
                  ? `${e.rule_or_control} no longer matches ${filePath} at the fix commit${lineStr ? ` (was line ${lineStr})` : ""}.`
                  : `${e.rule_or_control} still matches ${filePath} at line(s) ${still.map((h) => h.line).join(", ")}.`,
              execution_id: null,
              evidence_ids: [],
            }
      );
    }
  }

  // Commands --------------------------------------------------------------------------------------------------------
  const ctx = {
    repo: input.repo,
    permission: input.permission,
    policy: input.policy,
    env: input.env,
    sha: input.head,
    log: input.log,
    now: input.now,
  };
  const repro = runCommands(fix?.reproduction ?? [], "targeted", ctx);
  const corpus = reg.regression_corpus.map((c) => c.command);
  const regression = runCommands([...input.policy.required_checks, ...corpus], "regression", ctx);
  executions = [...repro.executions, ...regression.executions];
  checks.push(...repro.checks, ...regression.checks);
  // A change-level finding with no reproduction command cannot be verified.
  for (const c of checks.filter((x) => x.kind === "rule-recheck" && x.status === "NOT_TESTED")) {
    if (repro.checks.some((r) => r.status === "PASS") && !repro.checks.some((r) => r.status !== "PASS")) {
      c.status = "PASS";
      c.detail += " Declared reproduction command(s) passed.";
    }
  }

  // Regression vs baseline ------------------------------------------------------------------------------------------
  const cmp = after.comparison;
  const newCritical = (cmp?.findings_new ?? []).filter((id) => {
    const f = after.findings.find((x) => x.id === id);
    return f !== undefined && (f.severity === "P0" || f.severity === "P1");
  });
  checks.push({
    check_id: "regression:no-new-critical",
    kind: "no-new-critical",
    role: "regression",
    status: newCritical.length === 0 ? "PASS" : "FAIL",
    detail:
      newCritical.length === 0
        ? "No new P0/P1 finding compared with the baseline."
        : `New P0/P1 finding(s): ${newCritical.join(", ")}.`,
    execution_id: null,
    evidence_ids: [afterEvidence],
  });
  const regressed = cmp?.regressed_controls ?? [];
  checks.push({
    check_id: "regression:controls",
    kind: "no-regressed-controls",
    role: "regression",
    status: regressed.length === 0 ? "PASS" : "FAIL",
    detail:
      regressed.length === 0
        ? "No control regressed compared with the baseline."
        : `Regressed control(s): ${regressed.join(", ")}.`,
    execution_id: null,
    evidence_ids: [afterEvidence],
  });
  if (input.policy.required_checks.length === 0 && corpus.length === 0)
    limitations.push(
      "No executable regression suite is declared (policy required_checks / corpus); regression rests on Product Check's re-assessment only."
    );

  const r = run();
  r.after_evidence_ids = [
    afterEvidence,
    ...executions.map((x) => x.evidence_id).filter((x): x is string => x !== null),
  ];
  r.before_evidence_ids = es.flatMap((e) => {
    const f = base.findings.find((x) => x.id === e.source_finding_id);
    return f ? f.evidence_ids : [];
  });
  r.result = overall(checks);
  const failed = checks.filter((c) => c.status === "FAIL");
  const notRun = checks.filter((c) => c.status === "NOT_TESTED" || c.status === "BLOCKED");
  if (failed.length > 0)
    reasons.push(`Failed: ${failed.map((c) => `${c.check_id} — ${c.detail}`).join(" | ")}`);
  if (notRun.length > 0)
    reasons.push(`Not run: ${notRun.map((c) => `${c.check_id} — ${c.detail}`).join(" | ")}`);
  if (r.result === "PASS")
    reasons.push(
      `All ${checks.length} targeted and regression check(s) passed at ${input.head.slice(0, 12)}.`
    );
  r.finished_at = input.now().toISOString();
  r.verification_id = verificationId;
  return r;
}
