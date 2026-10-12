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
import { ExitCode, ProductCheckError, inputError, usageError } from "../errors.js";
import { deriveFacts } from "../inspectors/source/facts.js";
import { renderBlueprint, renderPacket, renderReport } from "../reporting/markdown.js";
import { runAssessment } from "../run.js";
import { formatErrors, KIND_SCHEMA, schemaFiles, schemaText, validateAgainst } from "../schema/registry.js";
import type { Results, ScanContract, Verdict } from "../types.js";
import { sha256 } from "../util/hash.js";
import { relativize } from "../util/paths.js";
import { CONTROLS } from "../validation/catalog.js";
import { checkResults } from "../validation/integrity.js";
import { STAGES, TIER_INFO } from "../validation/tiers.js";
import { TOOL_VERSION } from "../version.js";

/** I/O seams so the CLI can run in-process in tests. */
export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  now?: () => Date;
}

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
  --spec-check/--impact-check/--outcome-check <file>   Optional Engineering Commons reports
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
function writeFile(path: string, content: string): void {
  if (existsSync(path) && statSync(path).isDirectory())
    throw usageError(`Output path is a directory: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.product-check-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(temp, content, { mode: 0o644 });
  renameSync(temp, path);
}

/** Reads and parses a JSON artifact. */
function readJsonFile(path: string): { data: unknown; text: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw inputError(`Cannot read ${path}`);
  }
  try {
    return { data: JSON.parse(text) as unknown, text };
  } catch {
    throw inputError(`Not valid JSON: ${path}`);
  }
}

/** Loads a results file; with `strict`, integrity errors are fatal. */
function loadResults(path: string, strict: boolean, io: CliIO): { results: Results; sha: string } {
  const { data, text } = readJsonFile(path);
  const report = checkResults(data);
  if (report.errors.length > 0) {
    if (strict)
      throw usageError(
        `${path} is not a valid, unmodified Product Check results file:\n${report.errors.join("\n")}`
      );
    io.stderr(`product-check: warning: ${path} failed integrity checks; output will flag it.\n`);
    if (validateAgainst(KIND_SCHEMA["product-check-results"] as string, data).length > 0)
      throw usageError(`${path} does not match the results schema.`);
  }
  return { results: data as Results, sha: sha256(text) };
}

/** A path relative to cwd when inside it, otherwise absolute. */
function display(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  return rel === "" ? "." : rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}

/** Splits comma-separated, repeatable flag values. */
const list = (values: string[] | undefined): string[] =>
  (values ?? [])
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
} as const;

type Values = ReturnType<
  typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; strict: true }>
>["values"];

/** Builds the contract for run/retest/scan/init from --contract and flags. */
function buildContract(values: Values, io: CliIO): { contract: ScanContract; fromFile: boolean } {
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(io.cwd, p));
  if (values.stage !== undefined && !(STAGES as string[]).includes(values.stage))
    throw usageError(`--stage must be one of ${STAGES.join(", ")}`);
  if (values.mode !== undefined && !["AUTO", "SOURCE", "APPLICATION", "HYBRID"].includes(values.mode))
    throw usageError("--mode must be AUTO, SOURCE, APPLICATION or HYBRID");
  const authorize = list(values.authorize);
  for (const a of authorize)
    if (!["passive-http", "exposure-probe"].includes(a))
      throw usageError(`--authorize accepts passive-http and exposure-probe, not "${a}".`);
  const fromFile = values.contract !== undefined;
  const base = fromFile ? loadContract(abs(values.contract as string)) : defaultContract();
  const today = (io.now?.() ?? new Date()).toISOString().slice(0, 10);
  const contract = applyFlags(
    base,
    {
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
    },
    io.cwd,
    today
  );
  if (values["authorized-by"] !== undefined && contract.authorization.attestation)
    contract.authorization.attestation.authorized_by = values["authorized-by"];
  if (!contract.target.repository && !contract.target.application) {
    throw usageError(
      "Nothing to assess: pass --repo <dir> and/or --url <url> (or a --contract that declares a target).",
      "Example: product-check run --repo ."
    );
  }
  return { contract, fromFile };
}

/** Writes all renderings of a results document into a directory. */
function writeOutputs(results: Results, dir: string, branding: boolean, dashboard: boolean): string[] {
  const written: string[] = [];
  const put = (name: string, content: string): void => {
    writeFile(join(dir, name), content);
    written.push(name);
  };
  put("product-check-results.json", `${JSON.stringify(results, null, 2)}\n`);
  put("report.md", renderReport(results, { branding }));
  put("blueprint.md", renderBlueprint(results, { branding }));
  for (const p of results.blueprint.work_packets) put(`work-packets/${p.id}.md`, renderPacket(results, p));
  if (dashboard) put("dashboard.html", renderDashboard(results, { branding }));
  return written;
}

/** run / retest. */
async function commandRun(values: Values, io: CliIO, retest: boolean): Promise<number> {
  if (retest && values.baseline === undefined)
    throw usageError("retest requires --baseline <previous product-check-results.json>.");
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(io.cwd, p));
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
  } catch (error) {
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
      io.stderr(
        `product-check: ABORTED record written to ${display(io.cwd, outDir)}/product-check-results.json\n`
      );
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
  if (values.json) io.stdout(`${JSON.stringify(results, null, 2)}\n`);
  else {
    const written = writeOutputs(results, outDir, !values["no-branding"], !values["no-dashboard"]);
    if (!values.quiet) io.stdout(summary(results, display(io.cwd, outDir), written));
  }
  return failOn.includes(results.verdict.verdict) ? ExitCode.Gate : ExitCode.Ok;
}

/** Human summary printed after a run. */
function summary(r: Results, dir: string, written: string[]): string {
  const s = r.scorecard.pillars;
  const fmt = (p: keyof typeof s): string =>
    `${s[p].score === null ? "not scored" : `${s[p].score}/100`} (coverage ${Math.round(s[p].coverage * 100)}%, confidence ${s[p].confidence})`;
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
function commandScan(values: Values, io: CliIO): number {
  const { contract } = buildContract(values, io);
  const repo = contract.target.repository
    ? deriveFacts(
        snapshotRepo(contract.target.repository.path, contract.constraints.max_files, contract.target.name)
      )
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
    aiInScope: contract.product.uses_ai === true || (repo?.aiDeps.length ?? 0) > 0,
    tier,
    now: (io.now?.() ?? new Date()).toISOString(),
  });
  const coverage = relativize(popCoverage(pops), io.cwd);
  if (values.json || values.format === "json") {
    io.stdout(`${JSON.stringify(coverage, null, 2)}\n`);
    return ExitCode.Ok;
  }
  const mode =
    repo && contract.target.application ? "HYBRID (source + application)" : repo ? "SOURCE" : "APPLICATION";
  const lines = [`Discovery for ${contract.target.name} (no requests sent, no checks run)`, ""];
  for (const p of coverage.pops)
    lines.push(`  ${p.status.padEnd(15)} ${p.name}${p.limitations[0] ? ` — ${p.limitations[0]}` : ""}`);
  lines.push("", `Recommended mode: ${mode}.`);
  if (repo)
    lines.push(
      `Detected: ${[...repo.frameworks, ...repo.dbDeps, ...repo.authDeps, ...repo.aiDeps].join(", ") || "no known frameworks"}; ${repo.testFiles.length} test file(s); ${repo.ciFiles.length} CI file(s).`
    );
  if (contract.target.application)
    lines.push(
      `To observe ${new URL(contract.target.application.url).origin}: add --authorize passive-http (only for targets you own or may test).`
    );
  if (repo && repo.testFiles.length > 0)
    lines.push(
      "To use your tests as evidence: run them with a JUnit reporter and pass --test-results <file>."
    );
  lines.push(
    "Next: product-check run " +
      [
        contract.target.repository ? "--repo <dir>" : "",
        contract.target.application ? "--url <url> --authorize passive-http" : "",
      ]
        .filter(Boolean)
        .join(" "),
    ""
  );
  io.stdout(lines.join("\n"));
  return ExitCode.Ok;
}

/** init: write a contract. */
function commandInit(values: Values, io: CliIO): number {
  const out = isAbsolute(values.output ?? "")
    ? (values.output as string)
    : resolve(io.cwd, values.output ?? "product-check.contract.json");
  if (existsSync(out) && !values.force) throw usageError(`${out} exists; pass --force to overwrite.`);
  const flags: Values = { ...values };
  delete flags.contract;
  const { contract } = buildContract(flags, io);
  const portable = relativize(contract, dirname(out));
  if (portable.target.repository && portable.target.repository.path === "")
    portable.target.repository.path = ".";
  writeFile(out, `${JSON.stringify(portable, null, 2)}\n`);
  io.stdout(
    [
      `Wrote ${display(io.cwd, out)}. Edit it to declare: product.multi_tenant, handles_personal_data, uses_ai; critical_journeys; control_mappings (link your executed tests to controls); risk_acceptances.`,
      contract.target.application && !contract.authorization.authorized_actions.includes("passive-http")
        ? 'The application URL is declared but requests are NOT authorized. If you own or may test it, add "passive-http" to authorization.authorized_actions and fill authorization.attestation, then run with --allow-network.'
        : "",
      `Run: product-check run --contract ${display(io.cwd, out)}${contract.authorization.authorized_actions.includes("passive-http") ? " --allow-network" : ""}`,
      "",
    ]
      .filter(Boolean)
      .join("\n")
  );
  return ExitCode.Ok;
}

/** validate: schema (+ integrity for results). */
function commandValidate(files: string[], io: CliIO): number {
  if (files.length === 0) throw usageError("validate needs at least one file.");
  let bad = 0;
  for (const file of files) {
    const path = isAbsolute(file) ? file : resolve(io.cwd, file);
    const { data } = readJsonFile(path);
    const kind =
      data !== null && typeof data === "object" && "kind" in data
        ? String((data as { kind: unknown }).kind)
        : "";
    const schema = KIND_SCHEMA[kind];
    if (!schema) {
      io.stdout(
        `INVALID ${file}: unknown or missing "kind" (expected one of ${Object.keys(KIND_SCHEMA).join(", ")})\n`
      );
      bad++;
      continue;
    }
    if (kind === "product-check-results") {
      const report = checkResults(data);
      for (const w of report.warnings) io.stderr(`product-check: warning: ${file}: ${w}\n`);
      if (report.errors.length > 0) {
        io.stdout(`INVALID ${file} (${kind}):\n${report.errors.map((e) => `  ${e}`).join("\n")}\n`);
        bad++;
      } else io.stdout(`OK      ${file} (${kind}: schema, references, scorecard and verdict recompute)\n`);
      continue;
    }
    const errors = validateAgainst(schema, kind === "scan-contract" ? withDefaults(data) : data);
    if (errors.length > 0) {
      io.stdout(`INVALID ${file} (${kind}):\n${formatErrors(errors)}\n`);
      bad++;
    } else
      io.stdout(
        `OK      ${file} (${kind}${kind === "scan-contract" ? ", omitted fields take defaults" : ""})\n`
      );
  }
  return bad > 0 ? ExitCode.Invalid : ExitCode.Ok;
}

/** Parses arguments and runs one command. */
async function main(argv: string[], io: CliIO): Promise<number> {
  const { values, positionals } = (() => {
    try {
      return parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
    } catch (error) {
      throw usageError((error as Error).message, "Run `product-check --help` for usage.");
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
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(io.cwd, p));
  const one = (): string => {
    if (rest.length !== 1) throw usageError(`${command} needs exactly one results file.`);
    return abs(rest[0] as string);
  };
  const branding = !values["no-branding"];
  switch (command) {
    case "run":
    case "retest":
      if (rest.length > 0) throw usageError(`Unexpected argument: ${rest[0] as string}`);
      return commandRun(values, io, command === "retest");
    case "scan":
      if (rest.length > 0) throw usageError(`Unexpected argument: ${rest[0] as string}`);
      return commandScan(values, io);
    case "init":
      return commandInit(values, io);
    case "validate":
      return commandValidate(rest, io);
    case "report": {
      const { results } = loadResults(one(), false, io);
      const text =
        values.format === "json"
          ? `${JSON.stringify(results, null, 2)}\n`
          : renderReport(results, { branding });
      if (values.output) writeFile(abs(values.output), text);
      else io.stdout(text);
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
        io.stdout(
          `Wrote blueprint.json, blueprint.md and ${results.blueprint.work_packets.length} work packet(s) to ${display(io.cwd, dir)}\n`
        );
      } else
        io.stdout(
          values.format === "json"
            ? `${JSON.stringify(results.blueprint, null, 2)}\n`
            : renderBlueprint(results, { branding })
        );
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
        io.stdout(
          `${JSON.stringify(
            CONTROLS.map(({ remediation: _r, ...c }) => c),
            null,
            2
          )}\n`
        );
      else {
        const lines = [
          "Control catalog (rubric pc-rubric-0.1). Tiers carry forward: a tier applies its own and all earlier controls.",
          "",
        ];
        for (const c of CONTROLS)
          lines.push(
            `${c.id.padEnd(9)} ${c.tier}  ${c.pillar.padEnd(10)} w${c.weight}${c.gate ? ` ${c.gate}` : ""}  ${c.title}`
          );
        lines.push("", ...Object.entries(TIER_INFO).map(([t, i]) => `${t} ${i.name}: ${i.focus}`), "");
        io.stdout(lines.join("\n"));
      }
      return ExitCode.Ok;
    }
    case "schema": {
      if (rest.length === 0) io.stdout(`${schemaFiles().join("\n")}\n`);
      else {
        const name = (rest[0] as string).replace(/\.schema\.json$/, "");
        if (!schemaFiles().includes(`${name}.schema.json`))
          throw usageError(`Unknown schema ${name}. Available: ${schemaFiles().join(", ")}`);
        io.stdout(schemaText(`${name}.schema.json`));
      }
      return ExitCode.Ok;
    }
    default:
      throw usageError(
        `Unknown command: ${command}`,
        "Commands: run, retest, scan, init, validate, report, blueprint, dashboard, controls, schema."
      );
  }
}

/** Runs the CLI and returns the process exit code. Never throws. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    return await main(argv, io);
  } catch (error) {
    if (error instanceof ProductCheckError) {
      io.stderr(
        `product-check: ${error.exitCode === ExitCode.Safety ? "refused" : "error"}: ${error.message}\n`
      );
      if (error.hint) io.stderr(`product-check: hint: ${error.hint}\n`);
      return error.exitCode;
    }
    io.stderr(`product-check: internal error: ${(error as Error)?.message ?? String(error)}\n`);
    return ExitCode.Internal;
  }
}

export type { Verdict };
