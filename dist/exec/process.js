// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The ONLY module in src/ that starts processes (tests enforce this). Two narrow entry points:
 *
 * - `gitRead`: read-only git plumbing (rev-parse, diff, show, status, log, merge-base) with a fixed, hardened
 *   argument prefix: no hooks, no fsmonitor, no external diff or textconv drivers, no pager, no system config, no
 *   prompts. Revisions are validated so a value can never be read as an option.
 * - `execCommand`: runs one operator-declared command (argv, never a shell) for author-side proof (VC-P1) and
 *   closure verification (VC-P5). Callers must have checked that execution was authorized for this invocation
 *   (`--allow-exec`); this module refuses otherwise. The environment is reduced to an allowlist, output is capped,
 *   digested and redacted, and nothing is retried.
 *
 * The scan pipeline (`run`, `retest`, `scan`, `spec`) never calls this module.
 */
import { spawnSync } from "node:child_process";
import { devNull } from "node:os";
import { resolve, sep } from "node:path";
import { safetyError } from "../errors.js";
import { sha256 } from "../util/hash.js";
import { redact } from "../util/redact.js";
import { stableId } from "../util/hash.js";
const GIT_SUBCOMMANDS = new Set(["rev-parse", "diff", "show", "status", "log", "merge-base"]);
const GIT_PREFIX = [
    "-c",
    "core.fsmonitor=false",
    "-c",
    `core.hooksPath=${devNull}`,
    "-c",
    "diff.external=",
    "-c",
    "core.pager=cat",
    "-c",
    "protocol.allow=never",
    "--no-pager",
];
/** Runs a read-only git subcommand in `repo`. */
export function gitRead(repo, args, maxBuffer = 64 * 1024 * 1024) {
    const sub = args[0];
    if (sub === undefined || !GIT_SUBCOMMANDS.has(sub))
        throw safetyError(`git ${sub ?? ""} is not a read-only subcommand.`);
    const extra = sub === "diff" || sub === "show" ? ["--no-ext-diff", "--no-textconv", "--no-color"] : [];
    const r = spawnSync("git", [...GIT_PREFIX, sub, ...extra, ...args.slice(1)], {
        cwd: repo,
        encoding: "utf8",
        maxBuffer,
        shell: false,
        windowsHide: true,
        env: {
            PATH: process.env["PATH"] ?? "",
            HOME: process.env["HOME"] ?? "",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_TERMINAL_PROMPT: "0",
            GIT_OPTIONAL_LOCKS: "0",
            LC_ALL: "C",
        },
    });
    return {
        ok: r.status === 0 && !r.error,
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? r.error?.message ?? "",
    };
}
/** A NOT_TESTED/BLOCKED execution record that ran nothing. */
function notRun(input, status, reason) {
    return {
        execution_id: stableId("EXE", [
            input.spec.id,
            input.spec.argv.join(" "),
            input.commitSha,
            status,
            reason,
        ]),
        command_id: input.spec.id,
        purpose: input.spec.purpose,
        argv: input.spec.argv,
        cwd: input.spec.cwd,
        status,
        exit_code: null,
        signal: null,
        duration_ms: 0,
        started_at: input.now().toISOString(),
        environment_id: input.environmentId,
        commit_sha: input.commitSha,
        stdout_digest: null,
        stderr_digest: null,
        output_bytes: 0,
        output_truncated: false,
        excerpt: null,
        reason,
        evidence_id: null,
    };
}
/** Executes one declared command (argv, no shell). Never throws for command failures. */
export function execCommand(input) {
    const { spec } = input;
    if (!input.permission.allowed)
        return notRun(input, "NOT_TESTED", input.permission.reason);
    if (spec.argv.length === 0 || spec.argv[0] === "")
        return notRun(input, "BLOCKED", "Empty command.");
    const root = resolve(input.repo);
    const cwd = resolve(root, spec.cwd);
    if (cwd !== root && !cwd.startsWith(root + sep))
        return notRun(input, "BLOCKED", `Working directory ${spec.cwd} is outside the repository.`);
    const env = { CI: "1", PRODUCT_CHECK_VERIFY: "1" };
    for (const name of input.envAllowlist) {
        const v = process.env[name];
        if (v !== undefined)
            env[name] = v;
    }
    const started = input.now();
    const t0 = performance.now();
    const r = spawnSync(spec.argv[0], spec.argv.slice(1), {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        timeout: spec.timeout_ms,
        maxBuffer: input.maxOutputBytes,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const duration = Math.round(performance.now() - t0);
    const stdout = r.stdout ?? Buffer.alloc(0);
    const stderr = r.stderr ?? Buffer.alloc(0);
    const err = r.error;
    const truncated = err?.code === "ENOBUFS";
    const timedOut = err?.code === "ETIMEDOUT" || (r.signal === "SIGTERM" && duration >= spec.timeout_ms);
    const spawnFailed = err !== undefined && !truncated && !timedOut;
    const combined = `${stdout.toString("utf8")}\n${stderr.toString("utf8")}`.trim();
    const excerpt = combined ? redact(combined.slice(-400)) : null;
    let status;
    let reason = null;
    if (spawnFailed) {
        status = "BLOCKED";
        reason = `Could not start ${spec.argv[0]}: ${err.code ?? err.message}`;
    }
    else if (timedOut) {
        status = "FAIL";
        reason = `Timed out after ${spec.timeout_ms} ms.`;
    }
    else if (truncated) {
        status = "FAIL";
        reason = `Output exceeded ${input.maxOutputBytes} bytes; the run was stopped.`;
    }
    else
        status = r.status === 0 ? "PASS" : "FAIL";
    return {
        execution_id: stableId("EXE", [
            spec.id,
            spec.argv.join(" "),
            input.commitSha,
            started.toISOString(),
            sha256(stdout),
            sha256(stderr),
        ]),
        command_id: spec.id,
        purpose: spec.purpose,
        argv: spec.argv,
        cwd: spec.cwd,
        status,
        exit_code: r.status,
        signal: r.signal ?? null,
        duration_ms: duration,
        started_at: started.toISOString(),
        environment_id: input.environmentId,
        commit_sha: input.commitSha,
        stdout_digest: sha256(stdout),
        stderr_digest: sha256(stderr),
        output_bytes: stdout.length + stderr.length,
        output_truncated: truncated,
        excerpt,
        reason,
        evidence_id: null,
    };
}
