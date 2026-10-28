// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The assessment pipeline: Scan (discover PoPs, snapshot source, observe the application) → Test (import executed
 * results and reports) → Validate (evaluate controls, score, decide) → Blueprint (remediation plan and work
 * packets) → Retest (compare with a baseline). The output is one schema-valid results document.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import type { RunPermissions } from "./contract/safety.js";
import { snapshotRepo } from "./discovery/repo.js";
import { buildPops, popCoverage } from "./discovery/pops.js";
import { inputError } from "./errors.js";
import { EvidenceCollector } from "./evidence/collector.js";
import { harToObservations } from "./importers/har.js";
import {
  parseArchitectureCheck,
  parseImpactCheck,
  parseNpmAudit,
  parseOutcomeCheck,
  parseSpecCheck,
} from "./importers/reports.js";
import { parseTestResults, type TestRun } from "./importers/tests.js";
import { probe } from "./inspectors/http/fetch.js";
import type { ObservationSet } from "./inspectors/http/observe.js";
import { deriveFacts, type RepoFacts } from "./inspectors/source/facts.js";
import { deriveSurface } from "./inspectors/source/surface.js";
import { buildBlueprint } from "./blueprint/build.js";
import { buildAsBuiltSpec } from "./spec/build.js";
import { formatErrors, validateAgainst } from "./schema/registry.js";
import { computeScorecard, isOpen } from "./scoring/score.js";
import { computeVerdict } from "./scoring/verdict.js";
import type { Finding, Limitation, PhaseRecord, Results, RunSummary, ScanContract } from "./types.js";
import { PILLARS, SCHEMA_VERSION } from "./types.js";
import { sha256 } from "./util/hash.js";
import { relativize } from "./util/paths.js";
import type { EvalContext, Imported } from "./validation/context.js";
import { evaluateControls } from "./validation/engine.js";
import { applyBaseline } from "./validation/retest.js";
import { appliedTiers, primaryTier } from "./validation/tiers.js";
import { TOOL_VERSION } from "./version.js";

/** Options for one assessment run. */
export interface RunOptions {
  contract: ScanContract;
  permissions: RunPermissions;
  baseline: { results: Results; sha256: string } | null;
  now?: () => Date;
  /** Set when the run was refused by the safety gate: produces an ABORTED record without inspecting anything. */
  abortReason?: string;
  /** Directory that paths in the results are made relative to (normally the working directory). */
  baseDir?: string;
}

/** The results plus the live observations (so the CLI can record them). */
export interface RunOutput {
  results: Results;
  observations: ObservationSet | null;
}

/** Reads a file for import, mapping failures to input errors. */
function readInput(path: string): { text: string; sha: string } {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw inputError(`Cannot read input file: ${path}`);
  }
  if (bytes.length > 100 * 1024 * 1024) throw inputError(`Input file larger than 100 MiB: ${path}`);
  return { text: bytes.toString("utf8"), sha: sha256(bytes) };
}

/** Parses a JSON input file. */
function readJson(path: string): { data: unknown; sha: string } {
  const { text, sha } = readInput(path);
  try {
    return { data: JSON.parse(text) as unknown, sha };
  } catch {
    throw inputError(`Not valid JSON: ${path}`);
  }
}

/** Imports one optional JSON report through a parser; `label` is the portable (relative) path. */
function importReport<T>(
  path: string | null,
  label: (p: string) => string,
  parse: (data: unknown, source: string) => T
): Imported<T> | null {
  if (path === null) return null;
  const { data, sha } = readJson(path);
  return { data: parse(data, label(path)), source: label(path), sha256: sha };
}

/** Run ID: UTC timestamp plus a short hash of the contract and start time. */
export function makeRunId(started: Date, contract: ScanContract): string {
  const stamp = started
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `PCR-${stamp}-${sha256(`${JSON.stringify(contract)}|${started.toISOString()}`)
    .slice(0, 6)
    .toUpperCase()}`;
}

/** Runs one assessment. */
export async function runAssessment(options: RunOptions): Promise<RunOutput> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const startedIso = started.toISOString();
  const contract = options.contract;
  const baseDir = options.baseDir ?? process.cwd();
  const label = (p: string): string => {
    const rel = relative(baseDir, p);
    return rel === "" ? "." : !isAbsolute(rel) && !rel.startsWith("..") ? rel.split(sep).join("/") : p;
  };
  const portableContract = relativize(contract, baseDir);
  const runId = makeRunId(started, portableContract);
  const ev = new EvidenceCollector(runId, startedIso);
  const errors: string[] = [];
  const limitations: Limitation[] = [];
  const phases: PhaseRecord[] = [];
  const aborted = options.abortReason !== undefined;
  if (aborted) errors.push(`Aborted before inspection: ${options.abortReason ?? ""}`);

  // ------------------------------------------------------------------ SCAN
  const mode = contract.mode;
  const useRepo =
    !aborted &&
    contract.target.repository !== null &&
    mode !== "APPLICATION" &&
    contract.authorization.authorized_actions.includes("read-local-source");
  let repo: RepoFacts | null = null;
  if (useRepo && contract.target.repository) {
    repo = deriveFacts(
      snapshotRepo(contract.target.repository.path, contract.constraints.max_files, contract.target.name)
    );
    limitations.push(...repo.snapshot.limitations);
  } else if (contract.target.repository && !aborted) {
    limitations.push({
      code: "repository-not-used",
      message:
        mode === "APPLICATION"
          ? "APPLICATION mode: the repository was not inspected."
          : "read-local-source is not authorized: the repository was not inspected.",
      count: 1,
      paths: [],
    });
  }

  let app: ObservationSet | null = null;
  let appBlockedReason = options.permissions.appBlockedReason;
  let requests = 0;
  const useApp = !aborted && contract.target.application !== null && mode !== "SOURCE";
  if (contract.target.application && mode === "SOURCE")
    appBlockedReason = "SOURCE mode selected: the application was not inspected.";
  if (useApp && contract.target.application) {
    const origin = new URL(contract.target.application.url).origin;
    if (contract.imports.observations !== null) {
      const { data } = readJson(contract.imports.observations);
      const problems = validateAgainst("observations.schema.json", data);
      if (problems.length > 0)
        throw inputError(
          `Invalid observations file ${contract.imports.observations}:\n${formatErrors(problems)}`
        );
      app = {
        ...(data as ObservationSet),
        source: (data as ObservationSet).source === "live" ? "recorded" : (data as ObservationSet).source,
      };
      if (app.origin !== origin)
        throw inputError(`Observations are for ${app.origin}, but the target is ${origin}.`);
    } else if (contract.imports.har !== null) {
      app = harToObservations(readJson(contract.imports.har).data, origin, label(contract.imports.har));
      if (!app.observations.some((o) => o.purpose === "landing"))
        limitations.push({
          code: "har-no-landing",
          message: `The HAR file has no HTML document for ${origin}/.`,
          count: 1,
          paths: [],
        });
    } else if (options.permissions.network) {
      const result = await probe({
        url: contract.target.application.url,
        maxRequests: contract.constraints.max_requests,
        timeoutMs: contract.constraints.request_timeout_ms,
        exposureProbe: options.permissions.exposureProbe,
        now,
      });
      requests = result.requests;
      app = {
        schema_version: SCHEMA_VERSION,
        kind: "observations",
        origin,
        source: "live",
        observations: result.observations,
      };
      if (result.skipped.length > 0)
        limitations.push({
          code: "request-budget",
          message: "The request budget was reached; some passive checks were skipped.",
          count: result.skipped.length,
          paths: result.skipped.slice(0, 10),
        });
      const failures = result.observations.filter((o) => o.error !== null);
      for (const f of failures) errors.push(`${f.purpose} ${f.url}: ${f.error ?? ""}`);
    }
  }
  phases.push({
    phase: "SCAN",
    status: aborted
      ? "FAILED"
      : (contract.target.repository && !repo && mode !== "APPLICATION") ||
          (useApp && (!app || app.observations.every((o) => o.status === null)))
        ? "PARTIAL"
        : "COMPLETED",
    notes: [
      repo ? `${repo.snapshot.files.length} files inventoried` : "no source inspected",
      app
        ? `${app.observations.length} application observation(s) (${app.source})`
        : "no application observed",
    ],
  });

  // ------------------------------------------------------------------ TEST (imports)
  const tests: TestRun[] = [];
  if (!aborted) {
    for (const path of contract.imports.test_results) {
      const { text, sha } = readInput(path);
      tests.push(parseTestResults(text, label(path), sha));
    }
  }
  const audit = aborted ? null : importReport(contract.imports.npm_audit, label, parseNpmAudit);
  const spec = aborted ? null : importReport(contract.imports.spec_check, label, parseSpecCheck);
  const impact = aborted ? null : importReport(contract.imports.impact_check, label, parseImpactCheck);
  const outcome = aborted ? null : importReport(contract.imports.outcome_check, label, parseOutcomeCheck);
  const architecture = aborted
    ? null
    : importReport(contract.imports.architecture_check, label, parseArchitectureCheck);
  phases.push({
    phase: "TEST",
    status: aborted ? "SKIPPED" : "COMPLETED",
    notes: [
      app ? "passive application checks evaluated from observations" : "no application checks",
      `${tests.length} test results file(s) imported (${tests.reduce((n, t) => n + t.cases.length, 0)} cases); Product Check executes no repository code`,
      ...[
        audit && "npm audit imported",
        spec && "Spec Check report imported",
        impact && "Impact Check report imported",
        outcome && "Outcome Check report imported",
        architecture && "Architecture Check report imported",
      ].filter((x): x is string => typeof x === "string"),
    ],
  });

  // ------------------------------------------------------------------ VALIDATE
  const tier = primaryTier(contract.lifecycle_stage, contract.tiers);
  const aiInScope =
    contract.product.uses_ai === true ||
    (contract.product.uses_ai !== false && (repo?.aiDeps.length ?? 0) > 0);
  const pops = buildPops({
    contract,
    repo,
    app,
    appBlockedReason: aborted ? `Run aborted: ${options.abortReason ?? ""}` : appBlockedReason,
    testsImported: tests.length,
    auditImported: audit !== null,
    specImported: spec !== null,
    outcomeImported: outcome !== null,
    aiInScope,
    tier,
    now: startedIso,
  });
  const ctx: EvalContext = {
    contract,
    ev,
    repo,
    revision: repo?.snapshot.git.commit ?? null,
    app,
    appBlockedReason,
    exposureAuthorized: options.permissions.exposureProbe,
    tests,
    audit,
    spec,
    impact,
    outcome,
    architecture,
    baseline: options.baseline?.results ?? null,
    aiInScope,
  };
  const popMap = new Map(pops.map((p) => [p.id, p]));
  const evaluation = evaluateControls(ctx, tier, popMap, runId);
  if (aborted) {
    for (const v of evaluation.validations) {
      if (v.status !== "NOT_APPLICABLE") {
        v.status = "BLOCKED";
        v.reason = `Run aborted by the safety gate: ${options.abortReason ?? ""}`;
      }
    }
  }
  let findings: Finding[] = evaluation.findings;
  const validations = evaluation.validations;

  // ------------------------------------------------------------------ RETEST
  let comparison: Results["comparison"] = null;
  if (options.baseline && !aborted) {
    const applied = applyBaseline(
      validations,
      findings,
      options.baseline.results,
      options.baseline.sha256,
      ev,
      runId
    );
    findings = applied.findings;
    comparison = applied.comparison;
    if (options.baseline.results.contract.target.name !== contract.target.name) {
      limitations.push({
        code: "baseline-target-differs",
        message: `The baseline assessed "${options.baseline.results.contract.target.name}", this run "${contract.target.name}".`,
        count: 1,
        paths: [],
      });
    }
  }

  // Risk acceptances (P0 can never be accepted; expired acceptances are ignored).
  const today = startedIso.slice(0, 10);
  const accepted: Results["verdict"]["accepted_risks"] = [];
  const rejected: Results["verdict"]["rejected_acceptances"] = [];
  for (const a of contract.risk_acceptances) {
    const targets = findings.filter(
      (f) =>
        isOpen(f) &&
        ((a.finding_id !== null && f.id === a.finding_id) ||
          (a.control_id !== null && f.control_id === a.control_id))
    );
    if (targets.length === 0)
      rejected.push({ acceptance_id: a.id, reason: "No open finding matches this acceptance." });
    else if (a.expires < today) rejected.push({ acceptance_id: a.id, reason: `Expired on ${a.expires}.` });
    else if (targets.some((f) => f.severity === "P0"))
      rejected.push({ acceptance_id: a.id, reason: "P0 findings cannot be accepted for release." });
    else {
      for (const f of targets) f.status = "ACCEPTED_RISK";
      accepted.push({
        acceptance_id: a.id,
        finding_ids: targets.map((f) => f.id).sort(),
        owner: a.owner,
        expires: a.expires,
      });
    }
  }
  findings.sort(
    (a, b) =>
      ["P0", "P1", "P2", "P3"].indexOf(a.severity) - ["P0", "P1", "P2", "P3"].indexOf(b.severity) ||
      (a.id < b.id ? -1 : 1)
  );

  // ------------------------------------------------------------------ AS-BUILT SPEC (same snapshot, same evidence)
  const asBuilt =
    repo && contract.target.repository
      ? buildAsBuiltSpec({
          contract,
          facts: repo,
          surface: deriveSurface(repo),
          ev,
          repository: label(contract.target.repository.path),
          generatedAt: startedIso,
        })
      : null;

  // ------------------------------------------------------------------ BLUEPRINT
  const blueprint = buildBlueprint({
    contract,
    repo,
    app,
    validations,
    findings,
    ev,
    revision: ctx.revision,
    runId,
    hasBaseline: options.baseline !== null,
    testsImported: tests.length > 0,
    aiInScope,
    asBuilt,
  });

  const previous: RunSummary | null = options.baseline?.results.history.at(-1) ?? null;
  const scorecard = computeScorecard(validations, findings, contract.scoring, previous);
  const finished = now();
  const finishedIso = finished.toISOString();
  const landing = app?.observations.filter((o) => o.purpose === "landing").at(-1) ?? null;
  const targetRevision: Results["run"]["target_revision"] = {
    repository: repo
      ? {
          label: repo.snapshot.label,
          commit: repo.snapshot.git.commit,
          ref: repo.snapshot.git.ref,
          source: repo.snapshot.git.present ? "git metadata read from .git" : "unavailable (no .git)",
        }
      : null,
    application:
      contract.target.application && mode !== "SOURCE"
        ? {
            origin: new URL(contract.target.application.url).origin,
            observed_at: landing?.requested_at ?? null,
            final_status: landing?.status ?? null,
          }
        : null,
  };
  const verdict = computeVerdict(
    scorecard,
    findings,
    validations,
    tier,
    contract.release.approver,
    rejected,
    accepted,
    {
      repository: targetRevision.repository,
      application: targetRevision.application,
      finishedAt: finishedIso,
    }
  );
  if (aborted) verdict.reasons.unshift(`Run aborted by the safety gate: ${options.abortReason ?? ""}`);
  if (comparison && options.baseline) {
    const prevScores = previous?.scores;
    for (const p of PILLARS) {
      const before = prevScores?.[p] ?? null;
      const after = scorecard.pillars[p].score;
      comparison.score_delta[p] = before !== null && after !== null ? after - before : null;
      comparison.coverage_delta[p] =
        Math.round((scorecard.pillars[p].coverage - (previous?.coverage[p] ?? 0)) * 10000) / 10000;
    }
  }
  phases.push({
    phase: "VALIDATE",
    status: aborted ? "SKIPPED" : "COMPLETED",
    notes: [
      `${validations.length} controls evaluated against ${tier}`,
      `${findings.filter(isOpen).length} open finding(s)`,
    ],
  });
  phases.push({
    phase: "BLUEPRINT",
    status: aborted ? "SKIPPED" : "COMPLETED",
    notes: [
      `${blueprint.remediations.length} remediation(s), ${blueprint.work_packets.length} work packet(s)`,
    ],
  });
  phases.push({
    phase: "DASHBOARD",
    status: "SKIPPED",
    notes: ["Rendered on demand from this file (`product-check dashboard`)."],
  });
  phases.push({
    phase: "REMEDIATE",
    status: aborted ? "SKIPPED" : "ADVISORY",
    notes: ["Product Check proposes changes and work packets; it never modifies code."],
  });
  phases.push({
    phase: "RETEST",
    status: comparison ? "COMPLETED" : "SKIPPED",
    notes: [comparison ? `compared with ${comparison.baseline_run_id}` : "no baseline given"],
  });

  // Attach evidence to PoPs and finish.
  const evidence = ev.all();
  for (const p of pops)
    p.evidence_ids = evidence.filter((e) => e.pop === p.id && e.run_id === runId).map((e) => e.id);
  const summary: RunSummary = {
    run_id: runId,
    finished_at: finishedIso,
    revision: repo?.snapshot.git.commit ?? null,
    verdict: verdict.verdict,
    scores: {
      customer: scorecard.pillars.customer.score,
      technology: scorecard.pillars.technology.score,
      trust: scorecard.pillars.trust.score,
    },
    coverage: {
      customer: scorecard.pillars.customer.coverage,
      technology: scorecard.pillars.technology.coverage,
      trust: scorecard.pillars.trust.coverage,
    },
    open_findings: findings.filter(isOpen).length,
  };
  const appFailed =
    useApp && (!app || !app.observations.some((o) => o.purpose === "landing" && o.status !== null));
  const status: Results["run"]["status"] = aborted
    ? "ABORTED"
    : appFailed || limitations.some((l) => l.code === "file-cap") || errors.length > 0
      ? "PARTIAL"
      : "COMPLETED";
  const results: Results = {
    schema_version: SCHEMA_VERSION,
    kind: "product-check-results",
    run: {
      run_id: runId,
      status,
      started_at: startedIso,
      finished_at: finishedIso,
      duration_ms: Math.max(0, finished.getTime() - started.getTime()),
      tool: "product-check",
      tool_version: TOOL_VERSION,
      node_version: process.version,
      methodology: {
        name: "CT3",
        label: "Customer × Technology × Trust",
        relationship: "inspired",
        reference_version: "CLEAR CT v3.1 (unpublished; principles only)",
      },
      mode_requested: mode,
      mode_effective: repo && app ? "HYBRID" : repo ? "SOURCE" : app ? "APPLICATION" : null,
      tier,
      tiers_applied: appliedTiers(tier),
      target_revision: targetRevision,
      phases,
      errors,
      network: { used: requests > 0, requests, origins: requests > 0 && app ? [app.origin] : [] },
      baseline: options.baseline
        ? { run_id: options.baseline.results.run.run_id, sha256: options.baseline.sha256 }
        : null,
      demo: contract.labels.demo,
    },
    contract: portableContract,
    pop_coverage: popCoverage(pops),
    evidence,
    validations,
    findings,
    scorecard,
    blueprint,
    verdict,
    comparison,
    history: [...(options.baseline?.results.history ?? []), summary],
    limitations,
  };
  return { results: relativize(results, baseDir), observations: app && app.source === "live" ? app : null };
}
