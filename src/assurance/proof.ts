// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Author-side proof (VC-P1) and the shared command runner for closure verification (VC-P5).
 *
 * Commands come only from the operator's policy (required_checks), from a fix record (reproduction commands the
 * implementer declared) or from the regression corpus. Product Check never invents a command: detected scripts are
 * printed as suggestions to put in the policy, never run. Nothing runs without --allow-exec on that invocation;
 * without it every command is recorded as NOT_TESTED with the reason, and the run is INCONCLUSIVE.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execCommand, type ExecPermission } from "../exec/process.js";
import { stableId } from "../util/hash.js";
import type { EvidenceLog } from "./evidence-log.js";
import {
  ASSURANCE_SCHEMA_VERSION,
  type AssurancePolicy,
  type CommandExecution,
  type CommandSpec,
  type EnvironmentRecord,
  type VerificationCheckResult,
  type VerificationRun,
} from "./types.js";

/** Scripts a repository declares that could serve as checks (suggestions only). */
export function detectCheckSuggestions(
  repo: string
): { id: string; argv: string[]; purpose: CommandSpec["purpose"] }[] {
  const out: { id: string; argv: string[]; purpose: CommandSpec["purpose"] }[] = [];
  const pkg = join(repo, "package.json");
  if (existsSync(pkg)) {
    try {
      const scripts =
        (JSON.parse(readFileSync(pkg, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
      const map: [string, CommandSpec["purpose"]][] = [
        ["typecheck", "typecheck"],
        ["lint", "lint"],
        ["test", "test"],
        ["build", "build"],
      ];
      for (const [name, purpose] of map)
        if (typeof scripts[name] === "string") out.push({ id: name, argv: ["npm", "run", name], purpose });
    } catch {
      /* malformed manifest: no suggestions */
    }
  }
  if (existsSync(join(repo, "pyproject.toml")) || existsSync(join(repo, "pytest.ini")))
    out.push({ id: "pytest", argv: ["python", "-m", "pytest", "-q"], purpose: "test" });
  if (existsSync(join(repo, "go.mod")))
    out.push({ id: "go-test", argv: ["go", "test", "./..."], purpose: "test" });
  if (existsSync(join(repo, "Cargo.toml")))
    out.push({ id: "cargo-test", argv: ["cargo", "test"], purpose: "test" });
  return out;
}

/** Runs commands, records each execution in the evidence log, returns executions and checks. */
export function runCommands(
  specs: CommandSpec[],
  role: VerificationCheckResult["role"],
  ctx: {
    repo: string;
    permission: ExecPermission;
    policy: AssurancePolicy;
    env: EnvironmentRecord;
    sha: string | null;
    log: EvidenceLog;
    now: () => Date;
  }
): { executions: CommandExecution[]; checks: VerificationCheckResult[] } {
  const executions: CommandExecution[] = [];
  const checks: VerificationCheckResult[] = [];
  for (const spec of specs) {
    const ex = execCommand({
      spec,
      repo: ctx.repo,
      permission: ctx.permission,
      envAllowlist: ctx.policy.exec.env_allowlist,
      maxOutputBytes: ctx.policy.exec.max_output_bytes,
      environmentId: ctx.env.environment_id,
      commitSha: ctx.sha,
      now: ctx.now,
    });
    ex.evidence_id = ctx.log.append({
      type: "command-execution",
      subject: spec.id,
      commit_sha: ctx.sha,
      environment_id: ctx.env.environment_id,
      summary: `${spec.argv.join(" ")} → ${ex.status}${ex.exit_code !== null ? ` (exit ${ex.exit_code})` : ""}${ex.reason ? `: ${ex.reason}` : ""}`,
      locator: spec.cwd,
      line: null,
      payload: {
        execution_id: ex.execution_id,
        argv: ex.argv,
        exit_code: ex.exit_code,
        duration_ms: ex.duration_ms,
        stdout_digest: ex.stdout_digest,
        stderr_digest: ex.stderr_digest,
        excerpt: ex.excerpt,
        status: ex.status,
      },
    });
    executions.push(ex);
    checks.push({
      check_id: `${role}:${spec.id}`,
      kind: "command",
      role,
      status: ex.status,
      detail:
        ex.status === "PASS"
          ? `${spec.argv.join(" ")} exited 0 in ${ex.duration_ms} ms.`
          : (ex.reason ?? `${spec.argv.join(" ")} exited ${ex.exit_code ?? "?"}.`),
      execution_id: ex.execution_id,
      evidence_ids: [ex.evidence_id],
    });
  }
  return { executions, checks };
}

/** Overall result from checks: any FAIL → FAIL; anything not run → INCONCLUSIVE; else PASS. */
export function overall(checks: VerificationCheckResult[]): VerificationRun["result"] {
  if (checks.some((c) => c.status === "FAIL" || c.status === "PARTIAL")) return "FAIL";
  if (checks.length === 0 || checks.some((c) => c.status !== "PASS" && c.status !== "NOT_APPLICABLE"))
    return "INCONCLUSIVE";
  return "PASS";
}

/** VC-P1: executes the policy's required checks at the current commit. */
export function authorProof(input: {
  repo: string;
  policy: AssurancePolicy;
  permission: ExecPermission;
  env: EnvironmentRecord;
  sha: string | null;
  clean: boolean | null;
  log: EvidenceLog;
  now: () => Date;
}): VerificationRun {
  const started = input.now().toISOString();
  const { executions, checks } = runCommands(input.policy.required_checks, "regression", { ...input });
  const reasons: string[] = [];
  const limitations: string[] = [];
  if (input.policy.required_checks.length === 0)
    reasons.push("The policy declares no required checks; nothing can be claimed as green.");
  if (!input.permission.allowed) reasons.push(input.permission.reason);
  if (input.clean === false)
    limitations.push(
      "The working tree has uncommitted changes; results describe the worktree, not exactly the commit."
    );
  let result = overall(checks);
  if (input.clean === false && result === "PASS") {
    result = "INCONCLUSIVE";
    reasons.push("Checks passed on a dirty worktree; commit and rerun to bind the proof to an exact commit.");
  }
  const failed = checks.filter((c) => c.status === "FAIL");
  if (failed.length > 0) reasons.push(`Failed: ${failed.map((c) => c.check_id).join(", ")}.`);
  if (result === "PASS")
    reasons.push(`All ${checks.length} required check(s) passed at ${input.sha?.slice(0, 12) ?? "?"}.`);
  return {
    schema_version: ASSURANCE_SCHEMA_VERSION,
    kind: "verification-run",
    verification_id: stableId("PR", [input.sha, started, ...executions.map((e) => e.execution_id)]),
    purpose: "author-proof",
    finding_ids: [],
    fix_id: null,
    exact_sha: input.sha,
    worktree_clean: input.clean,
    environment: input.env,
    started_at: started,
    finished_at: input.now().toISOString(),
    checks,
    executions,
    before_evidence_ids: [],
    after_evidence_ids: executions.map((e) => e.evidence_id).filter((x): x is string => x !== null),
    after_results: null,
    result,
    reasons,
    limitations,
    actor: { id: "product-check", type: "system" },
  };
}
