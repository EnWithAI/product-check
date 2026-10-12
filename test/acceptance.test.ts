// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The ten acceptance criteria from the implementation brief (§13), each as executable tests.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { renderDashboard } from "../src/dashboard/render.js";
import { computeScorecard } from "../src/scoring/score.js";
import { computeVerdict } from "../src/scoring/verdict.js";
import type { Finding, Results, Validation } from "../src/types.js";
import { CONTROLS } from "../src/validation/catalog.js";
import { checked } from "../src/validation/context.js";
import { checkResults } from "../src/validation/integrity.js";
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

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const f of readdirSync(join(ROOT, "schemas"))) ajv.addSchema(readJson(join(ROOT, "schemas", f)));
const BASE = "https://github.com/enwithai/product-check/schemas/";
const RESULTS_ID = `${BASE}product-check-results.schema.json`;
const baselineDemo = (): Results =>
  readJson<Results>(join(DEMO, "output/baseline/product-check-results.json"));
const retestDemo = (): Results => readJson<Results>(join(DEMO, "output/retest/product-check-results.json"));
const APP_ONLY = CONTROLS.filter((c) => c.pops.every((p) => p === "deployed-web")).map((c) => c.id);

describe("A1 every sample JSON matches its schema", () => {
  it("demo results, inputs and examples validate with Ajv and with the built-in validator", async () => {
    const samples: [string, string][] = [
      [join(DEMO, "output/baseline/product-check-results.json"), "product-check-results"],
      [join(DEMO, "output/retest/product-check-results.json"), "product-check-results"],
      [join(DEMO, "inputs/observations-baseline.json"), "observations"],
      [join(DEMO, "inputs/observations-remediated.json"), "observations"],
      [join(ROOT, "examples/aborted-run/product-check-results.json"), "product-check-results"],
      [join(ROOT, "examples/repo-only/product-check-results.json"), "product-check-results"],
    ];
    for (const [file, kind] of samples) {
      const validate = ajv.getSchema(`${BASE}${kind}.schema.json`);
      expect(validate, kind).toBeDefined();
      const ok = validate?.(readJson(file));
      expect(ok, `${file}: ${JSON.stringify(validate?.errors?.slice(0, 3))}`).toBe(true);
      const r = await cli(["validate", file], ROOT);
      expect(r.code, r.stdout).toBe(0);
    }
    // Sub-documents validate against their own schemas too.
    const r = baselineDemo();
    for (const [part, schema] of [
      [r.contract, "scan-contract"],
      [r.pop_coverage, "pop-coverage"],
      [r.scorecard, "scorecard"],
      [r.blueprint, "blueprint"],
      [r.verdict, "release-verdict"],
      [r.findings[0], "finding"],
      [r.validations[0], "validation"],
      [r.evidence[0], "evidence"],
    ] as const) {
      expect(ajv.getSchema(`${BASE}${schema}.schema.json`)?.(part), schema).toBe(true);
    }
  });
});

describe("A2 a repository-only scan does not imply UI or production validation", () => {
  it("marks every application control BLOCKED, sends no request and cannot be READY", async () => {
    const dir = tempFiles(cleanRepo());
    commitAll(dir);
    const r = await runJson(dir, ["--repo", "."]);
    expect(r.run.mode_effective).toBe("SOURCE");
    expect(r.run.network).toEqual({ used: false, requests: 0, origins: [] });
    expect(r.pop_coverage.pops.find((p) => p.id === "deployed-web")?.status).toBe("BLOCKED");
    for (const id of APP_ONLY) expect(["BLOCKED", "NOT_APPLICABLE"], id).toContain(statusOf(r, id));
    expect(r.evidence.some((e) => e.kind === "http-response")).toBe(false);
    expect(r.verdict.verdict).not.toBe("READY");
    expect(r.blueprint.as_is.uncertainties.join(" ")).toMatch(/No deployed application was observed/);
  });
});

describe("A3 a blocked point of presence reduces coverage and is reported honestly", () => {
  it("an unauthorized URL is BLOCKED with its reason, and coverage is lower than with observations", async () => {
    const dir = tempFiles({
      ...cleanRepo(),
      "obs.json": readFileSync(join(DEMO, "inputs/observations-remediated.json"), "utf8"),
    });
    commitAll(dir);
    const blocked = await runJson(dir, [
      "--repo",
      ".",
      "--url",
      "http://127.0.0.1:4785",
      "--stage",
      "PRE_LAUNCH",
    ]);
    const pop = blocked.pop_coverage.pops.find((p) => p.id === "deployed-web");
    expect(pop?.status).toBe("BLOCKED");
    expect(pop?.authorization).toBe("not-authorized");
    expect(pop?.limitations.join(" ")).toMatch(/not authorized/);
    expect(statusOf(blocked, "PC-S-05")).toBe("BLOCKED");
    const observed = await runJson(dir, [
      "--repo",
      ".",
      "--url",
      "http://127.0.0.1:4785",
      "--observations",
      "obs.json",
      "--stage",
      "PRE_LAUNCH",
    ]);
    expect(observed.scorecard.overall_coverage).toBeGreaterThan(blocked.scorecard.overall_coverage);
    expect(observed.scorecard.pillars.trust.coverage).toBeGreaterThan(
      blocked.scorecard.pillars.trust.coverage
    );
  });
});

/** All-PASS validations plus one failing hard-gate control. */
function gateScenario(): { validations: Validation[]; findings: Finding[] } {
  const validations: Validation[] = CONTROLS.filter((c) => c.tier <= "CT-T2").map((c) => ({
    id: `VAL-${c.id}`,
    control_id: c.id,
    pillar: c.pillar,
    tier: c.tier,
    title: c.title,
    expected: c.expected,
    actual: "ok",
    status: "PASS",
    method: "static-analysis",
    strength: "runtime",
    reason: null,
    evidence_ids: ["EV-000000000000"],
    reproduction: [],
    hard_gate: c.gate,
    weight: c.weight,
    finding_ids: [],
  }));
  const s01 = validations.find((v) => v.control_id === "PC-S-01") as Validation;
  s01.status = "FAIL";
  s01.finding_ids = ["PCF-0000000001"];
  const finding = {
    id: "PCF-0000000001",
    control_id: "PC-S-01",
    pillar: "trust",
    severity: "P0",
    status: "OPEN",
  } as Finding;
  return { validations, findings: [finding] };
}

describe("A4 a critical trust gate blocks READY even with high Customer/Technology scores", () => {
  it("rules: perfect customer and technology, one failed secrets gate → NOT_READY, trust capped", () => {
    const { validations, findings } = gateScenario();
    const sc = computeScorecard(validations, findings, { min_coverage: 0.5, pillar_threshold: 70 }, null);
    expect(sc.pillars.customer.score).toBe(100);
    expect(sc.pillars.technology.score).toBe(100);
    expect(sc.pillars.trust.score).toBe(39);
    expect(sc.pillars.trust.cap.applied).toBe(true);
    const v = computeVerdict(sc, findings, validations, "CT-T2", null, [], [], {
      repository: null,
      application: null,
      finishedAt: "2026-10-12T00:00:00.000Z",
    });
    expect(v.verdict).toBe("NOT_READY");
    expect(v.blocking_gates).toEqual(["G-SECRETS"]);
  });

  it("end to end: one committed live key in an otherwise clean repository → NOT_READY", async () => {
    const dir = tempFiles(cleanRepo({ "lib/pay.ts": `export const key = "${FAKE.stripeLive}";\n` }));
    commitAll(dir);
    const r = await runJson(dir, ["--repo", "."]);
    expect(statusOf(r, "PC-S-01")).toBe("FAIL");
    expect(r.scorecard.gates.find((g) => g.gate_id === "G-SECRETS")?.status).toBe("FAIL");
    expect(r.verdict.verdict).toBe("NOT_READY");
    expect(JSON.stringify(r)).not.toContain(FAKE.stripeLive);
  });
});

describe("A5 missing evidence prevents fabricated PASS claims", () => {
  it("evaluators cannot construct a checked outcome without evidence", () => {
    expect(() => checked("PASS", "claimed", "static-analysis", "static", [])).toThrow(/without evidence/);
  });

  it("the schema rejects PASS without evidence and unchecked statuses without a reason", () => {
    const r = baselineDemo();
    const tampered = structuredClone(r);
    const v = tampered.validations.find((x) => x.status === "NOT_TESTED") as Validation;
    v.status = "PASS";
    expect(ajv.validate(RESULTS_ID, tampered)).toBe(false);
    const noReason = structuredClone(r);
    (noReason.validations.find((x) => x.status === "NOT_TESTED") as Validation).reason = null;
    expect(ajv.validate(RESULTS_ID, noReason)).toBe(false);
  });

  it("integrity checks reject PASS backed by non-existent evidence and turning NOT_TESTED into PASS", () => {
    const r = baselineDemo();
    const fake = structuredClone(r);
    const v = fake.validations.find((x) => x.status === "NOT_TESTED") as Validation;
    v.status = "PASS";
    v.strength = "runtime";
    v.reason = null;
    v.evidence_ids = ["EV-ABCDEF123456"];
    const report = checkResults(fake);
    expect(report.errors.join("\n")).toMatch(/missing evidence EV-ABCDEF123456/);
    expect(report.errors.join("\n")).toMatch(/scorecard does not recompute/);
  });
});

describe("A6 findings keep stable IDs and evidence linkage on retest", () => {
  it("identical inputs give identical finding and evidence IDs", async () => {
    const dir = tempFiles(
      cleanRepo({ "app/page.tsx": 'export default function P() { return <img src="/a.png" />; }\n' })
    );
    commitAll(dir);
    const a = await runJson(dir, ["--repo", "."]);
    const b = await runJson(dir, ["--repo", "."], new Date("2026-10-13T00:00:00.000Z"));
    expect(b.findings.map((f) => f.id)).toEqual(a.findings.map((f) => f.id));
    expect(b.evidence.map((e) => e.id)).toEqual(a.evidence.map((e) => e.id));
  });

  it("the demo retest keeps IDs, preserves baseline evidence and verifies fixes only with new evidence", () => {
    const base = baselineDemo();
    const re = retestDemo();
    expect(re.run.baseline?.run_id).toBe(base.run.run_id);
    const resolved = re.findings.filter((f) => f.status === "RESOLVED");
    expect(resolved.length).toBeGreaterThan(10);
    const evidence = new Map(re.evidence.map((e) => [e.id, e]));
    for (const f of resolved) {
      const before = base.findings.find((x) => x.id === f.id);
      expect(before, f.id).toBeDefined();
      expect(f.history.at(-1)?.run_id).toBe(base.run.run_id);
      for (const id of before?.evidence_ids ?? []) expect(evidence.get(id)?.run_id, id).toBe(base.run.run_id);
      expect(["PASS", "PARTIAL", "FAIL"]).toContain(
        re.validations.find((v) => v.id === f.validation_id)?.status
      );
    }
    const persisting = re.findings.filter((f) => f.lifecycle === "PERSISTING");
    for (const f of persisting) expect(base.findings.some((x) => x.id === f.id)).toBe(true);
  });

  it("a finding whose control cannot be re-checked stays open as UNVERIFIED, never RESOLVED", async () => {
    const dir = tempFiles(cleanRepo({ "lib/pay.ts": `export const key = "${FAKE.stripeLive}";\n` }));
    commitAll(dir);
    const base = await runJson(dir, ["--repo", "."]);
    writeFileSync(join(dir, "base.json"), JSON.stringify(base));
    const obsDir = tempFiles({
      "obs.json": readFileSync(join(DEMO, "inputs/observations-remediated.json"), "utf8"),
    });
    const re = await runJson(obsDir, [
      "--url",
      "http://127.0.0.1:4785",
      "--observations",
      "obs.json",
      "--baseline",
      join(dir, "base.json"),
    ]);
    const carried = re.findings.find((f) => f.control_id === "PC-S-01");
    expect(carried?.status).toBe("UNVERIFIED");
    expect(carried?.lifecycle).toBe("CARRIED_UNVERIFIED");
    expect(re.verdict.verdict).toBe("NOT_READY");
  });
});

describe("A7 work packets reference valid findings and measurable acceptance criteria", () => {
  it.each([
    ["baseline", baselineDemo],
    ["retest", retestDemo],
  ])("%s", (_name, load) => {
    const r = load();
    const ids = new Set(r.findings.map((f) => f.id));
    expect(r.blueprint.work_packets.length).toBeGreaterThan(0);
    for (const p of r.blueprint.work_packets) {
      expect(p.finding_ids.length).toBeGreaterThan(0);
      for (const id of p.finding_ids) expect(ids.has(id), `${p.id} → ${id}`).toBe(true);
      expect(
        p.acceptance_criteria.some((a) => /evaluates PASS on retest/.test(a)),
        p.id
      ).toBe(true);
      expect(p.verification_command).toMatch(/product-check retest --baseline/);
      expect(r.blueprint.remediations.some((x) => x.id === p.remediation_id)).toBe(true);
    }
    for (const t of r.blueprint.traceability) expect(ids.has(t.finding_id)).toBe(true);
  });

  it("no packet is VERIFIED without a retest observing the control", () => {
    for (const r of [baselineDemo(), retestDemo()]) {
      for (const p of r.blueprint.work_packets.filter((x) => x.status === "VERIFIED")) {
        expect(r.run.baseline).not.toBeNull();
        const rem = r.blueprint.remediations.find((x) => x.id === p.remediation_id);
        expect(rem?.verification.verified_in_run).toBe(r.run.run_id);
      }
    }
    expect(baselineDemo().blueprint.work_packets.every((p) => p.status === "PROPOSED")).toBe(true);
  });
});

describe("A8 dashboard figures are derived from the results JSON", () => {
  it("shows the JSON's scores and flags a hand-edited score", () => {
    const r = retestDemo();
    const html = renderDashboard(r, { branding: false });
    for (const p of ["customer", "technology", "trust"] as const)
      expect(html).toContain(`score ${r.scorecard.pillars[p].score ?? ""} of 100`);
    expect(html).not.toContain("Integrity check failed");
    const patched = structuredClone(r);
    patched.scorecard.pillars.trust.score = 100;
    const bad = renderDashboard(patched, { branding: false });
    expect(bad).toContain("Integrity check failed");
    expect(bad).toContain("Trust score 100 of 100");
  });

  it("the committed dashboards equal a fresh rendering of the committed JSON", () => {
    for (const which of ["baseline", "retest"]) {
      const r = readJson<Results>(join(DEMO, `output/${which}/product-check-results.json`));
      const committed = readFileSync(join(DEMO, `output/${which}/dashboard.html`), "utf8");
      expect(renderDashboard(r, { branding: true })).toBe(committed);
    }
  });

  it("an unscored pillar is shown as unknown, never as a pass", () => {
    const r = structuredClone(retestDemo());
    r.scorecard.pillars.customer.score = null;
    r.scorecard.pillars.customer.state = "INSUFFICIENT_EVIDENCE";
    const html = renderDashboard(r, { branding: false });
    expect(html).toContain("Customer not scored: insufficient evidence");
    expect(html).toContain("track unknown");
  });
});

describe("A9 unsafe scan requests are rejected or need explicit, scoped authorization", () => {
  it("refuses a URL scan without authorization and writes an ABORTED record", async () => {
    const dir = tempFiles({});
    const r = await cli(["run", "--url", "https://example.invalid", "--mode", "APPLICATION"], dir);
    expect(r.code).toBe(4);
    expect(r.stderr).toMatch(/refused/);
    const aborted = readJson<Results>(join(dir, ".product-check/product-check-results.json"));
    expect(aborted.run.status).toBe("ABORTED");
    expect(aborted.run.network.used).toBe(false);
    expect(aborted.verdict.verdict).toBe("INCONCLUSIVE");
    expect(checkResults(aborted).errors).toEqual([]);
  });

  it.each([
    [
      "prohibited action",
      { authorization: { authorized_actions: ["read-local-source", "destructive-test"] } },
      [],
    ],
    ["lifted prohibition", { authorization: { prohibited_actions: ["payment-flow"] } }, []],
    [
      "network without --allow-network",
      {
        target: { name: "x", application: { url: "https://example.invalid" } },
        authorization: {
          authorized_actions: ["passive-http"],
          scope: { origins: ["https://example.invalid"] },
          attestation: {
            statement: "I own this site and may test it.",
            authorized_by: "me",
            date: "2026-10-01",
          },
        },
      },
      [],
    ],
    [
      "origin outside scope",
      {
        target: { name: "x", application: { url: "https://example.invalid" } },
        authorization: {
          authorized_actions: ["passive-http"],
          scope: { origins: ["https://other.invalid"] },
          attestation: {
            statement: "I own this site and may test it.",
            authorized_by: "me",
            date: "2026-10-01",
          },
        },
      },
      ["--allow-network"],
    ],
    [
      "no attestation",
      {
        target: { name: "x", application: { url: "https://example.invalid" } },
        authorization: {
          authorized_actions: ["passive-http"],
          scope: { origins: ["https://example.invalid"] },
        },
      },
      ["--allow-network"],
    ],
    [
      "exposure probe alone",
      {
        target: { name: "x", application: { url: "https://example.invalid" } },
        authorization: {
          authorized_actions: ["exposure-probe"],
          scope: { origins: ["https://example.invalid"] },
        },
      },
      ["--allow-network"],
    ],
  ])("refuses: %s", async (_name, contract, flags) => {
    const dir = tempFiles({ "c.json": { target: { name: "x", repository: { path: "." } }, ...contract } });
    const r = await cli(["run", "--contract", "c.json", ...(flags as string[]), "--json"], dir);
    expect(r.code, r.stderr).toBe(4);
  });

  it("refuses credentials in the URL", async () => {
    const r = await cli(
      ["run", "--url", "https://user:pw@example.invalid", "--authorize", "passive-http", "--json"],
      tempFiles({})
    );
    expect(r.code).toBe(4);
  });

  it("an unknown action in a contract is rejected as invalid", async () => {
    const dir = tempFiles({
      "c.json": {
        target: { name: "x", repository: { path: "." } },
        authorization: { authorized_actions: ["port-scan"] },
      },
    });
    expect((await cli(["run", "--contract", "c.json", "--json"], dir)).code).toBe(2);
  });
});

describe("A10 the documented demo works locally from a fresh clone", () => {
  const hasGit = spawnSync("git", ["--version"]).status === 0;
  it.skipIf(!hasGit)(
    "regenerating the app and re-running the documented offline commands reproduces the committed outputs",
    async () => {
      const work = mkdtempSync(join(tmpdir(), "product-check-demo-"));
      try {
        cpSync(join(DEMO, "scan-contract.json"), join(work, "scan-contract.json"));
        cpSync(join(DEMO, "inputs"), join(work, "inputs"), { recursive: true });
        const gen = (args: string[]) =>
          spawnSync(process.execPath, [join(DEMO, "create-app.mjs"), "--dir", join(work, "app"), ...args], {
            encoding: "utf8",
          });
        expect(gen([]).status).toBe(0);
        const base = await cli(
          [
            "run",
            "--contract",
            "scan-contract.json",
            "--observations",
            "inputs/observations-baseline.json",
            "--out-dir",
            "output/baseline",
            "--quiet",
          ],
          work,
          new Date(1791972000 * 1000)
        );
        expect(base.code, base.stderr).toBe(0);
        expect(gen(["--remediate"]).status).toBe(0);
        const re = await cli(
          [
            "retest",
            "--contract",
            "scan-contract.json",
            "--observations",
            "inputs/observations-remediated.json",
            "--test-results",
            "inputs/test-results-remediated.xml",
            "--baseline",
            "output/baseline/product-check-results.json",
            "--out-dir",
            "output/retest",
            "--quiet",
          ],
          work,
          new Date(1792058400 * 1000)
        );
        expect(re.code, re.stderr).toBe(0);
        for (const which of ["baseline", "retest"]) {
          const fresh = readJson<Results>(join(work, `output/${which}/product-check-results.json`));
          const committed = readJson<Results>(join(DEMO, `output/${which}/product-check-results.json`));
          fresh.run.node_version = committed.run.node_version;
          if (which === "retest") {
            // The baseline hash differs only because the committed baseline file has a normalized node_version.
            expect(fresh.run.baseline?.run_id).toBe(committed.run.baseline?.run_id);
            fresh.run.baseline = committed.run.baseline;
            fresh.comparison =
              fresh.comparison && committed.comparison
                ? { ...fresh.comparison, baseline_sha256: committed.comparison.baseline_sha256 }
                : fresh.comparison;
            for (const e of fresh.evidence)
              if (e.kind === "baseline-comparison")
                e.checksum = committed.evidence.find((c) => c.id === e.id)?.checksum ?? e.checksum;
          }
          expect(fresh.verdict).toEqual(committed.verdict);
          expect(fresh.scorecard).toEqual(committed.scorecard);
          expect(fresh.findings.map((f) => [f.id, f.status, f.lifecycle])).toEqual(
            committed.findings.map((f) => [f.id, f.status, f.lifecycle])
          );
          expect(readFileSync(join(work, `output/${which}/report.md`), "utf8")).toBe(
            readFileSync(join(DEMO, `output/${which}/report.md`), "utf8")
          );
        }
        expect(existsSync(join(work, "output/retest/dashboard.html"))).toBe(true);
        const spec = await cli(
          ["spec", "--contract", "scan-contract.json", "--out-dir", "output/as-built", "--quiet"],
          work,
          new Date(1792058400 * 1000)
        );
        expect(spec.code, spec.stderr).toBe(0);
        for (const file of ["as-built-spec.json", "specs/000-as-built/spec.md"])
          expect(readFileSync(join(work, `output/as-built/${file}`), "utf8")).toBe(
            readFileSync(join(DEMO, `output/as-built/${file}`), "utf8")
          );
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
  );
});

describe("CT-T6 continuous assurance: release-to-release regression", () => {
  it("a control that regresses from PASS opens a PC-T-16 finding; a clean retest passes it", async () => {
    const dir = tempFiles(cleanRepo());
    commitAll(dir);
    const base = await runJson(dir, ["--repo", ".", "--stage", "PRODUCTION_SCALE"]);
    expect(statusOf(base, "PC-T-16")).toBe("NOT_TESTED");
    expect(statusOf(base, "PC-C-04")).toBe("PASS");
    writeFileSync(join(dir, "base.json"), JSON.stringify(base));
    const same = await runJson(dir, [
      "--repo",
      ".",
      "--stage",
      "PRODUCTION_SCALE",
      "--baseline",
      "base.json",
    ]);
    expect(statusOf(same, "PC-T-16")).toBe("PASS");
    expect(same.history).toHaveLength(2);
    writeFileSync(
      join(dir, "app/page.tsx"),
      'export default function P() { return <img src="/a.png" />; }\n'
    );
    const worse = await runJson(dir, [
      "--repo",
      ".",
      "--stage",
      "PRODUCTION_SCALE",
      "--baseline",
      "base.json",
    ]);
    expect(statusOf(worse, "PC-T-16")).toBe("FAIL");
    expect(worse.comparison?.regressed_controls).toEqual(["PC-C-04"]);
    const regression = worse.findings.find((f) => f.control_id === "PC-T-16");
    expect(regression?.title).toMatch(/Regression/);
    expect(worse.evidence.some((e) => e.kind === "baseline-comparison")).toBe(true);
    expect(checkResults(worse).errors).toEqual([]);
    writeFileSync(join(dir, "worse.json"), JSON.stringify(worse));
    const fixed = await runJson(dir, [
      "--repo",
      ".",
      "--stage",
      "PRODUCTION_SCALE",
      "--baseline",
      "worse.json",
    ]);
    expect(fixed.findings.find((f) => f.id === regression?.id)?.status).toBe("RESOLVED");
    expect(fixed.history).toHaveLength(3);
    writeFileSync(
      join(dir, "app/page.tsx"),
      'export default function P() { return <img src="/a.png" alt="A" />; }\n'
    );
    const back = await runJson(dir, [
      "--repo",
      ".",
      "--stage",
      "PRODUCTION_SCALE",
      "--baseline",
      "worse.json",
    ]);
    expect(back.comparison?.improved_controls).toContain("PC-C-04");
    expect(back.comparison?.findings_resolved.length).toBeGreaterThan(0);
  });
});
