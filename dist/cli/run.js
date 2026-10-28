// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Command-line interface: argument parsing (node:util parseArgs), commands, output writing and the mapping of
 * every error to a documented exit code. The CLI never reads a contract from the scanned repository implicitly.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { applyFlags, defaultContract, loadContract, withDefaults } from "../contract/contract.js";
import { decidePermissions } from "../contract/safety.js";
import { buildPops, popCoverage } from "../discovery/pops.js";
import { snapshotRepo } from "../discovery/repo.js";
import { renderDashboard } from "../dashboard/render.js";
import { EvidenceCollector } from "../evidence/collector.js";
import { ExitCode, ProductCheckError, inputError, usageError } from "../errors.js";
import { deriveFacts } from "../inspectors/source/facts.js";
import { deriveSurface } from "../inspectors/source/surface.js";
import { renderBlueprint, renderPacket, renderReport } from "../reporting/markdown.js";
import { renderAsBuiltSpec } from "../reporting/spec-markdown.js";
import { makeRunId, runAssessment } from "../run.js";
import { formatErrors, KIND_SCHEMA, schemaFiles, schemaText, validateAgainst } from "../schema/registry.js";
import { buildAsBuiltSpec, specFromResults } from "../spec/build.js";
import { sha256 } from "../util/hash.js";
import { relativize } from "../util/paths.js";
import { CONTROLS } from "../validation/catalog.js";
import { checkResults } from "../validation/integrity.js";
import { STAGES, TIER_INFO } from "../validation/tiers.js";
import { TOOL_VERSION } from "../version.js";
/** Text printed by `product-check --help`. */
export const HELP = `Product Check ${TOOL_VERSION} — does this software work, can it be trusted, and what needs to improve?
Scan. Validate. Blueprint. Improve.

Usage:
  product-check run [--repo <dir>] [--url <url> --authorize passive-http] [options]
                                       Scan → Test → Validate → Blueprint; writes results, report, blueprint,
                                       work packets and dashboard to --out-dir (default .product-check/)
  product-check retest --baseline <results.json> [same options as run]
                                       Re-run and compare: verified fixes, regressions, trends
  product-check scan [--repo <dir>] [--url <url>]
                                       Discovery only: what could be inspected (no requests, no checks)
  product-check init [--repo <dir>] [--url <url>] [--stage <stage>] [--output <file>]
                                       Write a scan contract to edit (default product-check.contract.json)
  product-check spec --repo <dir> [--contract <file>] [--out-dir <dir>] [--format md|json|both]
                                       Reverse-engineer an as-built spec (Spec Kit spec.md + JSON) from the
                                       repository's structure; nothing is executed
  product-check validate <file>...     Validate artifacts against the schemas (+ integrity for results)
  product-check report <results.json>  Markdown report        product-check blueprint <results.json>
  product-check dashboard <results.json> [--output dashboard.html]
  product-check controls               The control catalog    product-check schema [name]
  product-check --help | --version

Inputs (run/retest):
  --repo <dir>              Local checkout to inspect (read-only; never executes its code)
  --url <url>               Deployed application. Requests need --authorize passive-http
  --authorize <actions>     passive-http (fixed passive GETs to that origin) and/or exposure-probe
                            (GET /.env, /.git/HEAD, ...). Only for targets you own or may test.
  --contract <file>         Scan contract (JSON). Network actions in a contract also need --allow-network
  --stage <stage>           ${STAGES.join(" | ")}
  --mode <mode>             AUTO (default) | SOURCE | APPLICATION | HYBRID
  --test-results <file>     JUnit XML or Jest/Vitest JSON you produced (repeatable)
  --npm-audit <file>        Output of \`npm audit --json\`
  --har <file>              Browser HAR export (offline application evidence)
  --observations <file>     Recorded observations (from --record-observations)
  --spec-check/--impact-check/--outcome-check/--architecture-check <file>
                            Optional Engineering Commons reports
  --openslo <file>          OpenSLO v1 YAML/JSON (SLO, SLI, AlertPolicy; repeatable)
  --alert-rules <file>      Prometheus/Mimir rules, PrometheusRule, or /api/v1/rules JSON (repeatable)
  --service-graph <file>    Jaeger /api/dependencies or traces_service_graph_request_total query JSON
  --baseline <file>         Previous results to compare with (retest)
Output:
  --out-dir <dir>           Default .product-check   --json   Print results JSON to stdout, write nothing
  --record-observations <file>   Save live observations for offline replay
  --fail-on <verdicts>      Exit 6 when the verdict is one of these (e.g. NOT_READY,INCONCLUSIVE)
  --no-dashboard  --no-branding  --quiet

Exit codes: 0 ok · 1 internal error · 2 usage/config · 3 input · 4 safety refusal · 5 invalid artifact · 6 --fail-on matched
Local-first: no telemetry, no account, no model calls. Network only to an authorized origin with passive GETs.
`;
/** Writes a file atomically (temp file + rename), creating the parent directory. */
function writeFile(path, content) {
    if (existsSync(path) && statSync(path).isDirectory())
        throw usageError(`Output path is a directory: ${path}`);
    mkdirSync(dirname(path), { recursive: true });
    const temp = join(dirname(path), `.product-check-${process.pid}-${Date.now()}.tmp`);
    writeFileSync(temp, content, { mode: 0o644 });
    renameSync(temp, path);
}
/** Reads and parses a JSON artifact. */
function readJsonFile(path) {
    let text;
    try {
        text = readFileSync(path, "utf8");
    }
    catch {
        throw inputError(`Cannot read ${path}`);
    }
    try {
        return { data: JSON.parse(text), text };
    }
    catch {
        throw inputError(`Not valid JSON: ${path}`);
    }
}
/** Loads a results file; with `strict`, integrity errors are fatal. */
function loadResults(path, strict, io) {
    const { data, text } = readJsonFile(path);
    const report = checkResults(data);
    if (report.errors.length > 0) {
        if (strict)
            throw usageError(`${path} is not a valid, unmodified Product Check results file:\n${report.errors.join("\n")}`);
        io.stderr(`product-check: warning: ${path} failed integrity checks; output will flag it.\n`);
        if (validateAgainst(KIND_SCHEMA["product-check-results"], data).length > 0)
            throw usageError(`${path} does not match the results schema.`);
    }
    return { results: data, sha: sha256(text) };
}
/** A path relative to cwd when inside it, otherwise absolute. */
function display(cwd, path) {
    const rel = relative(cwd, path);
    return rel === "" ? "." : rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}
/** Splits comma-separated, repeatable flag values. */
const list = (values) => (values ?? [])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
const OPTIONS = {
    repo: { type: "string" },
    url: { type: "string" },
    authorize: { type: "string", multiple: true },
    "allow-network": { type: "boolean" },
    contract: { type: "string" },
    stage: { type: "string" },
    mode: { type: "string" },
    name: { type: "string" },
    "test-results": { type: "string", multiple: true },
    "npm-audit": { type: "string" },
    har: { type: "string" },
    observations: { type: "string" },
    "spec-check": { type: "string" },
    "impact-check": { type: "string" },
    "outcome-check": { type: "string" },
    "architecture-check": { type: "string" },
    openslo: { type: "string", multiple: true },
    "alert-rules": { type: "string", multiple: true },
    "service-graph": { type: "string" },
    baseline: { type: "string" },
    "out-dir": { type: "string" },
    output: { type: "string" },
    format: { type: "string" },
    json: { type: "boolean" },
    "record-observations": { type: "string" },
    "fail-on": { type: "string" },
    "authorized-by": { type: "string" },
    force: { type: "boolean" },
    "no-dashboard": { type: "boolean" },
    "no-branding": { type: "boolean" },
    quiet: { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
};
/** Builds the contract for run/retest/scan/init from --contract and flags. */
function buildContract(values, io) {
    const abs = (p) => (isAbsolute(p) ? p : resolve(io.cwd, p));
    if (values.stage !== undefined && !STAGES.includes(values.stage))
        throw usageError(`--stage must be one of ${STAGES.join(", ")}`);
    if (values.mode !== undefined && !["AUTO", "SOURCE", "APPLICATION", "HYBRID"].includes(values.mode))
        throw usageError("--mode must be AUTO, SOURCE, APPLICATION or HYBRID");
    const authorize = list(values.authorize);
    for (const a of authorize)
        if (!["passive-http", "exposure-probe"].includes(a))
            throw usageError(`--authorize accepts passive-http and exposure-probe, not "${a}".`);
    const fromFile = values.contract !== undefined;
    const base = fromFile ? loadContract(abs(values.contract)) : defaultContract();
    const today = (io.now?.() ?? new Date()).toISOString().slice(0, 10);
    const contract = applyFlags(base, {
        repo: values.repo,
        url: values.url,
        stage: values.stage,
        mode: values.mode,
        name: values.name,
        authorize,
        testResults: values["test-results"],
        npmAudit: values["npm-audit"],
        har: values.har,
        observations: values.observations,
        specCheck: values["spec-check"],
        impactCheck: values["impact-check"],
        outcomeCheck: values["outcome-check"],
        architectureCheck: values["architecture-check"],
        openslo: values.openslo,
        alertRules: values["alert-rules"],
        serviceGraph: values["service-graph"],
    }, io.cwd, today);
    if (values["authorized-by"] !== undefined && contract.authorization.attestation)
        contract.authorization.attestation.authorized_by = values["authorized-by"];
    if (!contract.target.repository && !contract.target.application) {
        throw usageError("Nothing to assess: pass --repo <dir> and/or --url <url> (or a --contract that declares a target).", "Example: product-check run --repo .");
    }
    return { contract, fromFile };
}
/** Writes the as-built spec (JSON + Spec Kit Markdown) carried by a results document, if any. */
function writeSpec(results, dir) {
    const spec = specFromResults(results);
    if (!spec)
        return [];
    writeFile(join(dir, "as-built-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
    writeFile(join(dir, "specs", "000-as-built", "spec.md"), renderAsBuiltSpec(spec));
    return ["as-built-spec.json", "specs/000-as-built/spec.md"];
}
/** Writes all renderings of a results document into a directory. */
function writeOutputs(results, dir, branding, dashboard) {
    const written = [];
    const put = (name, content) => {
        writeFile(join(dir, name), content);
        written.push(name);
    };
    put("product-check-results.json", `${JSON.stringify(results, null, 2)}\n`);
    put("report.md", renderReport(results, { branding }));
    put("blueprint.md", renderBlueprint(results, { branding }));
    for (const p of results.blueprint.work_packets)
        put(`work-packets/${p.id}.md`, renderPacket(results, p));
    written.push(...writeSpec(results, dir));
    if (dashboard)
        put("dashboard.html", renderDashboard(results, { branding }));
    return written;
}
/** run / retest. */
async function commandRun(values, io, retest) {
    if (retest && values.baseline === undefined)
        throw usageError("retest requires --baseline <previous product-check-results.json>.");
    const abs = (p) => (isAbsolute(p) ? p : resolve(io.cwd, p));
    const { contract, fromFile } = buildContract(values, io);
    const baseline = values.baseline !== undefined ? loadResults(abs(values.baseline), true, io) : null;
    const failOn = list(values["fail-on"] === undefined ? undefined : [values["fail-on"]]);
    for (const f of failOn)
        if (!["READY", "READY_WITH_CONDITIONS", "NOT_READY", "INCONCLUSIVE"].includes(f))
            throw usageError(`--fail-on accepts verdict names, not "${f}".`);
    const outDir = abs(values["out-dir"] ?? ".product-check");
    const networkFlag = values["allow-network"] === true || list(values.authorize).length > 0;
    let permissions;
    try {
        permissions = decidePermissions(contract, networkFlag, fromFile);
    }
    catch (error) {
        if (error instanceof ProductCheckError && error.exitCode === ExitCode.Safety && !values.json) {
            const aborted = await runAssessment({
                contract,
                permissions: { network: false, exposureProbe: false, origin: null, appBlockedReason: error.message },
                baseline: null,
                abortReason: error.message,
                baseDir: io.cwd,
                ...(io.now ? { now: io.now } : {}),
            });
            writeFile(join(outDir, "product-check-results.json"), `${JSON.stringify(aborted.results, null, 2)}\n`);
            io.stderr(`product-check: ABORTED record written to ${display(io.cwd, outDir)}/product-check-results.json\n`);
        }
        throw error;
    }
    if (!values.quiet && permissions.network)
        io.stderr(`product-check: sending passive GET requests to ${permissions.origin ?? ""} (authorized)…\n`);
    const { results, observations } = await runAssessment({
        contract,
        permissions,
        baseline: baseline ? { results: baseline.results, sha256: baseline.sha } : null,
        baseDir: io.cwd,
        ...(io.now ? { now: io.now } : {}),
    });
    if (values["record-observations"] !== undefined && observations)
        writeFile(abs(values["record-observations"]), `${JSON.stringify(observations, null, 2)}\n`);
    if (values.json)
        io.stdout(`${JSON.stringify(results, null, 2)}\n`);
    else {
        const written = writeOutputs(results, outDir, !values["no-branding"], !values["no-dashboard"]);
        if (!values.quiet)
            io.stdout(summary(results, display(io.cwd, outDir), written));
    }
    return failOn.includes(results.verdict.verdict) ? ExitCode.Gate : ExitCode.Ok;
}
/** Human summary printed after a run. */
function summary(r, dir, written) {
    const s = r.scorecard.pillars;
    const fmt = (p) => `${s[p].score === null ? "not scored" : `${s[p].score}/100`} (coverage ${Math.round(s[p].coverage * 100)}%, confidence ${s[p].confidence})`;
    const o = r.scorecard.open_findings;
    return [
        `Product Check ${r.run.run_id} — ${r.run.status}${r.run.demo ? " (DEMO DATA)" : ""}`,
        `Verdict: ${r.verdict.verdict} at ${r.verdict.tier} ("${r.verdict.tier_alias}")`,
        ...r.verdict.reasons.map((x) => `  - ${x}`),
        `Customer   ${fmt("customer")}`,
        `Technology ${fmt("technology")}`,
        `Trust      ${fmt("trust")}`,
        `Open findings: P0 ${o.P0}, P1 ${o.P1}, P2 ${o.P2}, P3 ${o.P3} · work packets ${r.blueprint.work_packets.length}`,
        ...(r.comparison
            ? [
                `Retest vs ${r.comparison.baseline_run_id}: ${r.comparison.findings_resolved.length} verified fixed, ${r.comparison.findings_new.length} new, ${r.comparison.findings_reopened.length} reopened, ${r.comparison.regressed_controls.length} regressed control(s)`,
            ]
            : []),
        `Wrote ${dir}/: ${written.filter((w) => !w.startsWith("work-packets/")).join(", ")}${written.some((w) => w.startsWith("work-packets/")) ? `, work-packets/ (${written.filter((w) => w.startsWith("work-packets/")).length})` : ""}`,
        "",
    ].join("\n");
}
/** scan: discovery only. */
function commandScan(values, io) {
    const { contract } = buildContract(values, io);
    const repo = contract.target.repository
        ? deriveFacts(snapshotRepo(contract.target.repository.path, contract.constraints.max_files, contract.target.name))
        : null;
    const tier = contract.tiers?.at(-1) ?? (contract.lifecycle_stage === "DISCOVERY_BUILD" ? "CT-T0" : "CT-T1");
    const pops = buildPops({
        contract,
        repo,
        app: null,
        appBlockedReason: contract.target.application
            ? "Discovery does not send requests; run with --authorize passive-http to observe it."
            : null,
        testsImported: contract.imports.test_results.length,
        auditImported: contract.imports.npm_audit !== null,
        specImported: contract.imports.spec_check !== null,
        outcomeImported: contract.imports.outcome_check !== null,
        operationalImported: contract.imports.openslo.length > 0 ||
            contract.imports.alert_rules.length > 0 ||
            contract.imports.service_graph !== null,
        aiInScope: contract.product.uses_ai === true || (repo?.aiDeps.length ?? 0) > 0,
        tier,
        now: (io.now?.() ?? new Date()).toISOString(),
    });
    const coverage = relativize(popCoverage(pops), io.cwd);
    if (values.json || values.format === "json") {
        io.stdout(`${JSON.stringify(coverage, null, 2)}\n`);
        return ExitCode.Ok;
    }
    const mode = repo && contract.target.application ? "HYBRID (source + application)" : repo ? "SOURCE" : "APPLICATION";
    const lines = [`Discovery for ${contract.target.name} (no requests sent, no checks run)`, ""];
    for (const p of coverage.pops)
        lines.push(`  ${p.status.padEnd(15)} ${p.name}${p.limitations[0] ? ` — ${p.limitations[0]}` : ""}`);
    lines.push("", `Recommended mode: ${mode}.`);
    if (repo)
        lines.push(`Detected: ${[...repo.frameworks, ...repo.dbDeps, ...repo.authDeps, ...repo.aiDeps].join(", ") || "no known frameworks"}; ${repo.testFiles.length} test file(s); ${repo.ciFiles.length} CI file(s).`);
    if (contract.target.application)
        lines.push(`To observe ${new URL(contract.target.application.url).origin}: add --authorize passive-http (only for targets you own or may test).`);
    if (repo && repo.testFiles.length > 0)
        lines.push("To use your tests as evidence: run them with a JUnit reporter and pass --test-results <file>.");
    lines.push("Next: product-check run " +
        [
            contract.target.repository ? "--repo <dir>" : "",
            contract.target.application ? "--url <url> --authorize passive-http" : "",
        ]
            .filter(Boolean)
            .join(" "), "");
    io.stdout(lines.join("\n"));
    return ExitCode.Ok;
}
/** spec: reverse-engineer an as-built specification from the repository (source only, no requests). */
function commandSpec(values, io) {
    const { contract } = buildContract(values, io);
    if (!contract.target.repository)
        throw usageError("spec reads a repository: pass --repo <dir>.", "Example: product-check spec --repo .");
    const format = values.format ?? "both";
    if (!["md", "json", "both"].includes(format))
        throw usageError("--format must be md, json or both.");
    const repoPath = contract.target.repository.path;
    const facts = deriveFacts(snapshotRepo(repoPath, contract.constraints.max_files, contract.target.name));
    const started = io.now?.() ?? new Date();
    const now = started.toISOString();
    const ev = new EvidenceCollector(makeRunId(started, relativize(contract, io.cwd)), now);
    const spec = buildAsBuiltSpec({
        contract,
        facts,
        surface: deriveSurface(facts),
        ev,
        repository: display(io.cwd, repoPath),
        generatedAt: now,
    });
    if (values.json) {
        io.stdout(`${JSON.stringify(spec, null, 2)}\n`);
        return ExitCode.Ok;
    }
    const outDir = isAbsolute(values["out-dir"] ?? "")
        ? values["out-dir"]
        : resolve(io.cwd, values["out-dir"] ?? ".product-check");
    const written = [];
    if (format !== "md") {
        writeFile(join(outDir, "as-built-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
        written.push("as-built-spec.json");
    }
    if (format !== "json") {
        writeFile(join(outDir, "specs", "000-as-built", "spec.md"), renderAsBuiltSpec(spec));
        written.push("specs/000-as-built/spec.md");
    }
    if (!values.quiet) {
        const count = (k) => spec.surface.filter((s) => s.kind === k).length;
        io.stdout([
            `As-built spec for ${contract.target.name} (source only; nothing executed, no requests sent)`,
            `  ${count("page")} page(s), ${count("endpoint")} endpoint(s), ${count("entity")} entit(y/ies), ${count("integration")} integration(s), ${count("config")} config name(s), ${count("test")} test title(s)`,
            `  ${spec.requirements.length} functional requirement(s), ${spec.non_functional.length} non-functional, ${spec.clarifications.length} clarification(s) for a person to answer`,
            `Wrote ${display(io.cwd, outDir)}/: ${written.join(", ")}`,
            format !== "json"
                ? `Next: answer the NEEDS CLARIFICATION markers, then lint it: spec-check check ${display(io.cwd, join(outDir, "specs", "000-as-built", "spec.md"))}`
                : "",
            "",
        ]
            .filter((l, i, a) => l !== "" || i === a.length - 1)
            .join("\n"));
    }
    return ExitCode.Ok;
}
/** init: write a contract. */
function commandInit(values, io) {
    const out = isAbsolute(values.output ?? "")
        ? values.output
        : resolve(io.cwd, values.output ?? "product-check.contract.json");
    if (existsSync(out) && !values.force)
        throw usageError(`${out} exists; pass --force to overwrite.`);
    const flags = { ...values };
    delete flags.contract;
    const { contract } = buildContract(flags, io);
    const portable = relativize(contract, dirname(out));
    if (portable.target.repository && portable.target.repository.path === "")
        portable.target.repository.path = ".";
    writeFile(out, `${JSON.stringify(portable, null, 2)}\n`);
    io.stdout([
        `Wrote ${display(io.cwd, out)}. Edit it to declare: product.multi_tenant, handles_personal_data, uses_ai; critical_journeys; control_mappings (link your executed tests to controls); risk_acceptances.`,
        contract.target.application && !contract.authorization.authorized_actions.includes("passive-http")
            ? 'The application URL is declared but requests are NOT authorized. If you own or may test it, add "passive-http" to authorization.authorized_actions and fill authorization.attestation, then run with --allow-network.'
            : "",
        `Run: product-check run --contract ${display(io.cwd, out)}${contract.authorization.authorized_actions.includes("passive-http") ? " --allow-network" : ""}`,
        "",
    ]
        .filter(Boolean)
        .join("\n"));
    return ExitCode.Ok;
}
/** validate: schema (+ integrity for results). */
function commandValidate(files, io) {
    if (files.length === 0)
        throw usageError("validate needs at least one file.");
    let bad = 0;
    for (const file of files) {
        const path = isAbsolute(file) ? file : resolve(io.cwd, file);
        const { data } = readJsonFile(path);
        const kind = data !== null && typeof data === "object" && "kind" in data
            ? String(data.kind)
            : "";
        const schema = KIND_SCHEMA[kind];
        if (!schema) {
            io.stdout(`INVALID ${file}: unknown or missing "kind" (expected one of ${Object.keys(KIND_SCHEMA).join(", ")})\n`);
            bad++;
            continue;
        }
        if (kind === "product-check-results") {
            const report = checkResults(data);
            for (const w of report.warnings)
                io.stderr(`product-check: warning: ${file}: ${w}\n`);
            if (report.errors.length > 0) {
                io.stdout(`INVALID ${file} (${kind}):\n${report.errors.map((e) => `  ${e}`).join("\n")}\n`);
                bad++;
            }
            else
                io.stdout(`OK      ${file} (${kind}: schema, references, scorecard and verdict recompute)\n`);
            continue;
        }
        const errors = validateAgainst(schema, kind === "scan-contract" ? withDefaults(data) : data);
        if (errors.length > 0) {
            io.stdout(`INVALID ${file} (${kind}):\n${formatErrors(errors)}\n`);
            bad++;
        }
        else
            io.stdout(`OK      ${file} (${kind}${kind === "scan-contract" ? ", omitted fields take defaults" : ""})\n`);
    }
    return bad > 0 ? ExitCode.Invalid : ExitCode.Ok;
}
/** Parses arguments and runs one command. */
async function main(argv, io) {
    const { values, positionals } = (() => {
        try {
            return parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
        }
        catch (error) {
            throw usageError(error.message, "Run `product-check --help` for usage.");
        }
    })();
    if (values.help) {
        io.stdout(HELP);
        return ExitCode.Ok;
    }
    if (values.version) {
        io.stdout(`${TOOL_VERSION}\n`);
        return ExitCode.Ok;
    }
    const [command, ...rest] = positionals;
    if (command === undefined) {
        io.stderr(HELP);
        return ExitCode.Usage;
    }
    const abs = (p) => (isAbsolute(p) ? p : resolve(io.cwd, p));
    const one = () => {
        if (rest.length !== 1)
            throw usageError(`${command} needs exactly one results file.`);
        return abs(rest[0]);
    };
    const branding = !values["no-branding"];
    switch (command) {
        case "run":
        case "retest":
            if (rest.length > 0)
                throw usageError(`Unexpected argument: ${rest[0]}`);
            return commandRun(values, io, command === "retest");
        case "scan":
            if (rest.length > 0)
                throw usageError(`Unexpected argument: ${rest[0]}`);
            return commandScan(values, io);
        case "spec":
            if (rest.length > 0)
                throw usageError(`Unexpected argument: ${rest[0]}`);
            return commandSpec(values, io);
        case "init":
            return commandInit(values, io);
        case "validate":
            return commandValidate(rest, io);
        case "report": {
            const { results } = loadResults(one(), false, io);
            const text = values.format === "json"
                ? `${JSON.stringify(results, null, 2)}\n`
                : renderReport(results, { branding });
            if (values.output)
                writeFile(abs(values.output), text);
            else
                io.stdout(text);
            return ExitCode.Ok;
        }
        case "blueprint": {
            const { results } = loadResults(one(), false, io);
            if (values["out-dir"]) {
                const dir = abs(values["out-dir"]);
                writeFile(join(dir, "blueprint.json"), `${JSON.stringify(results.blueprint, null, 2)}\n`);
                writeFile(join(dir, "blueprint.md"), renderBlueprint(results, { branding }));
                for (const p of results.blueprint.work_packets)
                    writeFile(join(dir, "work-packets", `${p.id}.md`), renderPacket(results, p));
                const spec = writeSpec(results, dir);
                io.stdout(`Wrote blueprint.json, blueprint.md${spec.length ? ", the as-built spec" : ""} and ${results.blueprint.work_packets.length} work packet(s) to ${display(io.cwd, dir)}\n`);
            }
            else
                io.stdout(values.format === "json"
                    ? `${JSON.stringify(results.blueprint, null, 2)}\n`
                    : renderBlueprint(results, { branding }));
            return ExitCode.Ok;
        }
        case "dashboard": {
            const path = one();
            const { results } = loadResults(path, false, io);
            const out = values.output ? abs(values.output) : join(dirname(path), "dashboard.html");
            writeFile(out, renderDashboard(results, { branding }));
            io.stdout(`Wrote ${display(io.cwd, out)}. Open it in a browser (no server needed).\n`);
            return ExitCode.Ok;
        }
        case "controls": {
            if (values.format === "json")
                io.stdout(`${JSON.stringify(CONTROLS.map(({ remediation: _r, ...c }) => c), null, 2)}\n`);
            else {
                const lines = [
                    "Control catalog (rubric pc-rubric-0.2). Tiers carry forward: a tier applies its own and all earlier controls.",
                    "",
                ];
                for (const c of CONTROLS)
                    lines.push(`${c.id.padEnd(9)} ${c.tier}  ${c.pillar.padEnd(10)} w${c.weight}${c.gate ? ` ${c.gate}` : ""}  ${c.title}`);
                lines.push("", ...Object.entries(TIER_INFO).map(([t, i]) => `${t} ${i.name}: ${i.focus}`), "");
                io.stdout(lines.join("\n"));
            }
            return ExitCode.Ok;
        }
        case "schema": {
            if (rest.length === 0)
                io.stdout(`${schemaFiles().join("\n")}\n`);
            else {
                const name = rest[0].replace(/\.schema\.json$/, "");
                if (!schemaFiles().includes(`${name}.schema.json`))
                    throw usageError(`Unknown schema ${name}. Available: ${schemaFiles().join(", ")}`);
                io.stdout(schemaText(`${name}.schema.json`));
            }
            return ExitCode.Ok;
        }
        default:
            throw usageError(`Unknown command: ${command}`, "Commands: run, retest, scan, spec, init, validate, report, blueprint, dashboard, controls, schema.");
    }
}
/** Runs the CLI and returns the process exit code. Never throws. */
export async function run(argv, io) {
    try {
        return await main(argv, io);
    }
    catch (error) {
        if (error instanceof ProductCheckError) {
            io.stderr(`product-check: ${error.exitCode === ExitCode.Safety ? "refused" : "error"}: ${error.message}\n`);
            if (error.hint)
                io.stderr(`product-check: hint: ${error.hint}\n`);
            return error.exitCode;
        }
        io.stderr(`product-check: internal error: ${error?.message ?? String(error)}\n`);
        return ExitCode.Internal;
    }
}
