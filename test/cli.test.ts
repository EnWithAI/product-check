// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * CLI contract: help/version, every command, exit codes, contract init/merge, imports, risk acceptances,
 * control mappings, --fail-on and output files.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Results } from "../src/types.js";
import { CONTROLS } from "../src/validation/catalog.js";
import {
  cleanRepo,
  cli,
  commitAll,
  DEMO,
  FAKE,
  readJson,
  ROOT,
  runJson,
  statusOf,
  tempFiles,
} from "./helpers.js";

describe("CLI basics", () => {
  it("help, version, controls, schema", async () => {
    const dir = tempFiles({});
    const help = await cli(["--help"], dir);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("--authorize");
    expect((await cli(["-v"], dir)).stdout).toMatch(/^\d+\.\d+\.\d+/);
    expect((await cli(["controls"], dir)).stdout).toContain("PC-S-01");
    expect(JSON.parse((await cli(["controls", "--format", "json"], dir)).stdout)).toHaveLength(
      CONTROLS.length
    );
    expect((await cli(["schema"], dir)).stdout).toContain("product-check-results.schema.json");
    expect(JSON.parse((await cli(["schema", "finding"], dir)).stdout).title).toBe("Product Check finding");
    expect((await cli([], dir)).code).toBe(2);
  });

  it.each([
    [["frobnicate"]],
    [["run"]],
    [["run", "--repo", ".", "--stage", "NOPE"]],
    [["run", "--repo", ".", "--mode", "NOPE"]],
    [["run", "--repo", ".", "--authorize", "port-scan"]],
    [["run", "--repo", ".", "--fail-on", "MAYBE"]],
    [["run", "--repo", ".", "--bogus"]],
    [["run", "extra"]],
    [["retest", "--repo", "."]],
    [["schema", "nope"]],
    [["report"]],
    [["validate"]],
    [["run", "--url", "not a url"]],
  ])("usage error: %j", async (args) => {
    const r = await cli(args, tempFiles({}));
    expect(r.code, r.stderr).toBe(2);
    expect(r.stderr).toMatch(/product-check: error:/);
  });

  it("input errors exit 3", async () => {
    const dir = tempFiles({ "bad.xml": "not xml", "bad.json": "{" });
    expect((await cli(["run", "--repo", "missing-dir"], dir)).code).toBe(3);
    expect((await cli(["run", "--repo", ".", "--test-results", "bad.xml"], dir)).code).toBe(3);
    expect((await cli(["run", "--repo", ".", "--npm-audit", "bad.json"], dir)).code).toBe(3);
    expect((await cli(["run", "--repo", ".", "--npm-audit", "missing.json"], dir)).code).toBe(3);
    expect((await cli(["validate", "bad.json"], dir)).code).toBe(3);
  });
});

describe("init, scan and validate", () => {
  it("init writes an editable contract that run accepts", async () => {
    const dir = tempFiles(cleanRepo());
    const init = await cli(
      ["init", "--repo", ".", "--url", "https://app.example.invalid", "--stage", "PRE_LAUNCH"],
      dir
    );
    expect(init.code).toBe(0);
    expect(init.stdout).toMatch(/NOT authorized/);
    const c = readJson<{
      target: { repository: { path: string } };
      authorization: { authorized_actions: string[] };
    }>(join(dir, "product-check.contract.json"));
    expect(c.target.repository.path).toBe(".");
    expect(c.authorization.authorized_actions).not.toContain("passive-http");
    expect((await cli(["init", "--repo", "."], dir)).code).toBe(2);
    expect((await cli(["validate", "product-check.contract.json"], dir)).code).toBe(0);
    const r = await runJson(dir, ["--contract", "product-check.contract.json"]);
    expect(r.run.tier).toBe("CT-T2");
    expect(r.pop_coverage.pops.find((p) => p.id === "deployed-web")?.authorization).toBe("not-authorized");
  });

  it("scan lists points of presence without requests or checks", async () => {
    const dir = tempFiles(cleanRepo());
    const text = await cli(["scan", "--repo", ".", "--url", "https://app.example.invalid"], dir);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/Recommended mode: HYBRID/);
    const json = JSON.parse((await cli(["scan", "--repo", ".", "--json"], dir)).stdout) as { kind: string };
    expect(json.kind).toBe("pop-coverage");
  });

  it("validate reports unknown kinds and schema errors with exit 5", async () => {
    const dir = tempFiles({
      "x.json": { kind: "mystery" },
      "obs.json": { kind: "observations", schema_version: "0.1.0" },
    });
    expect((await cli(["validate", "x.json"], dir)).code).toBe(5);
    const r = await cli(["validate", "obs.json"], dir);
    expect(r.code).toBe(5);
    expect(r.stdout).toMatch(/missing required property origin/);
  });
});

describe("run outputs and renderings", () => {
  it("writes results, report, blueprint, packets and dashboard; renders them again from JSON", async () => {
    const dir = tempFiles(
      cleanRepo({ "app/page.tsx": 'export default function P() { return <img src="/a.png" />; }\n' })
    );
    commitAll(dir);
    const r = await cli(["run", "--repo", ".", "--out-dir", "out"], dir);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Verdict: /);
    expect(readdirSync(join(dir, "out")).sort()).toEqual([
      "as-built-spec.json",
      "blueprint.md",
      "dashboard.html",
      "product-check-results.json",
      "report.md",
      "specs",
      "work-packets",
    ]);
    // The as-built spec is embedded in the blueprint, and findings in a page link to its requirement.
    const results = JSON.parse(readFileSync(join(dir, "out/product-check-results.json"), "utf8")) as Results;
    const built = results.blueprint.as_is.as_built;
    expect(built?.requirements[0]?.statement).toContain("`/`");
    const altFinding = results.findings.find((f) => f.control_id === "PC-C-04");
    expect(
      results.blueprint.traceability.find((t) => t.finding_id === altFinding?.id)?.journey_or_requirement
    ).toMatch(/^As-built FR-001; requirement PC-C-04/);
    expect(readFileSync(join(dir, "out/blueprint.md"), "utf8")).toContain(
      "## As-built specification (reverse-engineered)"
    );
    expect(readdirSync(join(dir, "out/work-packets"))).toContain("WP-PC-C-04.md");
    const report = await cli(["report", "out/product-check-results.json"], dir);
    expect(report.stdout).toBe(readFileSync(join(dir, "out/report.md"), "utf8"));
    expect(
      (await cli(["report", "out/product-check-results.json", "--format", "json"], dir)).stdout
    ).toContain('"kind": "product-check-results"');
    expect(
      (await cli(["blueprint", "out/product-check-results.json", "--format", "json"], dir)).stdout
    ).toContain('"kind": "blueprint"');
    expect((await cli(["blueprint", "out/product-check-results.json", "--out-dir", "bp"], dir)).code).toBe(0);
    expect(existsSync(join(dir, "bp/blueprint.json"))).toBe(true);
    expect(readFileSync(join(dir, "bp/specs/000-as-built/spec.md"), "utf8")).toBe(
      readFileSync(join(dir, "out/specs/000-as-built/spec.md"), "utf8")
    );
    expect((await cli(["blueprint", "out/product-check-results.json"], dir)).stdout).toMatch(
      /# Engineering blueprint/
    );
    expect((await cli(["dashboard", "out/product-check-results.json", "--output", "d.html"], dir)).code).toBe(
      0
    );
    expect(readFileSync(join(dir, "d.html"), "utf8")).toBe(
      readFileSync(join(dir, "out/dashboard.html"), "utf8")
    );
    expect(
      (await cli(["report", "out/product-check-results.json", "--output", "r.md", "--no-branding"], dir)).code
    ).toBe(0);
    expect(readFileSync(join(dir, "r.md"), "utf8")).not.toMatch(/Engineering Commons/);
    expect(
      (await cli(["run", "--repo", ".", "--out-dir", "out", "--no-dashboard", "--quiet"], dir)).code
    ).toBe(0);
  });

  it("--fail-on turns a verdict into exit 6", async () => {
    const dir = tempFiles(cleanRepo());
    const r = await cli(["run", "--repo", ".", "--fail-on", "INCONCLUSIVE,NOT_READY", "--json"], dir);
    expect(r.code).toBe(6);
  });

  it("a tampered results file is flagged by report/dashboard and rejected as a baseline", async () => {
    const dir = tempFiles({
      "r.json": readFileSync(join(DEMO, "output/baseline/product-check-results.json"), "utf8").replace(
        '"score": 40',
        '"score": 95'
      ),
    });
    const report = await cli(["report", "r.json"], dir);
    expect(report.code).toBe(0);
    expect(report.stderr).toMatch(/failed integrity checks/);
    expect((await cli(["dashboard", "r.json"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "dashboard.html"), "utf8")).toContain("Integrity check failed");
    expect((await cli(["validate", "r.json"], dir)).code).toBe(5);
    expect((await cli(["retest", "--repo", ".", "--baseline", "r.json", "--json"], dir)).code).toBe(2);
  });
});

describe("imports, mappings and risk acceptance", () => {
  it("test results, npm audit and Commons reports become evidence", async () => {
    const dir = tempFiles({
      ...cleanRepo(),
      "junit.xml": `<testsuites><testsuite name="e2e" file="e2e/signup.spec.ts"><testcase name="journey: sign up works"/></testsuite><testsuite name="unit"><testcase name="authz: anonymous is denied"/><testcase name="math"><failure/></testcase></testsuite></testsuites>`,
      "audit.json": {
        metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 2, low: 0 } },
        vulnerabilities: { "left-pad": { severity: "high" } },
      },
      "spec.json": { schema_version: "1.0", findings: [], requirements: [{}] },
      "impact.json": {
        schema_version: "2.0",
        findings: [{ severity: "high" }],
        affected_modules: [],
        test_candidates: [],
      },
      "outcome.json": {
        schema_version: "1.0",
        metrics: [
          { id: "ci_first_pass_rate", segments: { all: { value: 0.9 } } },
          { id: "revert_rate", segments: { all: { numerator: 0 } } },
        ],
      },
      "c.json": {
        target: { name: "imports", repository: { path: "." } },
        lifecycle_stage: "POST_LAUNCH",
        product: { multi_tenant: false },
        control_mappings: [{ control_id: "PC-S-13", test_name_pattern: "^authz:" }],
      },
    });
    commitAll(dir);
    const r = await runJson(dir, [
      "--contract",
      "c.json",
      "--test-results",
      "junit.xml",
      "--npm-audit",
      "audit.json",
      "--spec-check",
      "spec.json",
      "--impact-check",
      "impact.json",
      "--outcome-check",
      "outcome.json",
    ]);
    expect(statusOf(r, "PC-T-03")).toBe("FAIL");
    expect(statusOf(r, "PC-C-08")).toBe("PASS");
    expect(statusOf(r, "PC-S-13")).toBe("PASS");
    expect(statusOf(r, "PC-S-14")).toBe("NOT_APPLICABLE");
    expect(statusOf(r, "PC-S-15")).toBe("FAIL");
    expect(statusOf(r, "PC-C-10")).toBe("PASS");
    expect(statusOf(r, "PC-T-12")).toBe("PARTIAL");
    expect(statusOf(r, "PC-T-15")).toBe("PASS");
    expect(statusOf(r, "PC-T-14")).toBe("NOT_TESTED");
    expect(r.pop_coverage.pops.find((p) => p.id === "observability")?.status).toBe("BLOCKED");
    expect(r.evidence.find((e) => e.kind === "test-result")?.checksum?.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("valid risk acceptances relax P1/P2 but never P0, and expired ones are rejected", async () => {
    const dir = tempFiles({
      ...cleanRepo({
        "lib/pay.ts": `export const key = "${FAKE.stripeLive}";\n`,
        ".env.local": "X=1\n",
        ".gitignore": "node_modules\n",
      }),
      "c.json": {
        target: { name: "acc", repository: { path: "." } },
        risk_acceptances: [
          {
            id: "RA-1",
            control_id: "PC-S-01",
            finding_id: null,
            rationale: "Key is revoked already.",
            owner: "cto",
            compensating_control: "revoked",
            expires: "2027-01-01",
            closure_condition: "removed",
          },
          {
            id: "RA-2",
            control_id: "PC-S-03",
            finding_id: null,
            rationale: "Fixing in the next sprint.",
            owner: "lead",
            compensating_control: "none",
            expires: "2027-01-01",
            closure_condition: "ignored",
          },
          {
            id: "RA-3",
            control_id: "PC-T-09",
            finding_id: null,
            rationale: "Old acceptance kept around.",
            owner: "lead",
            compensating_control: "none",
            expires: "2020-01-01",
            closure_condition: "x",
          },
        ],
      },
    });
    commitAll(dir);
    const r = await runJson(dir, ["--contract", "c.json"]);
    expect(r.verdict.rejected_acceptances.map((x) => x.acceptance_id).sort()).toEqual(["RA-1", "RA-3"]);
    expect(r.verdict.accepted_risks.map((x) => x.acceptance_id)).toEqual(["RA-2"]);
    expect(r.findings.find((f) => f.control_id === "PC-S-03")?.status).toBe("ACCEPTED_RISK");
    expect(r.findings.find((f) => f.control_id === "PC-S-01")?.status).toBe("OPEN");
    expect(r.verdict.verdict).toBe("NOT_READY");
    expect(r.scorecard.accepted_risks).toBe(1);
  });

  it("the HAR importer feeds application controls offline", async () => {
    const har = {
      log: {
        entries: [
          {
            startedDateTime: "2026-10-01T00:00:00Z",
            request: { method: "GET", url: "https://app.example.invalid/" },
            response: {
              status: 200,
              headers: [
                { name: "content-type", value: "text/html" },
                { name: "strict-transport-security", value: "max-age=63072000" },
              ],
              content: {
                mimeType: "text/html",
                text: '<html lang="en"><title>Real App</title><meta name="viewport" content="x"></html>',
              },
            },
            timings: { wait: 80 },
          },
        ],
      },
    };
    const dir = tempFiles({ "a.har": har });
    const r = await runJson(dir, [
      "--url",
      "https://app.example.invalid",
      "--har",
      "a.har",
      "--stage",
      "PRE_LAUNCH",
    ]);
    expect(r.run.network.used).toBe(false);
    expect(statusOf(r, "PC-C-05")).toBe("PASS");
    expect(r.validations.find((v) => v.control_id === "PC-C-05")?.strength).toBe("imported-report");
    expect(statusOf(r, "PC-S-05")).toBe("FAIL");
  });

  it("an observations file for another origin is rejected", async () => {
    const dir = tempFiles({
      "o.json": readFileSync(join(DEMO, "inputs/observations-baseline.json"), "utf8"),
    });
    expect(
      (await cli(["run", "--url", "https://other.invalid", "--observations", "o.json", "--json"], dir)).code
    ).toBe(3);
  });

  it("the committed aborted and repo-only examples describe what they claim", () => {
    const aborted = readJson<Results>(join(ROOT, "examples/aborted-run/product-check-results.json"));
    expect(aborted.run.status).toBe("ABORTED");
    expect(aborted.validations.every((v) => v.status === "BLOCKED" || v.status === "NOT_APPLICABLE")).toBe(
      true
    );
    const repoOnly = readJson<Results>(join(ROOT, "examples/repo-only/product-check-results.json"));
    expect(repoOnly.run.mode_effective).toBe("SOURCE");
    expect(repoOnly.run.network.used).toBe(false);
  });
});

describe("false-positive guards found by dogfooding", () => {
  it("CI that runs tests through an npm script chain passes PC-T-05", async () => {
    const dir = tempFiles(
      cleanRepo({
        "package.json": {
          name: "x",
          scripts: {
            "check:all": "npm run lint && npm run test:coverage",
            "test:coverage": "vitest run --coverage",
            lint: "eslint .",
          },
        },
        ".github/workflows/ci.yml":
          "jobs:\n  t:\n    steps:\n      - run: npm ci --ignore-scripts\n      - run: npm run check:all\n",
      })
    );
    const r = await runJson(dir, ["--repo", "."]);
    expect(statusOf(r, "PC-T-05")).toBe("PASS");
    const noTests = tempFiles(
      cleanRepo({
        "package.json": { name: "x", scripts: { build: "tsc" } },
        ".github/workflows/ci.yml": "steps:\n  - run: npm run build\n",
      })
    );
    expect(statusOf(await runJson(noTests, ["--repo", "."]), "PC-T-05")).toBe("FAIL");
  });

  it("a README with install and a usage section passes PC-T-06", async () => {
    const dir = tempFiles(
      cleanRepo({
        "README.md": "# Tool\n\n## Install\n\n`npm install -g tool`\n\n## Usage\n\n`tool --help`\n",
      })
    );
    expect(statusOf(await runJson(dir, ["--repo", "."]), "PC-T-06")).toBe("PASS");
  });

  it("credential-format strings in test, fixture and example paths are P2 hypotheses, not gate failures", async () => {
    const dir = tempFiles(
      cleanRepo({
        "test/redact.test.ts": `const fake = "${FAKE.aws}";\n`,
        "examples/env.ts": "process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY;\n",
      })
    );
    commitAll(dir);
    const r = await runJson(dir, ["--repo", "."]);
    expect(statusOf(r, "PC-S-01")).toBe("PARTIAL");
    expect(statusOf(r, "PC-S-02")).toBe("PARTIAL");
    const fs = r.findings.filter((f) => f.control_id === "PC-S-01" || f.control_id === "PC-S-02");
    expect(fs.map((f) => [f.severity, f.epistemic])).toEqual([
      ["P2", "hypothesis"],
      ["P2", "hypothesis"],
    ]);
    expect(r.scorecard.gates.find((g) => g.gate_id === "G-SECRETS")?.status).toBe("UNVERIFIED"); // not FAIL; PC-S-09 needs the app
  });

  it("the bare PUBLIC_ prefix counts only in an env context; Product Check result files are not scanned", async () => {
    const dir = tempFiles(
      cleanRepo({
        "src/consts.ts": "const PUBLIC_SECRET_PATTERN = /x/;\n",
        "src/svelte.ts": 'import { env } from "$env/dynamic/public";\nenv.PUBLIC_STRIPE_SECRET;\n',
        "old/product-check-results.json": readFileSync(
          join(DEMO, "output/baseline/product-check-results.json"),
          "utf8"
        ),
      })
    );
    const r = await runJson(dir, ["--repo", "."]);
    const locations = r.findings.filter((f) => f.control_id === "PC-S-02").map((f) => f.location);
    expect(locations).toEqual(["src/svelte.ts:2"]);
    expect(r.findings.some((f) => f.location.startsWith("old/"))).toBe(false);
  });

  it("acceptance tests count as end-to-end journeys", async () => {
    const dir = tempFiles(cleanRepo({ "test/acceptance/cli.test.ts": "test('a', () => {});\n" }));
    expect(statusOf(await runJson(dir, ["--repo", "."]), "PC-C-08")).toBe("PARTIAL");
  });
});

describe("product declarations", () => {
  it("has_user_accounts: false makes the authorization gate not applicable (e.g. CLIs and libraries)", async () => {
    const dir = tempFiles({
      ...cleanRepo(),
      "c.json": {
        target: { name: "cli", repository: { path: "." } },
        product: { has_user_accounts: false, multi_tenant: false },
      },
    });
    const r = await runJson(dir, ["--contract", "c.json", "--stage", "PRE_LAUNCH"]);
    expect(statusOf(r, "PC-S-13")).toBe("NOT_APPLICABLE");
    expect(r.scorecard.gates.find((g) => g.gate_id === "G-AUTHZ")?.status).toBe("NOT_APPLICABLE");
    expect(r.scorecard.gates.find((g) => g.gate_id === "G-ISOLATION")?.status).toBe("NOT_APPLICABLE");
  });
});
