// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Unit tests: redaction, .gitignore matching, git index parsing, HTML facts, exposure signatures, test-result and
 * report importers, HAR conversion, secret rules, scoring arithmetic, verdict rules and tier mapping.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIndex, readGit } from "../src/discovery/git.js";
import { GitIgnore } from "../src/discovery/gitignore.js";
import { snapshotRepo } from "../src/discovery/repo.js";
import { harToObservations } from "../src/importers/har.js";
import {
  parseImpactCheck,
  parseNpmAudit,
  parseOutcomeCheck,
  parseSpecCheck,
} from "../src/importers/reports.js";
import { isEndToEnd, parseJestJson, parseJUnit, parseTestResults } from "../src/importers/tests.js";
import {
  exposureSignature,
  htmlFacts,
  keepHeaders,
  redactSetCookie,
} from "../src/inspectors/http/observe.js";
import { code, html, md } from "../src/reporting/escape.js";
import { SchemaRegistry } from "../src/schema/validator.js";
import { computeScorecard } from "../src/scoring/score.js";
import { computeVerdict } from "../src/scoring/verdict.js";
import type { Finding, Validation } from "../src/types.js";
import { redact, redactWithRules } from "../src/util/redact.js";
import { relativize } from "../src/util/paths.js";
import { SECRET_RULES } from "../src/validation/source-evaluators.js";
import { appliedTiers, primaryTier, verdictAlias } from "../src/validation/tiers.js";
import { commitAll, DEMO, FAKE, git, tempFiles } from "./helpers.js";

describe("redaction", () => {
  it("masks tokens and secret assignments and reports the rules", () => {
    const r = redactWithRules(
      `STRIPE_SECRET_KEY=${FAKE.stripeLive} and ${FAKE.aws} and postgres://u:hunter2pass@db.example/x`
    );
    expect(r.text).not.toContain(FAKE.stripeLive);
    expect(r.text).not.toContain(FAKE.aws);
    expect(r.text).not.toContain("hunter2pass");
    expect(r.rules).toEqual(expect.arrayContaining(["stripe-key", "aws-access-key", "url-credentials"]));
    expect(redact("nothing secret here")).toBe("nothing secret here");
    expect(redact('password: "correct-horse-battery"')).toBe('password: "[REDACTED]"');
  });
});

describe("escaping", () => {
  it("neutralizes markup in Markdown and HTML", () => {
    expect(html('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(md("<img src=x onerror=alert(1)> @team | # x")).toBe(
      "\\<img src=x onerror=alert(1)\\> @\u200bteam \\| \\# x"
    );
    expect(code("a`b|c")).toBe("``a`b\\|c``");
    expect(html("a\u202eb")).toBe("a\\u202eb");
  });
});

describe(".gitignore matching", () => {
  it("handles negation, anchoring, directories and globs", () => {
    const g = new GitIgnore();
    g.add("", "node_modules\n.env*\n!.env.example\n/build\nlogs/\n**/secret-*.txt\n# comment\n");
    g.add("pkg", "*.local\n");
    expect(g.ignores(".env")).toBe(true);
    expect(g.ignores(".env.local")).toBe(true);
    expect(g.ignores(".env.example")).toBe(false);
    expect(g.ignores("sub/.env")).toBe(true);
    expect(g.ignores("build/x.js")).toBe(true);
    expect(g.ignores("src/build/x.js")).toBe(false);
    expect(g.ignores("logs/a.log")).toBe(true);
    expect(g.ignores("a/b/secret-1.txt")).toBe(true);
    expect(g.ignores("pkg/x.local")).toBe(true);
    expect(g.ignores("x.local")).toBe(false);
    expect(g.size).toBe(7);
  });
});

describe("git metadata without running git", () => {
  it("reads HEAD, the branch ref and the index of a real repository", () => {
    const dir = tempFiles({ "a.txt": "a", "dir/b.txt": "b", "untracked.txt": "u" });
    const sha = commitAll(dir, ["a.txt", "dir/b.txt"]);
    const info = readGit(dir);
    expect(info.commit).toBe(sha);
    expect(info.ref).toBe("refs/heads/main");
    expect([...(info.tracked ?? [])].sort()).toEqual(["a.txt", "dir/b.txt"]);
  });

  it("parses index v4 (prefix-compressed paths) and packed refs", () => {
    const dir = tempFiles({ "aaa/one.txt": "1", "aaa/two.txt": "2", "bbb.txt": "3" });
    git(dir, "init", "-q");
    git(dir, "-c", "index.version=4", "add", "-A");
    git(dir, "commit", "-q", "-m", "x");
    git(dir, "pack-refs", "--all");
    const info = readGit(dir);
    expect([...(info.tracked ?? [])].sort()).toEqual(["aaa/one.txt", "aaa/two.txt", "bbb.txt"]);
    expect(info.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(parseIndex(Buffer.from("not an index"))).toBeNull();
  });

  it("reports no git and never reads ignored files", () => {
    const dir = tempFiles({ ".gitignore": ".env\n", ".env": `KEY=${FAKE.stripeLive}`, "a.ts": "x" });
    const snap = snapshotRepo(dir, 100);
    expect(snap.git.present).toBe(false);
    const env = snap.byPath.get(".env");
    expect(env?.ignored).toBe(true);
    expect(env?.text).toBeNull();
    expect(snap.limitations.map((l) => l.code)).toEqual(
      expect.arrayContaining(["ignored-not-read", "no-git"])
    );
  });

  it("respects the file cap and skips symlinks", async () => {
    const { symlinkSync } = await import("node:fs");
    const dir = tempFiles({ "a.ts": "1", "b.ts": "2", "c.ts": "3" });
    symlinkSync(join(dir, "a.ts"), join(dir, "link.ts"));
    expect(snapshotRepo(dir, 10).limitations.map((l) => l.code)).toContain("symlink-skipped");
    const snap = snapshotRepo(dir, 2);
    expect(snap.files).toHaveLength(2);
    expect(snap.limitations.map((l) => l.code)).toContain("file-cap");
  });
});

describe("observations", () => {
  it("extracts page facts", () => {
    const f = htmlFacts(
      '<html lang="en"><head><title> Hi &amp; bye </title><meta name="viewport" content="x"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body><img src=a><img src=b alt=""><a href="/legal/privacy">P</a></body></html>'
    );
    expect(f).toEqual({
      title: "Hi & bye",
      lang: "en",
      has_viewport: true,
      meta_csp: "default-src 'self'",
      img_total: 2,
      img_missing_alt: 1,
      privacy_link: "/legal/privacy",
    });
    expect(htmlFacts("<p>x</p>").title).toBeNull();
  });

  it("keeps only allowlisted headers and redacts cookie values", () => {
    const h = keepHeaders([
      ["Server", "nginx/1.2"],
      ["Authorization", "Bearer x"],
      ["Set-Cookie", "sid=abc; Secure"],
      ["set-cookie", "x=1"],
    ]);
    expect(h).toEqual({ server: "nginx/1.2", "set-cookie": "sid=[REDACTED]; Secure\nx=[REDACTED]" });
    expect(redactSetCookie("a=b; HttpOnly")).toBe("a=[REDACTED]; HttpOnly");
  });

  it("recognizes exposed files only from content, never from status alone", () => {
    expect(exposureSignature("/.env", 200, "text/plain", "API_KEY=1\n").looks_sensitive).toBe(true);
    expect(exposureSignature("/.env", 200, "text/html", "<html>").looks_sensitive).toBe(false);
    expect(exposureSignature("/.env", 404, "text/plain", "API_KEY=1").looks_sensitive).toBe(false);
    expect(exposureSignature("/.git/HEAD", 200, null, "ref: refs/heads/main").signature).toBe("git-head");
    expect(exposureSignature("/.git/config", 200, null, "[core]\n").signature).toBe("git-config");
    expect(exposureSignature("/.env", 200, null, "hello").looks_sensitive).toBe(false);
  });

  it("converts HAR entries for the scoped origin only, without request headers or bodies", () => {
    const har = {
      log: {
        entries: [
          {
            startedDateTime: "2026-10-01T00:00:00Z",
            request: {
              method: "GET",
              url: "https://app.example/",
              headers: [{ name: "Cookie", value: "s=1" }],
            },
            response: {
              status: 200,
              headers: [
                { name: "content-type", value: "text/html" },
                { name: "x-powered-by", value: "Express" },
              ],
              content: { mimeType: "text/html", text: "<html><title>T</title></html>" },
            },
            timings: { wait: 42.4 },
          },
          {
            request: { method: "GET", url: "https://cdn.other/x.js" },
            response: { status: 200, headers: [] },
          },
          {
            request: { method: "POST", url: "https://app.example/api" },
            response: { status: 200, headers: [] },
          },
        ],
      },
    };
    const set = harToObservations(har, "https://app.example", "x.har");
    expect(set.observations).toHaveLength(1);
    expect(set.observations[0]?.headers).toEqual({ "content-type": "text/html", "x-powered-by": "Express" });
    expect(set.observations[0]?.timing_ms).toBe(42);
    expect(JSON.stringify(set)).not.toContain("s=1");
    expect(() => harToObservations({}, "https://app.example", "x.har")).toThrow(/not a HAR/);
  });
});

describe("test-result importers", () => {
  it("parses JUnit with suites, top-level cases, failures and skips", () => {
    const run = parseJUnit(
      `<testsuites><testsuite name="s" file="tests/e2e/a.spec.ts"><testcase name="ok" classname="A"/><testcase name="bad" classname="A"><failure message="x"/></testcase><testcase name="skip"><skipped/></testcase></testsuite><testcase name="top" failure="test failed"/></testsuites>`,
      "r.xml",
      "0".repeat(64)
    );
    expect(run.cases.map((c) => [c.name, c.status])).toEqual([
      ["A › ok", "passed"],
      ["A › bad", "failed"],
      ["skip", "skipped"],
      ["top", "failed"],
    ]);
    expect(run.cases[0]?.file).toBe("tests/e2e/a.spec.ts");
    expect(isEndToEnd(run.cases[0] as never)).toBe(true);
    expect(() => parseJUnit("<x/>", "r.xml", "")).toThrow(/JUnit/);
  });

  it("parses Jest/Vitest JSON and detects the format", () => {
    const json = {
      testResults: [
        {
          name: "/r/a.test.ts",
          assertionResults: [
            { fullName: "a works", status: "passed" },
            { title: "b", status: "failed" },
            { title: "c", status: "pending" },
          ],
        },
        { name: "/r/b.test.ts", status: "failed", assertionResults: [] },
      ],
    };
    const run = parseJestJson(json, "j.json", "");
    expect(run.cases.map((c) => c.status)).toEqual(["passed", "failed", "skipped", "failed"]);
    expect(parseTestResults(JSON.stringify(json), "j.json", "").format).toBe("jest-json");
    expect(() => parseTestResults("{}", "j.json", "")).toThrow(/Jest/);
    expect(() => parseTestResults("nope", "j.json", "")).toThrow(/neither/);
  });

  it("imports npm audit and sibling Commons reports, rejecting unknown versions", () => {
    expect(
      parseNpmAudit(
        {
          metadata: { vulnerabilities: { critical: 1, high: 2, moderate: 0, low: 3 } },
          vulnerabilities: { lodash: { severity: "high" } },
        },
        "a"
      )
    ).toEqual({
      critical: 1,
      high: 2,
      moderate: 0,
      low: 3,
      packages: [{ name: "lodash", severity: "high" }],
    });
    expect(() => parseNpmAudit({}, "a")).toThrow(/npm audit/);
    expect(
      parseSpecCheck(
        {
          schema_version: "1.0",
          findings: [{ severity: "high" }, { severity: "medium" }],
          requirements: [{}, {}],
        },
        "s"
      )
    ).toEqual({ high: 1, medium: 1, requirements: 2 });
    expect(() => parseSpecCheck({ schema_version: "2.0" }, "s")).toThrow(/Spec Check/);
    expect(
      parseImpactCheck(
        {
          schema_version: "2.0",
          findings: [{ severity: "high" }],
          affected_modules: [1, 2],
          test_candidates: [],
          repo_revision: { commit: "abc" },
        },
        "i"
      )
    ).toEqual({ high: 1, findings: 1, affected_modules: 2, test_candidates: 0, commit: "abc" });
    expect(() => parseImpactCheck({ schema_version: "1.0" }, "i")).toThrow(/Impact Check/);
    expect(
      parseOutcomeCheck(
        {
          schema_version: "1.0",
          metrics: [
            { id: "ci_first_pass_rate", segments: { all: { value: 0.8 } } },
            { id: "revert_rate", segments: { all: { numerator: 2 } } },
          ],
        },
        "o"
      )
    ).toEqual({ ci_first_pass_rate: 0.8, reverted_prs: 2 });
    expect(() => parseOutcomeCheck({}, "o")).toThrow(/Outcome Check/);
  });
});

describe("secret rules", () => {
  const hits = (text: string): string[] =>
    SECRET_RULES.flatMap((r) => {
      r.re.lastIndex = 0;
      return [...text.matchAll(r.re)]
        .filter((m) => (r.check ? r.check(m[0]) : r.severity) !== null)
        .map(() => r.name);
    });
  it("finds real credential formats", () => {
    expect(hits(FAKE.stripeLive)).toEqual(["stripe-secret-key"]);
    expect(hits(FAKE.aws)).toEqual(["aws-access-key"]);
    expect(hits(FAKE.jwt("service_role"))).toEqual(["service-role-jwt"]);
    expect(hits("postgres://admin:Xk29fjQ8@db.prod.example:5432/app")).toEqual(["url-credentials"]);
    expect(hits('const API_KEY = "Zx81kQp02LmNvBc7Hy4T"')).toEqual(["hardcoded-secret-assignment"]);
  });
  it("ignores public keys, placeholders and local dev defaults", () => {
    expect(hits(FAKE.jwt("anon"))).toEqual([]);
    expect(hits("postgres://postgres:postgres@localhost:5432/db")).toEqual([]);
    expect(hits('const API_KEY = "your-api-key-goes-here-123"')).toEqual([]);
    expect(hits('const TOKEN_KEY = "auth_token_storage_key"')).toEqual([]);
    expect(SECRET_RULES.find((r) => r.name === "stripe-secret-key")?.check?.(FAKE.stripeTest)).toBe("P2");
  });
});

/** A validation for scoring tests. */
const v = (
  id: string,
  pillar: Validation["pillar"],
  status: Validation["status"],
  weight: 1 | 2 | 3,
  strength: Validation["strength"] = "static",
  gate: string | null = null
): Validation => ({
  id: `VAL-${id}`,
  control_id: id,
  pillar,
  tier: "CT-T1",
  title: id,
  expected: "",
  actual: "",
  status,
  method: "static-analysis",
  strength: status === "PASS" || status === "PARTIAL" || status === "FAIL" ? strength : null,
  reason: null,
  evidence_ids: [],
  reproduction: [],
  hard_gate: gate,
  weight,
  finding_ids: [],
});

describe("scoring arithmetic (hand-computed)", () => {
  const params = { min_coverage: 0.5, pillar_threshold: 70 };
  it("weights, partial credit, coverage and withholding", () => {
    const vs = [
      v("PC-C-01", "customer", "PASS", 2),
      v("PC-C-02", "customer", "PARTIAL", 1),
      v("PC-C-03", "customer", "FAIL", 1),
      v("PC-C-04", "customer", "NOT_TESTED", 2),
      v("PC-C-05", "customer", "NOT_APPLICABLE", 3),
      v("PC-T-01", "technology", "PASS", 2),
      v("PC-T-02", "technology", "BLOCKED", 3),
    ];
    const sc = computeScorecard(vs, [], params, null);
    // customer: checked weight 4 of applicable 6 → coverage 0.6667; score (2*1 + 1*0.5 + 0) / 4 = 62.5 → 63
    expect(sc.pillars.customer.coverage).toBe(0.6667);
    expect(sc.pillars.customer.score).toBe(63);
    expect(sc.pillars.customer.confidence).toBe("MEDIUM");
    // technology: one checked control → withheld
    expect(sc.pillars.technology.score).toBeNull();
    expect(sc.pillars.technology.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(sc.pillars.trust.confidence).toBe("NONE");
    expect(sc.overall_coverage).toBe(0.5455);
    expect(sc.blocked_controls).toEqual(["PC-T-02"]);
  });
  it("caps for open P1 and confidence needs strong evidence", () => {
    const vs = [
      v("PC-S-01", "trust", "PASS", 3, "runtime"),
      v("PC-S-02", "trust", "PASS", 3, "runtime"),
      v("PC-S-03", "trust", "FAIL", 1, "runtime"),
    ];
    const p1 = { id: "PCF-0000000001", pillar: "trust", severity: "P1", status: "OPEN" } as Finding;
    const sc = computeScorecard(vs, [p1], params, {
      run_id: "PCR-20260101T000000Z-AAAAAA",
      finished_at: "",
      revision: null,
      verdict: "NOT_READY",
      scores: { customer: null, technology: null, trust: 50 },
      coverage: { customer: 0, technology: 0, trust: 1 },
      open_findings: 1,
    });
    expect(sc.pillars.trust.score).toBe(59);
    expect(sc.pillars.trust.cap.reason).toMatch(/P1/);
    expect(sc.pillars.trust.confidence).toBe("HIGH");
    expect(sc.pillars.trust.trend).toEqual({
      previous_score: 50,
      delta: 9,
      previous_run_id: "PCR-20260101T000000Z-AAAAAA",
    });
  });
  it("verdict rules", () => {
    const bounds = { repository: null, application: null, finishedAt: "x" };
    const all = (status: Validation["status"]) => [
      v("PC-C-01", "customer", "PASS", 2, "runtime"),
      v("PC-C-02", "customer", "PASS", 2, "runtime"),
      v("PC-T-01", "technology", "PASS", 2, "runtime"),
      v("PC-T-02", "technology", "PASS", 2, "runtime"),
      v("PC-S-01", "trust", status, 3, "runtime", "G-SECRETS"),
      v("PC-S-02", "trust", "PASS", 3, "runtime"),
    ];
    const ready = computeScorecard(all("PASS"), [], params, null);
    expect(computeVerdict(ready, [], all("PASS"), "CT-T1", null, [], [], bounds).verdict).toBe("READY");
    const unverified = computeScorecard(all("NOT_TESTED"), [], params, null);
    const inc = computeVerdict(unverified, [], all("NOT_TESTED"), "CT-T1", null, [], [], bounds);
    expect(inc.verdict).toBe("INCONCLUSIVE");
    expect(inc.not_verified).toEqual(["PC-S-01"]);
    const p2 = [{ id: "PCF-0000000002", pillar: "customer", severity: "P2", status: "OPEN" } as Finding];
    expect(
      computeVerdict(
        computeScorecard(all("PASS"), p2, params, null),
        p2,
        all("PASS"),
        "CT-T3",
        null,
        [],
        [],
        bounds
      )
    ).toMatchObject({ verdict: "READY_WITH_CONDITIONS", tier_alias: "GO WITH ACCEPTED RISK" });
  });
});

describe("tiers", () => {
  it("maps stages to tiers with carry-forward and aliases", () => {
    expect(primaryTier("ALPHA", null)).toBe("CT-T1");
    expect(primaryTier("ALPHA", ["CT-T0", "CT-T3"])).toBe("CT-T3");
    expect(appliedTiers("CT-T2")).toEqual(["CT-T0", "CT-T1", "CT-T2"]);
    expect(verdictAlias("CT-T3", "NOT_READY")).toBe("NO-GO");
  });
});

describe("built-in schema validator", () => {
  it("rejects unsupported keywords and unresolvable references", () => {
    const reg = new SchemaRegistry();
    expect(() => reg.add({ $id: "https://x/a.json", patternProperties: {} })).toThrow(/unsupported keyword/);
    reg.add({ $id: "https://x/b.json", $ref: "missing.json" });
    expect(() => reg.validate("https://x/b.json", 1)).toThrow(/unresolvable/);
    reg.add({
      $id: "https://x/c.json",
      type: "array",
      uniqueItems: true,
      items: { oneOf: [{ type: "integer" }, { type: "string", minLength: 2 }] },
      minItems: 1,
    });
    expect(reg.validate("https://x/c.json", [1, "ab"])).toEqual([]);
    expect(reg.validate("https://x/c.json", [1, 1]).length).toBeGreaterThan(0);
    expect(reg.validate("https://x/c.json", ["a"]).length).toBeGreaterThan(0);
    expect(reg.validate("https://x/c.json", []).length).toBeGreaterThan(0);
  });
});

describe("paths", () => {
  it("makes absolute paths under the base relative", () => {
    expect(relativize({ a: "/base/x/y", b: ["/base"], c: "/elsewhere" }, "/base")).toEqual({
      a: "x/y",
      b: ["."],
      c: "/elsewhere",
    });
  });
});

describe("observations fixture sanity", () => {
  it("the committed demo inputs contain no request headers or bodies", () => {
    const text = readFileSync(join(DEMO, "inputs/observations-baseline.json"), "utf8");
    expect(text).not.toMatch(/authorization|"cookie"|user-agent/i);
    expect(text).not.toContain("STRIPE_SECRET_KEY");
  });
});
