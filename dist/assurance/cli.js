// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * CLI for the vibe-code review and verified-closure workflow (CT3 v3.2). All state lives in a workspace directory
 * (default .product-check/) next to the scan results:
 *
 *   product-check-results.json  closure-register.json  review-evidence.jsonl  approvals.json  proof-run.json
 *   change-review.json + reviews/  fix-packets/F-*.json  verification/VR-*-results.json  release-gate.json
 *   PRODUCT_CHECK_REVIEW.md  PRODUCT_CHECK_BLUEPRINT.md  PRODUCT_CHECK_RELEASE_GATE.md  dashboard/index.html
 *   human-review/F-*.md
 */
import { chmodSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadContract } from "../contract/contract.js";
import { ExitCode, inputError, ProductCheckError, usageError } from "../errors.js";
import { gitRead } from "../exec/process.js";
import { formatErrors, validateAgainst } from "../schema/registry.js";
import { sha256 } from "../util/hash.js";
import { checkResults } from "../validation/integrity.js";
import { outcomeAdapter, impactAdapter, specAdapter } from "./adapters.js";
import { generateApproverKeys, keyId, signApproval } from "./approvals.js";
import { renderAssuranceDashboard } from "./dashboard.js";
import { parseUnifiedDiff } from "./diff.js";
import { EvidenceLog, readLog, verifyLog } from "./evidence-log.js";
import { buildFixPackets } from "./fix-packets.js";
import { evaluateGate } from "./gate.js";
import { loadPolicy } from "./policy.js";
import { authorProof, detectCheckSuggestions } from "./proof.js";
import { acceptRisk, addApproval, applyVerification, checkRegister, closeFinding, createRegister, expireAcceptances, manualTransition, recordFix, rejectFalsePositive, syncResults, syncReview, } from "./register.js";
import { renderBlueprintMd, renderGateMd, renderHumanPacket, renderReviewMd, withFooter, } from "./render-md.js";
import { commitAuthor, environmentRecord, fileAt, resolveSha, worktreeState } from "./repo-state.js";
import { reviewChange, worktreeText } from "./review.js";
import { readJson, readJsonIfExists, writeJson, writeText } from "./util.js";
import { verifyFindings } from "./verify.js";
export const ASSURANCE_COMMANDS = [
    "proof",
    "review",
    "register",
    "transition",
    "fix",
    "verify",
    "keygen",
    "approve",
    "close",
    "accept-risk",
    "reject",
    "learn",
    "fix-packets",
    "gate",
    "assure",
];
export const ASSURANCE_HELP = `Vibe-code review and verified closure (CT3 v3.2). Workspace: --workspace <dir> (default .product-check)
  product-check run --repo . --out-dir .product-check        VC-P0 baseline scan (unchanged; never executes code)
  product-check proof --repo . --policy <p.json> [--allow-exec]
                                       VC-P1 author-side proof: runs the policy's required checks at HEAD
  product-check review --repo . --base <rev> [--head <rev>] [--change <ref>] [--policy <p.json>]
        [--impact-check f] [--spec-check f] [--outcome-check f] [--reviewer-findings f] [--diff f]
                                       VC-P2/P3 layered change review, independent verification, risk routing
  product-check register [--results f] [--repo .]           create/sync the closure register (VC-P2 verification)
  product-check transition --finding F-001 --to ACKNOWLEDGED|IN_PROGRESS|DEFERRED|OPEN --reason "…" --actor <id>
  product-check fix --finding F-001 --sha <commit> --actor <id> [--actor-type agent|human] [--repro-cmd "…"]
                                       record a proposed fix → RETEST_REQUIRED (never fixed by itself)
  product-check verify --finding F-001 --head <sha> [--allow-exec] [--policy p] [--contract c] [--test-results f]
                                       VC-P5 targeted + regression verification at the exact fix commit
  product-check keygen --approver <id> --out-dir <dir>      Ed25519 key pair for a human approver
  product-check approve --scope change:<ref>|closure:F-001|risk-acceptance:F-001|false-positive:F-001|continue:F-001|release:<name>
        --sha <commit> --approver <id> --key <private.pem> [--decision approve|reject] [--comment "…"]
  product-check close --finding F-001 --evidence VR-001 --approver <id> --policy <p.json>
  product-check accept-risk --finding F-002 --owner <id> --risk-scope "…" --rationale "…" --compensating "…"
        --review-date YYYY-MM-DD --expires YYYY-MM-DD --closure-condition "…" --policy <p.json>
  product-check reject --finding F-003 --reason "…" --actor <id> [--policy p]   false positive
  product-check learn --finding F-001 --cmd "node --test test/x.test.mjs" --origin escaped-incident|regressed-finding|verified-fix
  product-check fix-packets | gate | assure  [--from <results.json>] [--policy p] [--fail-on NO_GO,UNKNOWN]
  product-check dashboard --from <results.json>  ·  product-check blueprint --from <results.json>
Commands run only with --allow-exec, only from the policy/fix/corpus, as argv without a shell.`;
const OPTIONS = {
    workspace: { type: "string" },
    repo: { type: "string" },
    results: { type: "string" },
    from: { type: "string" },
    policy: { type: "string" },
    "allow-exec": { type: "boolean" },
    base: { type: "string" },
    head: { type: "string" },
    diff: { type: "string" },
    change: { type: "string" },
    author: { type: "string" },
    "impact-check": { type: "string" },
    "spec-check": { type: "string" },
    "outcome-check": { type: "string" },
    "reviewer-findings": { type: "string" },
    previous: { type: "string" },
    finding: { type: "string", multiple: true },
    to: { type: "string" },
    reason: { type: "string" },
    actor: { type: "string" },
    "actor-type": { type: "string" },
    owner: { type: "string" },
    revisit: { type: "string" },
    sha: { type: "string" },
    "repro-cmd": { type: "string", multiple: true },
    contract: { type: "string" },
    "test-results": { type: "string", multiple: true },
    approver: { type: "string" },
    "out-dir": { type: "string" },
    scope: { type: "string" },
    key: { type: "string" },
    decision: { type: "string" },
    comment: { type: "string" },
    evidence: { type: "string" },
    "risk-scope": { type: "string" },
    rationale: { type: "string" },
    compensating: { type: "string", multiple: true },
    "review-date": { type: "string" },
    expires: { type: "string" },
    "closure-condition": { type: "string" },
    cmd: { type: "string" },
    origin: { type: "string" },
    description: { type: "string" },
    "fail-on": { type: "string" },
    json: { type: "boolean" },
    quiet: { type: "boolean" },
    "no-branding": { type: "boolean" },
    output: { type: "string" },
};
/** Splits a command string into argv (quotes respected; no shell expansion of any kind). */
export function splitCommand(text) {
    const out = [];
    let cur = "";
    let quote = null;
    let has = false;
    for (const ch of text) {
        if (quote) {
            if (ch === quote)
                quote = null;
            else
                cur += ch;
        }
        else if (ch === '"' || ch === "'") {
            quote = ch;
            has = true;
        }
        else if (/\s/.test(ch)) {
            if (has || cur)
                out.push(cur);
            cur = "";
            has = false;
        }
        else {
            cur += ch;
            has = true;
        }
    }
    if (quote)
        throw usageError(`Unterminated quote in command: ${text}`);
    if (has || cur)
        out.push(cur);
    return out;
}
class Workspace {
    dir;
    constructor(dir) {
        this.dir = dir;
    }
    p(...parts) {
        return join(this.dir, ...parts);
    }
    get registerPath() {
        return this.p("closure-register.json");
    }
    loadRegister(required) {
        const reg = readJsonIfExists(this.registerPath);
        if (!reg) {
            if (required)
                throw usageError(`No closure register in ${this.dir}. Create it: product-check register --results <results.json>`);
            return null;
        }
        const errors = [
            ...validateAgainst("closure-register.schema.json", reg).map((e) => `${e.path}: ${e.message}`),
            ...checkRegister(reg),
        ];
        if (errors.length > 0)
            throw new ProductCheckError(`${this.registerPath} failed its integrity check:\n  ${errors.slice(0, 20).join("\n  ")}`, ExitCode.Invalid);
        return reg;
    }
    saveRegister(reg) {
        const errors = checkRegister(reg);
        if (errors.length > 0)
            throw new Error(`internal: register invariant broken: ${errors.join("; ")}`);
        writeJson(this.registerPath, reg);
    }
    approvals() {
        return readJsonIfExists(this.p("approvals.json")) ?? [];
    }
    saveApprovals(a) {
        writeJson(this.p("approvals.json"), a);
    }
    review() {
        return readJsonIfExists(this.p("change-review.json"));
    }
    reviews() {
        const dir = this.p("reviews");
        if (!existsSync(dir))
            return [];
        return readdirSync(dir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => readJson(join(dir, f)));
    }
    proof() {
        return readJsonIfExists(this.p("proof-run.json"));
    }
}
function loadResults(path) {
    if (!existsSync(path))
        throw usageError(`No results at ${path}. Run the baseline scan first: product-check run --repo . --out-dir .product-check`);
    const raw = readText(path);
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        throw inputError(`Not valid JSON: ${path}`);
    }
    const report = checkResults(data);
    if (report.errors.length > 0)
        throw new ProductCheckError(`${path} is not a valid, unmodified Product Check results file:\n  ${report.errors.slice(0, 10).join("\n  ")}`, ExitCode.Invalid);
    return { results: data, sha: sha256(raw) };
}
/** Runs one assurance command. */
export async function runAssurance(command, argv, io) {
    const { values, positionals } = (() => {
        try {
            return parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
        }
        catch (error) {
            throw usageError(error.message, "Run `product-check --help` for usage.");
        }
    })();
    if (positionals.length > 0)
        throw usageError(`Unexpected argument: ${positionals[0]}`);
    const abs = (p) => (isAbsolute(p) ? p : resolve(io.cwd, p));
    const now = () => io.now?.() ?? new Date();
    const fromPath = values.from ?? values.results;
    const ws = new Workspace(abs(values.workspace ?? (fromPath ? dirname(abs(fromPath)) : ".product-check")));
    const resultsPath = fromPath ? abs(fromPath) : ws.p("product-check-results.json");
    const repo = abs(values.repo ?? ".");
    const { policy, digest: policyDigest } = loadPolicy(values.policy ? abs(values.policy) : undefined);
    const log = () => new EvidenceLog(ws.p("review-evidence.jsonl"), now);
    const permission = values["allow-exec"]
        ? { allowed: true, reason: "Authorized for this invocation with --allow-exec." }
        : {
            allowed: false,
            reason: "Execution not authorized: pass --allow-exec to run the declared commands on this machine with your permissions.",
        };
    const actor = (required = true) => {
        if (!values.actor) {
            if (required)
                throw usageError("--actor <id> is required (who is doing this).");
            return { id: "unknown", type: "agent" };
        }
        const t = values["actor-type"] ?? "agent";
        if (t !== "agent" && t !== "human")
            throw usageError("--actor-type must be agent or human.");
        return { id: values.actor, type: t };
    };
    const say = (text) => {
        if (!values.quiet)
            io.stdout(text.endsWith("\n") ? text : `${text}\n`);
    };
    const rel = (p) => {
        const r = relative(io.cwd, p);
        return r && !r.startsWith("..") ? r : p;
    };
    const failOn = (decision) => {
        const list = (values["fail-on"] ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        return list.includes(decision) ? ExitCode.Gate : ExitCode.Ok;
    };
    switch (command) {
        case "keygen": {
            if (!values.approver || !values["out-dir"])
                throw usageError("keygen needs --approver <id> and --out-dir <dir>.");
            const dir = abs(values["out-dir"]);
            const keyPath = join(dir, `${values.approver}.key.pem`);
            if (existsSync(keyPath))
                throw usageError(`${keyPath} exists; refusing to overwrite a private key.`);
            const k = generateApproverKeys();
            writeText(keyPath, k.privateKey);
            chmodSync(keyPath, 0o600);
            writeText(join(dir, `${values.approver}.pub.pem`), k.publicKey);
            say(`Wrote ${rel(keyPath)} (private, keep it to yourself) and ${values.approver}.pub.pem (key id ${keyId(k.publicKey)}).\nAdd to the policy's approvers:\n${JSON.stringify({ id: values.approver, type: "human", roles: [], public_key: k.publicKey }, null, 2)}`);
            return ExitCode.Ok;
        }
        case "proof": {
            const state = worktreeState(repo, ws.dir);
            const env = environmentRecord(repo);
            const run = authorProof({
                repo,
                policy,
                permission,
                env,
                sha: state.head,
                clean: state.clean,
                log: log(),
                now,
            });
            writeJson(ws.p("proof-run.json"), run);
            const suggestions = detectCheckSuggestions(repo).filter((s) => !policy.required_checks.some((c) => c.argv.join(" ") === s.argv.join(" ")));
            say([
                `Author-side proof ${run.verification_id}: ${run.result} at ${state.head?.slice(0, 12) ?? "unknown commit"}${state.clean === false ? " (dirty worktree)" : ""}`,
                ...run.executions.map((e) => `  ${e.status.padEnd(10)} ${e.argv.join(" ")}${e.exit_code !== null ? ` (exit ${e.exit_code}, ${e.duration_ms} ms)` : ""}${e.reason ? ` — ${e.reason}` : ""}`),
                ...run.reasons.map((r) => `  ${r}`),
                ...(suggestions.length
                    ? [
                        `Detected but not declared (add to the policy's required_checks to run them): ${suggestions.map((s) => s.argv.join(" ")).join("; ")}`,
                    ]
                    : []),
                `Wrote ${rel(ws.p("proof-run.json"))}`,
            ].join("\n"));
            return run.result === "FAIL"
                ? ExitCode.Gate
                : run.result === "PASS"
                    ? ExitCode.Ok
                    : failOn("INCONCLUSIVE");
        }
        case "review": {
            let diffText;
            let base;
            let head;
            let mode;
            let headText;
            if (values.diff) {
                diffText = readText(abs(values.diff));
                mode = "PR_DIFF";
                headText = () => null;
                base = values.base ? resolveSha(repo, values.base) : null;
                head = values.head ? resolveSha(repo, values.head) : null;
            }
            else {
                if (!values.base)
                    throw usageError("review needs --base <rev> (or --diff <file>).", "Example: product-check review --repo . --base origin/main --head HEAD");
                base = resolveSha(repo, values.base);
                if (!base)
                    throw inputError(`Cannot resolve --base ${values.base} in ${repo}.`);
                if (values.head) {
                    head = resolveSha(repo, values.head);
                    if (!head)
                        throw inputError(`Cannot resolve --head ${values.head}.`);
                    const mb = gitRead(repo, ["merge-base", base, head]);
                    const from = mb.ok && mb.stdout.trim() ? mb.stdout.trim() : base;
                    const d = gitRead(repo, ["diff", "-M", "--unified=3", from, head, "--"]);
                    if (!d.ok)
                        throw inputError(`git diff failed: ${d.stderr.trim()}`);
                    diffText = d.stdout;
                    mode = "PR_DIFF";
                    const h = head;
                    headText = (p) => fileAt(repo, h, p);
                }
                else {
                    const d = gitRead(repo, ["diff", "-M", "--unified=3", base, "--"]);
                    if (!d.ok)
                        throw inputError(`git diff failed: ${d.stderr.trim()}`);
                    diffText = d.stdout;
                    mode = "PRE_PR_LOCAL";
                    head = null;
                    headText = worktreeText(repo);
                }
            }
            const files = parseUnifiedDiff(diffText).slice(0, 2000);
            const authorId = values.author ?? (head ? commitAuthor(repo, head) : null);
            const changeRef = values.change ?? (gitRead(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || "HEAD");
            const prevPath = values.previous ? abs(values.previous) : ws.p("change-review.json");
            const prevRaw = readJsonIfExists(prevPath);
            const previous = prevRaw && prevRaw.change_ref === changeRef ? prevRaw : null;
            const baseline = existsSync(resultsPath) ? loadResults(resultsPath) : null;
            const proofRun = ws.proof();
            const review = reviewChange({
                repo,
                targetName: baseline?.results.contract.target.name ?? basename(repo),
                repositoryLabel: rel(repo) || ".",
                mode,
                baseSha: base,
                headSha: head,
                changeRef,
                diffText,
                diffSource: values.diff ? "file" : "git",
                headText,
                policy,
                policyDigest,
                author: { id: authorId, source: values.author ? "flag" : authorId ? "git" : "unknown" },
                impact: values["impact-check"]
                    ? impactAdapter(readJson(abs(values["impact-check"])), values["impact-check"])
                    : null,
                spec: values["spec-check"]
                    ? specAdapter(readJson(abs(values["spec-check"])), values["spec-check"])
                    : null,
                outcome: values["outcome-check"]
                    ? outcomeAdapter(readJson(abs(values["outcome-check"])), values["outcome-check"])
                    : null,
                claims: values["reviewer-findings"] ? loadClaims(abs(values["reviewer-findings"])) : [],
                previous,
                baseline: baseline ? { results: baseline.results, sha256: baseline.sha } : null,
                proofRun,
                approvals: [
                    ...new Map([...ws.approvals(), ...(ws.loadRegister(false)?.approvals ?? [])].map((a) => [a.approval_id, a])).values(),
                ],
                log: log(),
                now: now(),
                files,
            });
            writeJson(ws.p("change-review.json"), review);
            writeJson(ws.p("reviews", `${review.review_id}.json`), review);
            const reg = ws.loadRegister(false);
            let added = [];
            if (reg) {
                added = syncReview(reg, review, now());
                ws.saveRegister(reg);
            }
            if (baseline)
                writeText(ws.p("PRODUCT_CHECK_REVIEW.md"), withFooter(renderReviewMd(review, reg, baseline.results), !values["no-branding"]));
            say([
                `Change review ${review.review_id} (${review.mode}): gate ${review.gate.status}, risk ${review.risk.level}${review.risk.level === "UNDETERMINED" ? " (treated as HIGH)" : ""}, cycle ${review.cycle.number}/${review.cycle.max}`,
                ...review.gate.reasons.map((r) => `  - ${r}`),
                `  ${review.diff.files.length} file(s); ${review.findings.length} finding(s) (${review.findings.filter((f) => f.blocking).length} blocking, ${review.findings.filter((f) => f.verification.state === "NEEDS_HUMAN_TRIAGE").length} for triage), ${review.disproven.length} disproven`,
                ...review.findings
                    .slice(0, 15)
                    .map((f) => `  ${f.severity} ${f.verification.state.padEnd(18)} ${f.rule_id} ${f.location.path}${f.location.line !== null ? `:${f.location.line}` : ""} — ${f.title}`),
                `  Approvals: ${review.approvals.filter((a) => a.status === "VALID").length}/${review.approvals_required.humans} valid (scope change:${review.change_ref})`,
                reg
                    ? `  Register: ${added.length} new entr(y/ies)`
                    : "  No closure register yet; run product-check register to track these findings.",
                `Wrote ${rel(ws.p("change-review.json"))}`,
            ].join("\n"));
            return failOn(review.gate.status);
        }
        case "register": {
            const { results, sha } = loadResults(resultsPath);
            let reg = ws.loadRegister(false);
            let summary;
            if (!reg) {
                reg = createRegister(results, sha, repo, policy, now());
                summary = `Created closure register ${reg.register_id} with ${reg.entries.length} finding(s) from scan ${results.run.run_id}.`;
            }
            else {
                const s = syncResults(reg, results, repo, now());
                summary = `Synced scan ${results.run.run_id}: ${s.added.length} new, ${s.regressed.length} regressed${s.regressed.length ? ` (${s.regressed.join(", ")})` : ""}. Findings that disappeared are not marked fixed: use verify.`;
            }
            const review = ws.review();
            if (review)
                syncReview(reg, review, now());
            const expired = expireAcceptances(reg, now());
            ws.saveRegister(reg);
            const l = log();
            l.append({
                type: "results-artifact",
                subject: reg.register_id,
                commit_sha: results.run.target_revision.repository?.commit ?? null,
                environment_id: null,
                summary: `Register synced with ${results.run.run_id}`,
                locator: rel(resultsPath),
                line: null,
                payload: { results_sha256: sha, entries: reg.entries.length },
            });
            const by = (s) => reg.entries.filter((e) => e.verification.state === s).length;
            say(`${summary}${expired.length ? ` Expired acceptances re-opened: ${expired.join(", ")}.` : ""}\nVerification: ${by("CONFIRMED")} confirmed, ${by("CORROBORATED")} corroborated, ${by("EVIDENCE_COLLECTED")} evidence only, ${by("NEEDS_HUMAN_TRIAGE")} need triage, ${by("SUSPECTED")} suspected.\nWrote ${rel(ws.registerPath)}`);
            return ExitCode.Ok;
        }
        case "transition": {
            const reg = ws.loadRegister(true);
            const id = one(values.finding, "--finding");
            if (!values.to)
                throw usageError("--to is required.");
            const t = manualTransition(reg, id, values.to, actor(), values.reason ?? "", now(), {
                ...(values.owner ? { owner: values.owner } : {}),
                ...(values.revisit ? { revisit: values.revisit } : {}),
            });
            ws.saveRegister(reg);
            say(`${id}: ${t.from} → ${t.to} (seq ${t.seq})`);
            return ExitCode.Ok;
        }
        case "fix": {
            const reg = ws.loadRegister(true);
            const ids = values.finding ?? [];
            const sha = values.sha ? (resolveSha(repo, values.sha) ?? values.sha) : "";
            const who = actor();
            const repro = (values["repro-cmd"] ?? []).map((c, i) => ({
                id: `repro-${i + 1}`,
                argv: splitCommand(c),
                purpose: "reproduction",
                timeout_ms: 600_000,
                cwd: ".",
                source: "fix",
            }));
            const fix = recordFix(reg, ids, sha, who, repro, policy, now());
            ws.saveRegister(reg);
            log().append({
                type: "transition",
                subject: fix.fix_id,
                commit_sha: fix.change_sha,
                environment_id: null,
                summary: `Fix ${fix.fix_id} proposed for ${ids.join(", ")} by ${who.id} (${who.type})`,
                locator: null,
                line: null,
                payload: { fix_id: fix.fix_id, finding_ids: ids, reproduction: repro.map((r) => r.argv) },
            });
            say(`Fix ${fix.fix_id} recorded at ${fix.change_sha.slice(0, 12)} for ${ids.join(", ")}: FIX_PROPOSED → RETEST_REQUIRED. Not fixed until verify passes:\n  product-check verify --finding ${ids.join(" --finding ")} --head ${fix.change_sha}${repro.length || policy.required_checks.length ? " --allow-exec" : ""}`);
            return ExitCode.Ok;
        }
        case "verify": {
            const reg = ws.loadRegister(true);
            const ids = values.finding ?? [];
            if (ids.length === 0)
                throw usageError("verify needs --finding.");
            if (!values.head)
                throw usageError("verify needs --head <sha> (the exact fix commit).");
            const state = worktreeState(repo, ws.dir);
            const wanted = resolveSha(repo, values.head);
            if (!wanted)
                throw inputError(`Cannot resolve --head ${values.head}.`);
            if (state.head !== wanted)
                throw usageError(`The repository HEAD is ${state.head?.slice(0, 12) ?? "unknown"}, not ${wanted.slice(0, 12)}. Check out the fix commit before verifying.`);
            const baseline = loadResults(resultsPath);
            const l = log();
            const run = await verifyFindings({
                register: reg,
                findingIds: ids,
                repo,
                head: wanted,
                clean: state.clean,
                baseline: { results: baseline.results, sha256: baseline.sha },
                contract: values.contract ? loadContract(abs(values.contract)) : null,
                extraTestResults: (values["test-results"] ?? []).map(abs),
                policy,
                permission,
                env: environmentRecord(repo),
                log: l,
                now,
                baseDir: io.cwd,
                writeAfterResults: (id, r) => {
                    const p = ws.p("verification", `${id}-results.json`);
                    writeJson(p, r);
                    return rel(p);
                },
            });
            l.append({
                type: "verification",
                subject: run.verification_id,
                commit_sha: run.exact_sha,
                environment_id: run.environment.environment_id,
                summary: `${run.verification_id} ${run.result} for ${ids.join(", ")}`,
                locator: null,
                line: null,
                payload: {
                    result: run.result,
                    checks: run.checks.map((c) => ({ id: c.check_id, status: c.status })),
                },
            });
            const out = applyVerification(reg, run, now(), policyDigest ? policy.review.max_cycles : reg.settings.max_cycles);
            ws.saveRegister(reg);
            for (const id of out.escalated) {
                const e = reg.entries.find((x) => x.finding_id === id);
                if (e)
                    writeText(ws.p("human-review", `${id}.md`), withFooter(renderHumanPacket(e, reg), !values["no-branding"]));
            }
            say([
                `Verification ${run.verification_id}: ${run.result} at ${wanted.slice(0, 12)}`,
                ...run.checks.map((c) => `  ${c.status.padEnd(12)} ${c.check_id} — ${c.detail}`),
                ...(run.result === "PASS" ? [] : run.reasons.map((x) => `  reason: ${x}`)),
                ...run.limitations.map((x) => `  note: ${x}`),
                out.verified.length
                    ? `VERIFIED_FIXED: ${out.verified.join(", ")} (close needs signed human approval)`
                    : "",
                out.failed.length ? `Back to IN_PROGRESS: ${out.failed.join(", ")}` : "",
                out.escalated.length
                    ? `ESCALATED (cycle limit): ${out.escalated.join(", ")}; human review packet in ${rel(ws.p("human-review"))}`
                    : "",
                out.unchanged.length ? `Unchanged (inconclusive): ${out.unchanged.join(", ")}` : "",
            ]
                .filter(Boolean)
                .join("\n"));
            return run.result === "PASS" ? ExitCode.Ok : ExitCode.Gate;
        }
        case "approve": {
            if (!values.scope || !values.sha || !values.approver)
                throw usageError("approve needs --scope <type:ref>, --sha <commit> and --approver <id>.");
            if (!values.key)
                throw usageError("approve needs --key <private.pem>: a typed name is not an approval.", "Create a key with product-check keygen and register its public key in the policy.");
            const m = /^(change|closure|risk-acceptance|false-positive|release|continue):(.+)$/.exec(values.scope);
            if (!m)
                throw usageError("--scope must be change:<ref>, closure:<F-id>, risk-acceptance:<F-id>, false-positive:<F-id>, continue:<F-id> or release:<name>.");
            const decision = values.decision ?? "approve";
            if (decision !== "approve" && decision !== "reject")
                throw usageError("--decision must be approve or reject.");
            const sha = resolveSha(repo, values.sha) ?? values.sha;
            const approver = policy.approvers.find((a) => a.id === values.approver);
            const a = signApproval({
                approver: { id: values.approver, type: approver?.type === "bot" ? "bot" : "human" },
                scope: { type: m[1], ref: m[2] },
                reviewed_sha: sha,
                decision,
                comment: values.comment ?? "",
                created_at: now().toISOString(),
            }, readText(abs(values.key)));
            const all = ws.approvals();
            if (!all.some((x) => x.approval_id === a.approval_id))
                all.push(a);
            ws.saveApprovals(all);
            const reg = ws.loadRegister(false);
            if (reg) {
                addApproval(reg, a);
                ws.saveRegister(reg);
            }
            log().append({
                type: "approval",
                subject: a.approval_id,
                commit_sha: sha,
                environment_id: null,
                summary: `${a.approver.id} ${decision} ${values.scope}`,
                locator: null,
                line: null,
                payload: { approval_id: a.approval_id, scope: a.scope, key_id: a.signature?.key_id ?? null },
            });
            say(`Signed ${decision} ${a.approval_id} by ${a.approver.id} for ${values.scope} at ${sha.slice(0, 12)}${approver ? "" : " (WARNING: approver not in the policy; it will not count)"}.`);
            return ExitCode.Ok;
        }
        case "close": {
            const reg = ws.loadRegister(true);
            const id = one(values.finding, "--finding");
            if (!values.evidence || !values.approver)
                throw usageError("close needs --evidence <VR-id> and --approver <id> (the accountable human closing it).");
            if (!values.policy)
                throw usageError("close needs --policy <p.json> to verify approver signatures.");
            const e = closeFinding(reg, id, values.evidence, values.approver, policy, now());
            ws.saveRegister(reg);
            log().append({
                type: "transition",
                subject: id,
                commit_sha: reg.verification_runs.find((r) => r.verification_id === values.evidence)?.exact_sha ?? null,
                environment_id: null,
                summary: `${id} CLOSED as ${e.closure?.closure_id}`,
                locator: null,
                line: null,
                payload: { closure: e.closure },
            });
            say(`${id} CLOSED as ${e.closure?.closure_id} by ${values.approver} on ${values.evidence} with approvals ${e.closure?.approval_ids.join(", ")}.`);
            return ExitCode.Ok;
        }
        case "accept-risk": {
            const reg = ws.loadRegister(true);
            const id = one(values.finding, "--finding");
            if (!values.policy)
                throw usageError("accept-risk needs --policy <p.json> to verify approver signatures.");
            const head = values.sha ? resolveSha(repo, values.sha) : resolveSha(repo, "HEAD");
            const acc = acceptRisk(reg, {
                finding_id: id,
                owner: values.owner ?? "",
                scope: values["risk-scope"] ?? "",
                rationale: values.rationale ?? "",
                compensating_controls: values.compensating ?? [],
                review_date: values["review-date"] ?? "",
                expires: values.expires ?? "",
                closure_condition: values["closure-condition"] ?? "",
            }, policy, head, now());
            ws.saveRegister(reg);
            say(`${id} ACCEPTED_RISK as ${acc.acceptance_id} (owner ${acc.owner}, review ${acc.review_date}, expires ${acc.expires}). It stays open in the gate as an accepted risk; it is not fixed.`);
            return ExitCode.Ok;
        }
        case "reject": {
            const reg = ws.loadRegister(true);
            const id = one(values.finding, "--finding");
            rejectFalsePositive(reg, id, values.reason ?? "", actor(), policy, now());
            ws.saveRegister(reg);
            say(`${id} REJECTED_FALSE_POSITIVE.`);
            return ExitCode.Ok;
        }
        case "learn": {
            const reg = ws.loadRegister(true);
            const id = one(values.finding, "--finding");
            if (!reg.entries.some((e) => e.finding_id === id))
                throw usageError(`Unknown finding ${id}.`);
            if (!values.cmd)
                throw usageError('learn needs --cmd "<test command>" (a regression or eval case that reproduces the problem).');
            const origin = values.origin ?? "escaped-incident";
            if (!["escaped-incident", "regressed-finding", "verified-fix"].includes(origin))
                throw usageError("--origin must be escaped-incident, regressed-finding or verified-fix.");
            const caseId = `RC-${String(reg.regression_corpus.length + 1).padStart(3, "0")}`;
            reg.regression_corpus.push({
                case_id: caseId,
                finding_id: id,
                origin: origin,
                description: values.description ?? `Regression case for ${id}`,
                command: {
                    id: caseId,
                    argv: splitCommand(values.cmd),
                    purpose: "regression",
                    timeout_ms: 600_000,
                    cwd: ".",
                    source: "corpus",
                },
                added_at: now().toISOString(),
                added_by: actor(false),
            });
            ws.saveRegister(reg);
            say(`Added ${caseId} to the regression corpus; every future verify runs it.`);
            return ExitCode.Ok;
        }
        case "fix-packets":
        case "gate":
        case "assure":
        case "dashboard":
        case "blueprint": {
            const { results, sha } = loadResults(resultsPath);
            const reg = ws.loadRegister(false);
            const repoState = existsSync(repo)
                ? worktreeState(repo, ws.dir)
                : { head: null, clean: null, dirty: [] };
            const latest = ws.review();
            const review = latest && latest.head_sha !== null && latest.head_sha === repoState.head ? latest : null;
            const relevantReviewIds = ws
                .reviews()
                .filter((x) => x.head_sha !== null && repoState.head !== null && isAncestor(repo, x.head_sha, repoState.head))
                .map((x) => x.review_id);
            const proof = ws.proof();
            if (reg) {
                const expired = expireAcceptances(reg, now());
                if (expired.length)
                    ws.saveRegister(reg);
            }
            const packets = buildFixPackets(reg ?? emptyRegister(results, sha), results, review ? [review] : [], policy);
            const writePackets = () => {
                for (const p of packets)
                    writeJson(ws.p("fix-packets", `${p.finding_ids[0] ?? p.fix_id}.json`), p);
            };
            if (command === "fix-packets") {
                writePackets();
                say(`Wrote ${packets.length} fix packet(s) to ${rel(ws.p("fix-packets"))}${reg ? "" : " (no register yet: run product-check register first for verified packets)"}.`);
                return ExitCode.Ok;
            }
            const gate = evaluateGate({
                results,
                resultsSha: sha,
                register: reg,
                review,
                proof,
                packets,
                approvals: ws.approvals(),
                policy,
                headSha: repoState.head,
                relevantReviewIds,
                now: now(),
            });
            if (latest && !review)
                say(`Note: the latest change review (${latest.review_id}) is for ${latest.head_sha?.slice(0, 12) ?? "the worktree"}, not HEAD; it is not part of this gate.`);
            const writeGate = () => {
                writeJson(ws.p("release-gate.json"), gate);
                writeText(ws.p("PRODUCT_CHECK_RELEASE_GATE.md"), withFooter(renderGateMd(gate), !values["no-branding"]));
            };
            if (command === "gate") {
                writeGate();
                say([
                    `Release gate: ${gate.decision} (product ${gate.product_verdict}, change ${gate.change_gate ?? "—"})`,
                    ...gate.blocking_reasons.map((r) => `  - ${r}`),
                    `Wrote ${rel(ws.p("release-gate.json"))}`,
                ].join("\n"));
                return failOn(gate.decision);
            }
            writePackets();
            writeText(ws.p("PRODUCT_CHECK_BLUEPRINT.md"), withFooter(renderBlueprintMd(results, packets, reg, gate), !values["no-branding"]));
            if (command === "blueprint") {
                say(`Wrote ${rel(ws.p("PRODUCT_CHECK_BLUEPRINT.md"))} and ${packets.length} fix packet(s).`);
                return ExitCode.Ok;
            }
            writeGate();
            writeText(ws.p("PRODUCT_CHECK_REVIEW.md"), withFooter(renderReviewMd(review, reg, results), !values["no-branding"]));
            const bundle = {
                results,
                register: reg,
                review,
                proof,
                packets,
                gate,
                log: readLog(ws.p("review-evidence.jsonl")),
                now: now(),
            };
            const out = values.output ? abs(values.output) : ws.p("dashboard", "index.html");
            writeText(out, renderAssuranceDashboard(bundle, { branding: !values["no-branding"] }));
            for (const e of reg?.entries.filter((x) => x.escalated) ?? [])
                writeText(ws.p("human-review", `${e.finding_id}.md`), withFooter(renderHumanPacket(e, reg), !values["no-branding"]));
            const logErrors = verifyLog(bundle.log);
            say([
                `Release gate: ${gate.decision}`,
                ...gate.blocking_reasons.slice(0, 6).map((r) => `  - ${r}`),
                `Phases: ${gate.phases.map((p) => `${p.phase} ${p.status}`).join(" · ")}`,
                logErrors.length
                    ? `WARNING: evidence log integrity: ${logErrors.join("; ")}`
                    : `Evidence log: ${bundle.log.length} record(s), chain intact.`,
                `Wrote ${rel(ws.dir)}/: PRODUCT_CHECK_REVIEW.md, PRODUCT_CHECK_BLUEPRINT.md, PRODUCT_CHECK_RELEASE_GATE.md, release-gate.json, fix-packets/ (${packets.length}), ${rel(out)}`,
            ].join("\n"));
            return failOn(gate.decision);
        }
        default:
            throw usageError(`Unknown command: ${command}`);
    }
}
function isAncestor(repo, ancestor, head) {
    if (ancestor === head)
        return true;
    if (!/^[0-9a-f]{40,64}$/.test(ancestor) || !/^[0-9a-f]{40,64}$/.test(head))
        return false;
    return gitRead(repo, ["merge-base", "--is-ancestor", ancestor, head]).ok;
}
function one(list, flag) {
    if (!list || list.length !== 1)
        throw usageError(`Exactly one ${flag} is required.`);
    return list[0];
}
function readText(path) {
    try {
        return readFileSync(path, "utf8");
    }
    catch {
        throw inputError(`Cannot read ${path}`);
    }
}
function loadClaims(path) {
    const data = readJson(path);
    const errors = validateAgainst("reviewer-findings.schema.json", data);
    if (errors.length > 0)
        throw usageError(`Invalid reviewer findings ${path}:\n${formatErrors(errors)}`);
    const d = data;
    return d.findings.map((f) => ({
        reviewer: d.reviewer,
        type: d.type,
        path: f.path,
        line: f.line,
        title: f.title,
        severity: f.severity,
        body: f.body,
    }));
}
function emptyRegister(results, sha) {
    return {
        schema_version: "0.1.0",
        kind: "closure-register",
        methodology_version: "CT3 v3.2",
        register_id: "none",
        target: { name: results.contract.target.name, repository: null },
        created_at: "",
        updated_at: "",
        baseline: { run_id: results.run.run_id, results_sha256: sha, baseline_sha: null },
        settings: { max_cycles: 3 },
        entries: [],
        fixes: [],
        verification_runs: [],
        approvals: [],
        risk_acceptances: [],
        regression_corpus: [],
        chain: { length: 0, head_digest: null },
    };
}
