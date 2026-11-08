// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * CT3 v3.2 vibe-code review and verified closure: unit tests for every module and end-to-end fixtures (M5):
 * insecure sample app, documentation-only PR, faulty patch that passes superficial tests, correct fix, regression,
 * missing access, dangerous auth change, false-positive reviewer claims, stale approvals, cycle-limit escalation.
 * Secret-like strings are assembled at run time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  generateApproverKeys,
  signApproval,
  tallyApprovals,
  unsignedClaim,
} from "../src/assurance/approvals.js";
import { splitCommand } from "../src/assurance/cli.js";
import { renderAssuranceDashboard } from "../src/assurance/dashboard.js";
import { parseUnifiedDiff } from "../src/assurance/diff.js";
import { EvidenceLog, readLog, verifyLog } from "../src/assurance/evidence-log.js";
import { fileHits, lineHits } from "../src/assurance/lanes.js";
import { defaultPolicy, parsePolicy } from "../src/assurance/policy.js";
import { checkRegister, manualTransition } from "../src/assurance/register.js";
import { classifyRisk } from "../src/assurance/risk.js";
import type {
  Approval,
  AssurancePolicy,
  ChangeReview,
  ClosureRegister,
  FixPacket,
  ReleaseGate,
  VerificationRun,
} from "../src/assurance/types.js";
import { canonicalJson, globToRegExp } from "../src/assurance/util.js";
import { execCommand } from "../src/exec/process.js";
import { validateAgainst } from "../src/schema/registry.js";
import type { Results } from "../src/types.js";
import { cli, FAKE, git, readJson, ROOT, tempFiles } from "./helpers.js";

const NOW = new Date("2026-10-12T09:00:00.000Z");

// ---------------------------------------------------------------------------------------------------------------
// Fixture: "Vibe Invoices", a deliberately weak app.

function insecureApp(): Record<string, string | object> {
  return {
    "package.json": {
      name: "vibe-invoices",
      private: true,
      scripts: { test: "node --test" },
      dependencies: { next: "15.0.0", react: "19.0.0" },
    },
    ".gitignore": "node_modules\n.env*\n.product-check/\nkeys/\n",
    "README.md": "# Vibe Invoices\n\nRun `npm test`.\n",
    "app/checkout/page.tsx": `const STRIPE_SECRET_KEY = "${FAKE.stripeLive}";\nexport default function Checkout() { return <button data-n={STRIPE_SECRET_KEY.length}>Pay</button>; }\n`,
    "app/api/invoices/route.ts":
      'import { requireAuth } from "../../lib/auth";\nexport async function GET(req) {\n  const user = await requireAuth(req);\n  return Response.json(await db.invoice.findMany({ where: { userId: user.id } }));\n}\n',
    "test/total.test.mjs":
      'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("total", () => { assert.equal([1, 2].reduce((a, b) => a + b, 0), 3); });\n',
  };
}

const commit = (dir: string, msg: string): string => {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
};
const write = (dir: string, path: string, text: string): void => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};

/** Creates the fixture repo, keys and a policy outside the repo. */
function setup(policyExtra: Partial<AssurancePolicy> & { risk?: Partial<AssurancePolicy["risk"]> } = {}): {
  dir: string;
  ops: string;
  base: string;
  keys: Record<string, string>;
} {
  const dir = tempFiles(insecureApp());
  git(dir, "init", "-q");
  const base = commit(dir, "baseline");
  const ops = tempFiles({});
  const keys: Record<string, string> = {};
  const approvers = ["alice", "bob"].map((id) => {
    const k = generateApproverKeys();
    writeFileSync(join(ops, `${id}.key.pem`), k.privateKey);
    keys[id] = join(ops, `${id}.key.pem`);
    return { id, type: "human", roles: ["eng"], public_key: k.publicKey };
  });
  const botKey = generateApproverKeys();
  writeFileSync(join(ops, "bot.key.pem"), botKey.privateKey);
  keys["review-bot"] = join(ops, "bot.key.pem");
  approvers.push({ id: "review-bot", type: "bot", roles: [], public_key: botKey.publicKey });
  const policy = {
    schema_version: "0.1.0",
    kind: "assurance-policy",
    policy_id: "fixture",
    required_checks: [
      { id: "unit", argv: [process.execPath, "--test"], purpose: "test", timeout_ms: 60_000 },
    ],
    approvers,
    ...policyExtra,
    risk: {
      protected_paths: [{ pattern: "app/lib/auth*", owners: ["bob"] }],
      trusted_authors: ["t@example.invalid"],
      allow_low_risk_waiver: true,
      ...(policyExtra.risk ?? {}),
    },
    release: { rollback_plan: "docs/rollback.md", staged_rollout: null },
  };
  writeFileSync(join(ops, "policy.json"), JSON.stringify(policy, null, 2));
  return { dir, ops, base, keys };
}

const pc = async (dir: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
  cli(args, dir, NOW);
const reg = (dir: string): ClosureRegister =>
  readJson<ClosureRegister>(join(dir, ".product-check", "closure-register.json"));
const entry = (dir: string, id: string) => reg(dir).entries.find((e) => e.finding_id === id)!;

async function baseline(dir: string): Promise<void> {
  expect((await pc(dir, ["run", "--repo", ".", "--out-dir", ".product-check", "--quiet"])).code).toBe(0);
  const r = await pc(dir, ["register", "--repo", "."]);
  expect(r.code, r.stderr).toBe(0);
}

/** The finding ID of the committed client-side Stripe key (PC-S-01, P0). */
const secretFinding = (dir: string): string =>
  reg(dir).entries.find((e) => e.rule_or_control === "PC-S-01" && e.severity === "P0")!.finding_id;

// ---------------------------------------------------------------------------------------------------------------

describe("units", () => {
  it("parses unified diffs: added, deleted, renamed, binary, line numbers", () => {
    const d = parseUnifiedDiff(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1..2 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,3 +1,3 @@",
        " keep",
        "-old()",
        "+neu()",
        " keep",
        "diff --git a/new.md b/new.md",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new.md",
        "@@ -0,0 +1 @@",
        "+hello",
        "diff --git a/old.txt b/renamed.txt",
        "similarity index 100%",
        "rename from old.txt",
        "rename to renamed.txt",
        "diff --git a/img.png b/img.png",
        "Binary files a/img.png and b/img.png differ",
        "diff --git a/gone.ts b/gone.ts",
        "deleted file mode 100644",
        "--- a/gone.ts",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-bye",
      ].join("\n")
    );
    expect(d.map((f) => [f.path, f.status])).toEqual([
      ["src/a.ts", "modified"],
      ["new.md", "added"],
      ["renamed.txt", "renamed"],
      ["img.png", "binary"],
      ["gone.ts", "deleted"],
    ]);
    expect(d[0]!.lines).toEqual([
      { kind: "del", line: 2, text: "old()" },
      { kind: "add", line: 2, text: "neu()" },
    ]);
    expect(d[2]!.previous_path).toBe("old.txt");
  });

  it("matches globs and splits commands without a shell", () => {
    expect(globToRegExp("src/auth/**").test("src/auth/a/b.ts")).toBe(true);
    expect(globToRegExp("app/lib/auth*").test("app/lib/auth.ts")).toBe(true);
    expect(globToRegExp("*.md").test("docs/a.md")).toBe(false);
    expect(splitCommand(`node --test "a b.mjs" 'c' $(rm -rf /)`)).toEqual([
      "node",
      "--test",
      "a b.mjs",
      "c",
      "$(rm",
      "-rf",
      "/)",
    ]);
    expect(() => splitCommand('node "unterminated')).toThrow(/Unterminated/);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it("classifies risk by impacted surface, not author; UNDETERMINED behaves as HIGH", () => {
    const p = defaultPolicy();
    p.risk.protected_paths = [{ pattern: "src/billing/**", owners: ["carol"] }];
    const f = (path: string, add = "x", status: "modified" | "binary" = "modified") => ({
      path,
      previous_path: null,
      status,
      lines: [{ kind: "add" as const, line: 1, text: add }],
      additions: 1,
      deletions: 0,
    });
    expect(classifyRisk([f("README.md"), f("docs/x.md")], p, null).risk.level).toBe("LOW");
    expect(classifyRisk([f("src/util/format.ts")], p, null).risk.level).toBe("MEDIUM");
    const auth = classifyRisk([f("src/server/session.ts")], p, null);
    expect(auth.risk.level).toBe("HIGH");
    expect(auth.risk.surfaces).toContain("auth");
    expect(classifyRisk([f("src/x.ts", "const s = await getServerSession()")], p, null).risk.level).toBe(
      "HIGH"
    );
    const prot = classifyRisk([f("src/billing/plan.ts")], p, null);
    expect(prot.owners).toEqual(["carol"]);
    const bin = classifyRisk([f("logo.png", "", "binary")], p, null);
    expect(bin.risk.level).toBe("UNDETERMINED");
    expect(bin.risk.effective_level).toBe("HIGH");
    expect(classifyRisk([], p, null).risk.level).toBe("UNDETERMINED");
    expect(
      classifyRisk([f("src/util/format.ts")], p, {
        schema_version: "2.0",
        high: 1,
        affected_modules: 3,
        commit: null,
      }).risk.level
    ).toBe("HIGH");
  });

  it("lane rules catch vibe-coding failure modes", () => {
    const hits = (path: string, text: string) => lineHits(path, [{ line: 1, text }]).map((h) => h.rule_id);
    expect(hits("src/a.ts", `const k = "${FAKE.stripeLive}";`)).toContain("VC-TR-SECRET");
    expect(hits("src/a.tsx", "fetch(process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)")).toContain(
      "VC-TR-CLIENT-ENV"
    );
    expect(hits("src/a.ts", 'throw new Error("not implemented")')).toContain("VC-CR-STUB");
    expect(hits("src/a.ts", 'import { invoices } from "../mocks/invoices"')).toContain("VC-CR-MOCK-DATA");
    expect(hits("src/a.test.ts", "it.only('x', () => {})")).toContain("VC-CR-FOCUSED-TEST");
    expect(hits("src/a.ts", "https.request({ rejectUnauthorized: false })")).toContain("VC-TR-TLS-DISABLED");
    expect(hits("src/a.ts", "db.query(`SELECT * FROM t WHERE id = ${id}`)")).toContain("VC-TR-SQL-CONCAT");
    expect(hits("src/a.ts", "await stripe.paymentIntents.create({ amount })")).toContain(
      "VC-OP-NONIDEMPOTENT"
    );
    expect(
      hits("src/a.ts", "await stripe.paymentIntents.create({ amount }, { idempotencyKey })")
    ).not.toContain("VC-OP-NONIDEMPOTENT");
    expect(hits("src/a.tsx", '<img src="/x.png">')).toContain("VC-UX-IMG-ALT");
    expect(hits("src/a.test.ts", `const k = "${FAKE.stripeTest}";`)).not.toContain("VC-TR-SECRET");
    const mig = fileHits(
      {
        path: "db/migrations/002_drop.sql",
        previous_path: null,
        status: "added",
        lines: [{ kind: "add", line: 1, text: "ALTER TABLE invoices DROP COLUMN total;" }],
        additions: 1,
        deletions: 0,
      },
      null
    );
    expect(mig.map((h) => h.rule_id)).toContain("VC-OP-MIGRATION-NO-DOWN");
    const mockOnly = fileHits(
      {
        path: "test/a.test.ts",
        previous_path: null,
        status: "added",
        lines: [{ kind: "add", line: 1, text: "expect(sendMock).toHaveBeenCalled();" }],
        additions: 1,
        deletions: 0,
      },
      "it('x', () => { expect(sendMock).toHaveBeenCalled(); expect(true).toBe(true); });"
    );
    expect(mockOnly.map((h) => h.rule_id)).toContain("VC-CR-MOCK-ONLY-TEST");
  });

  it("approvals: only verified human signatures for the exact commit and scope count", () => {
    const alice = generateApproverKeys();
    const bot = generateApproverKeys();
    const mallory = generateApproverKeys();
    const policy = parsePolicy(
      {
        approvers: [
          { id: "alice", type: "human", roles: [], public_key: alice.publicKey },
          { id: "bot", type: "bot", roles: [], public_key: bot.publicKey },
        ],
      },
      "inline"
    );
    const sha = "a".repeat(40);
    const mk = (id: string, key: string, over: Partial<Approval> = {}): Approval =>
      signApproval(
        {
          approver: { id, type: "human" },
          scope: { type: "closure", ref: "F-001" },
          reviewed_sha: sha,
          decision: "approve",
          comment: "",
          created_at: NOW.toISOString(),
          ...over,
        },
        key
      );
    const want = { scopeType: "closure" as const, ref: "F-001", sha, excluded: [] as string[] };
    const status = (a: Approval, w = want) => tallyApprovals([a], policy, w, 1).evaluations[0]!.status;
    expect(status(mk("alice", alice.privateKey))).toBe("VALID");
    expect(status(mk("alice", mallory.privateKey))).toBe("INVALID_SIGNATURE");
    expect(status(mk("bot", bot.privateKey))).toBe("NOT_HUMAN");
    expect(status(mk("eve", mallory.privateKey))).toBe("UNKNOWN_APPROVER");
    expect(status(mk("alice", alice.privateKey), { ...want, sha: "b".repeat(40) })).toBe("STALE");
    expect(status(mk("alice", alice.privateKey), { ...want, excluded: ["alice"] })).toBe("SELF_APPROVAL");
    expect(status(mk("alice", alice.privateKey, { decision: "reject" }))).toBe("REJECTED");
    expect(
      status(
        unsignedClaim({
          approver: { id: "alice", type: "human" },
          scope: { type: "closure", ref: "F-001" },
          reviewed_sha: sha,
          decision: "approve",
          comment: "",
          created_at: NOW.toISOString(),
        })
      )
    ).toBe("UNSIGNED");
    const tampered = { ...mk("alice", alice.privateKey), reviewed_sha: "c".repeat(40) };
    expect(status(tampered, { ...want, sha: "c".repeat(40) })).toBe("INVALID_SIGNATURE");
    expect(tallyApprovals([mk("alice", alice.privateKey)], policy, want, 2).satisfied).toBe(false);
  });

  it("the evidence log is append-only and detects edits, removals and reordering", () => {
    const dir = tempFiles({});
    const path = join(dir, "log.jsonl");
    const log = new EvidenceLog(path, () => NOW);
    for (let i = 0; i < 3; i++)
      log.append({
        type: "command-execution",
        subject: `c${i}`,
        commit_sha: null,
        environment_id: null,
        summary: `run ${i} ${FAKE.stripeLive}`,
        locator: null,
        line: null,
        payload: { i, out: `token ${FAKE.stripeLive}` },
      });
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain(FAKE.stripeLive);
    expect(verifyLog(readLog(path))).toEqual([]);
    const lines = text.trim().split("\n");
    writeFileSync(path, `${lines[0]}\n${lines[2]}\n`);
    expect(verifyLog(readLog(path)).length).toBeGreaterThan(0);
    writeFileSync(path, `${lines[0]}\n${lines[1]!.replace('"i":1', '"i":9')}\n${lines[2]}\n`);
    expect(verifyLog(readLog(path)).join(" ")).toMatch(/payload digest mismatch/);
    expect(() => new EvidenceLog(path, () => NOW)).toThrow(/integrity/);
  });

  it("the process module refuses without authorization and blocks a cwd outside the repo", () => {
    const base = {
      repo: ROOT,
      envAllowlist: ["PATH"],
      maxOutputBytes: 1024,
      environmentId: "ENV-X",
      commitSha: null,
      now: () => NOW,
    };
    const spec = {
      id: "x",
      argv: [process.execPath, "-e", "process.exit(0)"],
      purpose: "test" as const,
      timeout_ms: 10_000,
      cwd: ".",
      source: "policy" as const,
    };
    expect(execCommand({ ...base, spec, permission: { allowed: false, reason: "nope" } }).status).toBe(
      "NOT_TESTED"
    );
    expect(
      execCommand({ ...base, spec: { ...spec, cwd: "../.." }, permission: { allowed: true, reason: "" } })
        .status
    ).toBe("BLOCKED");
    expect(
      execCommand({
        ...base,
        spec: { ...spec, argv: ["definitely-not-a-binary-xyz"] },
        permission: { allowed: true, reason: "" },
      }).status
    ).toBe("BLOCKED");
    const fail = execCommand({
      ...base,
      spec: { ...spec, argv: [process.execPath, "-e", `console.log("${FAKE.stripeLive}"); process.exit(3)`] },
      permission: { allowed: true, reason: "" },
    });
    expect([fail.status, fail.exit_code]).toEqual(["FAIL", 3]);
    expect(fail.excerpt).not.toContain(FAKE.stripeLive);
    const slow = execCommand({
      ...base,
      spec: { ...spec, timeout_ms: 200, argv: [process.execPath, "-e", "setTimeout(() => {}, 5000)"] },
      permission: { allowed: true, reason: "" },
    });
    expect(slow.status).toBe("FAIL");
    expect(slow.reason).toMatch(/Timed out/);
  });

  it("policies reject bad keys, duplicate approvers and unknown fields", () => {
    expect(() =>
      parsePolicy(
        {
          approvers: [
            {
              id: "a",
              type: "human",
              roles: [],
              public_key: "-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----",
            },
          ],
        },
        "p"
      )
    ).toThrow(/Ed25519/);
    const k = generateApproverKeys();
    expect(() =>
      parsePolicy(
        { approvers: [1, 2].map(() => ({ id: "a", type: "human", roles: [], public_key: k.publicKey })) },
        "p"
      )
    ).toThrow(/twice/);
    expect(() => parsePolicy({ surprise: true }, "p")).toThrow(/Invalid assurance policy/);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("register invariants", () => {
  it("guards transitions and detects tampering", async () => {
    const { dir } = setup();
    await baseline(dir);
    const r = reg(dir);
    const id = secretFinding(dir);
    expect(() => manualTransition(r, id, "CLOSED", { id: "agent", type: "agent" }, "done", NOW)).toThrow(
      /cannot be set directly/
    );
    expect(() =>
      manualTransition(r, id, "VERIFIED_FIXED", { id: "agent", type: "agent" }, "done", NOW)
    ).toThrow(/cannot be set directly/);
    expect(() =>
      manualTransition(r, id, "DEFERRED", { id: "a", type: "human" }, "later", NOW, {
        owner: "a",
        revisit: "2026-12-01",
      })
    ).toThrow(/P0 cannot be deferred/);
    expect(() => manualTransition(r, id, "IN_PROGRESS", { id: "a", type: "agent" }, "skip ack", NOW)).toThrow(
      /not an allowed transition/
    );
    expect(checkRegister(r)).toEqual([]);
    // Editing a state, forging VERIFIED_FIXED or breaking the chain is detected on load.
    const forged = structuredClone(r);
    forged.entries[0]!.state = "CLOSED";
    expect(checkRegister(forged).join(" ")).toMatch(/does not match its transitions/);
    const forged2 = structuredClone(r);
    forged2.entries[0]!.transitions.push({
      ...forged2.entries[0]!.transitions[0]!,
      seq: forged2.chain.length + 1,
      from: "OPEN",
      to: "VERIFIED_FIXED",
    });
    forged2.entries[0]!.state = "VERIFIED_FIXED";
    expect(checkRegister(forged2).join(" ")).toMatch(/not allowed|digest|VERIFIED_FIXED/);
    writeFileSync(join(dir, ".product-check", "closure-register.json"), JSON.stringify(forged));
    const res = await pc(dir, [
      "transition",
      "--finding",
      id,
      "--to",
      "ACKNOWLEDGED",
      "--reason",
      "x",
      "--actor",
      "a",
    ]);
    expect(res.code).toBe(5);
    expect(res.stderr).toMatch(/integrity/);
  });

  it("a code edit alone never closes a finding, and fixes are not verified by being proposed", async () => {
    const { dir, ops } = setup();
    await baseline(dir);
    const id = secretFinding(dir);
    write(
      dir,
      "app/checkout/page.tsx",
      "export default function Checkout() { return <button>Pay</button>; }\n"
    );
    const sha = commit(dir, "remove key");
    // Re-scan shows the finding gone, but the register keeps it open until verified.
    await pc(dir, [
      "retest",
      "--baseline",
      ".product-check/product-check-results.json",
      "--repo",
      ".",
      "--out-dir",
      ".product-check",
      "--quiet",
    ]);
    await pc(dir, ["register", "--repo", "."]);
    expect(entry(dir, id).state).toBe("OPEN");
    expect((await pc(dir, ["fix", "--finding", id, "--sha", sha, "--actor", "agent-1"])).stderr).toMatch(
      /IN_PROGRESS first/
    );
    await pc(dir, [
      "transition",
      "--finding",
      id,
      "--to",
      "ACKNOWLEDGED",
      "--reason",
      "triaged",
      "--actor",
      "agent-1",
    ]);
    await pc(dir, [
      "transition",
      "--finding",
      id,
      "--to",
      "IN_PROGRESS",
      "--reason",
      "fixing",
      "--actor",
      "agent-1",
    ]);
    expect((await pc(dir, ["fix", "--finding", id, "--sha", sha, "--actor", "agent-1"])).code).toBe(0);
    expect(entry(dir, id).state).toBe("RETEST_REQUIRED");
    const close = await pc(dir, [
      "close",
      "--finding",
      id,
      "--evidence",
      "VR-001",
      "--approver",
      "alice",
      "--policy",
      join(ops, "policy.json"),
    ]);
    expect(close.code).toBe(2);
    expect(close.stderr).toMatch(/only VERIFIED_FIXED/);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("end to end (M5 fixtures)", () => {
  it("insecure app → faulty patch fails verification → correct fix verified → closed only with signed human approvals → regression", async () => {
    const { dir, ops, keys } = setup();
    const policy = join(ops, "policy.json");
    await baseline(dir);
    const id = secretFinding(dir);
    expect(entry(dir, id).verification.state).toBe("CONFIRMED");

    // VC-P1: no execution without --allow-exec; then real execution.
    const noExec = await pc(dir, ["proof", "--policy", policy]);
    expect(noExec.stdout).toMatch(/INCONCLUSIVE/);
    expect(
      readJson<VerificationRun>(join(dir, ".product-check", "proof-run.json")).executions[0]!.status
    ).toBe("NOT_TESTED");
    const proof = await pc(dir, ["proof", "--policy", policy, "--allow-exec"]);
    expect(proof.code, proof.stdout).toBe(0);
    expect(readJson<VerificationRun>(join(dir, ".product-check", "proof-run.json")).result).toBe("PASS");

    // Fix packet for the confirmed P0.
    await pc(dir, ["fix-packets", "--policy", policy]);
    const packet = readJson<FixPacket>(join(dir, ".product-check", "fix-packets", `${id}.json`));
    expect(packet.affected_surfaces[0]!.path).toBe("app/checkout/page.tsx");
    expect(packet.tests_required.find((t) => t.kind === "reproduction")!.argv).toBeNull();
    expect(packet.tests_required.find((t) => t.id === "regression:unit")!.argv).toEqual([
      process.execPath,
      "--test",
    ]);
    expect(validateAgainst("fix-packet.schema.json", packet)).toEqual([]);

    // Faulty patch: secret moved to another file; a superficial test passes.
    await pc(dir, [
      "transition",
      "--finding",
      id,
      "--to",
      "ACKNOWLEDGED",
      "--reason",
      "triaged",
      "--actor",
      "agent-1",
    ]);
    await pc(dir, [
      "transition",
      "--finding",
      id,
      "--to",
      "IN_PROGRESS",
      "--reason",
      "fixing",
      "--actor",
      "agent-1",
    ]);
    write(dir, "app/lib/config.ts", `export const STRIPE_SECRET_KEY = "${FAKE.stripeLive}";\n`);
    write(
      dir,
      "app/checkout/page.tsx",
      'import { STRIPE_SECRET_KEY } from "../lib/config";\nexport default function Checkout() { return <button data-n={STRIPE_SECRET_KEY.length}>Pay</button>; }\n'
    );
    write(
      dir,
      "test/secret.test.mjs",
      'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("moved", () => { assert.ok(true); });\n'
    );
    const bad = commit(dir, "faulty fix");
    expect(
      (
        await pc(dir, [
          "fix",
          "--finding",
          id,
          "--sha",
          bad,
          "--actor",
          "agent-1",
          "--repro-cmd",
          `${process.execPath} --test test/secret.test.mjs`,
        ])
      ).code
    ).toBe(0);
    const v1 = await pc(dir, ["verify", "--finding", id, "--head", bad, "--policy", policy, "--allow-exec"]);
    expect(v1.code, v1.stdout + v1.stderr).toBe(6);
    expect(v1.stdout).toMatch(/PASS\s+targeted:repro-1/);
    expect(v1.stdout).toMatch(/moved the problem/);
    expect(entry(dir, id).state).toBe("IN_PROGRESS");
    expect(entry(dir, id).cycles).toBe(1);

    // Correct fix.
    write(dir, "app/lib/config.ts", "export const stripeKey = () => process.env.STRIPE_SECRET_KEY;\n");
    write(
      dir,
      "app/checkout/page.tsx",
      'export default function Checkout() { return <form method="post"><button>Pay</button></form>; }\n'
    );
    write(
      dir,
      "test/secret.test.mjs",
      'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\ntest("no key in client", () => { assert.ok(!/sk_live_/.test(readFileSync("app/checkout/page.tsx", "utf8"))); });\n'
    );
    const good = commit(dir, "correct fix");
    await pc(dir, [
      "fix",
      "--finding",
      id,
      "--sha",
      good,
      "--actor",
      "agent-1",
      "--repro-cmd",
      `${process.execPath} --test test/secret.test.mjs`,
    ]);
    // Verification refuses the wrong commit and a dirty tree.
    expect(
      (await pc(dir, ["verify", "--finding", id, "--head", bad, "--policy", policy, "--allow-exec"])).stderr
    ).toMatch(/Check out the fix commit/);
    write(dir, "scratch.txt", "dirty");
    const dirty = await pc(dir, [
      "verify",
      "--finding",
      id,
      "--head",
      good,
      "--policy",
      policy,
      "--allow-exec",
    ]);
    expect(dirty.stdout).toMatch(/INCONCLUSIVE/);
    expect(dirty.stdout).toMatch(/not clean/);
    git(dir, "clean", "-fq", "-e", ".product-check");
    // Without --allow-exec the declared commands are NOT_TESTED → INCONCLUSIVE, never PASS.
    const noexec = await pc(dir, ["verify", "--finding", id, "--head", good, "--policy", policy]);
    expect(noexec.stdout).toMatch(/INCONCLUSIVE/);
    expect(entry(dir, id).state).toBe("RETEST_REQUIRED");
    const v2 = await pc(dir, ["verify", "--finding", id, "--head", good, "--policy", policy, "--allow-exec"]);
    expect(v2.code, v2.stdout).toBe(0);
    expect(entry(dir, id).state).toBe("VERIFIED_FIXED");
    const vr = reg(dir).verification_runs.at(-1)!;
    expect(vr.exact_sha).toBe(good);
    expect(vr.after_results).not.toBeNull();
    expect(
      existsSync(join(dir, ".product-check", "verification", `${vr.verification_id}-results.json`))
    ).toBe(true);
    expect(vr.before_evidence_ids.length).toBeGreaterThan(0);

    // Closure: implementer and bots cannot approve; one human is not enough for a P0; approvals must be for the fix commit.
    const close = (approver: string) =>
      pc(dir, [
        "close",
        "--finding",
        id,
        "--evidence",
        vr.verification_id,
        "--approver",
        approver,
        "--policy",
        policy,
      ]);
    expect((await close("alice")).stderr).toMatch(/needs 2 valid signed human approval/);
    expect(
      (await pc(dir, ["approve", "--scope", `closure:${id}`, "--sha", good, "--approver", "alice"])).stderr
    ).toMatch(/typed name is not an approval/);
    await pc(dir, [
      "approve",
      "--scope",
      `closure:${id}`,
      "--sha",
      good,
      "--approver",
      "review-bot",
      "--key",
      keys["review-bot"]!,
      "--policy",
      policy,
    ]);
    await pc(dir, [
      "approve",
      "--scope",
      `closure:${id}`,
      "--sha",
      bad,
      "--approver",
      "bob",
      "--key",
      keys["bob"]!,
      "--policy",
      policy,
    ]);
    await pc(dir, [
      "approve",
      "--scope",
      `closure:${id}`,
      "--sha",
      good,
      "--approver",
      "alice",
      "--key",
      keys["alice"]!,
      "--policy",
      policy,
    ]);
    const one = await close("alice");
    expect(one.stderr).toMatch(/found 1/);
    expect(one.stderr).toMatch(/NOT_HUMAN/);
    expect(one.stderr).toMatch(/STALE/);
    await pc(dir, [
      "approve",
      "--scope",
      `closure:${id}`,
      "--sha",
      good,
      "--approver",
      "bob",
      "--key",
      keys["bob"]!,
      "--policy",
      policy,
    ]);
    expect((await close("agent-1")).stderr).toMatch(/must be one of the accountable approvers/);
    const ok = await close("alice");
    expect(ok.code, ok.stderr).toBe(0);
    const closed = entry(dir, id);
    expect(closed.state).toBe("CLOSED");
    expect(closed.closure?.approval_ids).toHaveLength(2);
    expect(closed.transitions.map((t) => t.to)).toEqual([
      "OPEN",
      "ACKNOWLEDGED",
      "IN_PROGRESS",
      "FIX_PROPOSED",
      "RETEST_REQUIRED",
      "IN_PROGRESS",
      "FIX_PROPOSED",
      "RETEST_REQUIRED",
      "VERIFIED_FIXED",
      "CLOSED",
    ]);

    // Regression: the secret comes back; a re-scan marks the closed finding REGRESSED, history kept.
    write(
      dir,
      "app/checkout/page.tsx",
      `const STRIPE_SECRET_KEY = "${FAKE.stripeLive}";\nexport default function Checkout() { return <button data-n={STRIPE_SECRET_KEY.length}>Pay</button>; }\n`
    );
    commit(dir, "regression");
    await pc(dir, [
      "retest",
      "--baseline",
      ".product-check/product-check-results.json",
      "--repo",
      ".",
      "--out-dir",
      ".product-check",
      "--quiet",
    ]);
    const sync = await pc(dir, ["register", "--repo", "."]);
    expect(sync.stdout).toMatch(new RegExp(`regressed \\(${id}\\)`));
    const regressed = entry(dir, id);
    expect(regressed.state).toBe("REGRESSED");
    expect(regressed.closure).not.toBeNull();
    expect(regressed.regressions[0]!.previous_state).toBe("CLOSED");

    // Learn: the escaped case becomes a regression corpus entry that every verify runs.
    expect(
      (
        await pc(dir, [
          "learn",
          "--finding",
          id,
          "--cmd",
          `${process.execPath} --test test/secret.test.mjs`,
          "--origin",
          "regressed-finding",
          "--actor",
          "alice",
        ])
      ).code
    ).toBe(0);

    // Gate and dashboard from the real artifacts.
    const assure = await pc(dir, ["assure", "--policy", policy]);
    const gate = readJson<ReleaseGate>(join(dir, ".product-check", "release-gate.json"));
    expect(gate.decision).toBe("NO_GO");
    expect(gate.conditions.find((c) => c.id === "RC-8")!.status).toBe("FAIL");
    expect(assure.stdout).toMatch(/chain intact/);
    for (const [file, schema] of [
      ["closure-register.json", "closure-register.schema.json"],
      ["release-gate.json", "release-gate.schema.json"],
      ["proof-run.json", "verification-run.schema.json"],
    ] as const)
      expect(validateAgainst(schema, readJson(join(dir, ".product-check", file))), file).toEqual([]);
    for (const line of readLog(join(dir, ".product-check", "review-evidence.jsonl")))
      expect(validateAgainst("evidence-record.schema.json", line)).toEqual([]);
    expect(verifyLog(readLog(join(dir, ".product-check", "review-evidence.jsonl")))).toEqual([]);
    const html = readFileSync(join(dir, ".product-check", "dashboard", "index.html"), "utf8");
    expect(html).toContain("NO GO");
    expect(html).toContain(id);
    expect(html).not.toContain(FAKE.stripeLive);
    const v = await pc(dir, [
      "validate",
      ".product-check/closure-register.json",
      ".product-check/release-gate.json",
    ]);
    expect(v.code, v.stdout).toBe(0);
  });

  it("change reviews: docs-only PR passes with a policy waiver; a dangerous auth change is HIGH and blocked; reviewer claims are verified", async () => {
    const { dir, ops, keys } = setup();
    const policy = join(ops, "policy.json");
    await baseline(dir);

    git(dir, "checkout", "-q", "-b", "docs");
    write(dir, "README.md", "# Vibe Invoices\n\nRun `npm test`.\n\n## Rollback\nRevert and redeploy.\n");
    commit(dir, "docs");
    await pc(dir, ["proof", "--policy", policy, "--allow-exec", "--quiet"]);
    const docs = await pc(dir, [
      "review",
      "--repo",
      ".",
      "--base",
      "main",
      "--head",
      "HEAD",
      "--policy",
      policy,
      "--change",
      "docs",
    ]);
    let review = readJson<ChangeReview>(join(dir, ".product-check", "change-review.json"));
    expect(docs.code).toBe(0);
    expect(review.risk.level).toBe("LOW");
    expect(review.approvals_required.waiver.applied).toBe(true);
    expect(review.gate.status).toBe("PASS");
    expect(review.product_vs_change).toMatch(/never implies product readiness/);

    git(dir, "checkout", "-q", "main");
    git(dir, "checkout", "-q", "-b", "auth");
    write(
      dir,
      "app/api/invoices/route.ts",
      "export async function GET(req, { params }) {\n  return Response.json(await db.invoice.findUnique({ where: { id: params.id } }));\n}\n"
    );
    commit(dir, "simplify invoices api");
    write(
      ops,
      "claims.json",
      JSON.stringify({
        kind: "reviewer-findings",
        reviewer: "ai-reviewer",
        type: "ai",
        findings: [
          {
            path: "app/api/invoices/route.ts",
            line: 2,
            title: "Possible IDOR",
            severity: "P1",
            body: "findUnique by params.id",
          },
          {
            path: "app/api/invoices/route.ts",
            line: 40,
            title: "Race condition in totals",
            severity: "P0",
            body: "hallucinated line",
          },
          { path: "app/nowhere.ts", line: 1, title: "Bug in missing file", severity: "P1", body: "x" },
          { path: "README.md", line: 1, title: "Wording", severity: "P1", body: "style" },
        ],
      })
    );
    await pc(dir, ["proof", "--policy", policy, "--allow-exec", "--quiet"]);
    const auth = await pc(dir, [
      "review",
      "--repo",
      ".",
      "--base",
      "main",
      "--head",
      "HEAD",
      "--policy",
      policy,
      "--change",
      "auth",
      "--reviewer-findings",
      join(ops, "claims.json"),
      "--fail-on",
      "BLOCK",
    ]);
    review = readJson<ChangeReview>(join(dir, ".product-check", "change-review.json"));
    expect(auth.code).toBe(6);
    expect(review.risk.level).toBe("HIGH");
    expect(review.approvals_required.humans).toBe(2);
    expect(review.gate.status).toBe("BLOCK");
    const rule = (id: string) => review.findings.find((f) => f.rule_id === id);
    expect(rule("VC-TR-AUTHZ-REMOVED")!.verification.state).toBe("CONFIRMED");
    expect(rule("VC-TR-OBJECT-AUTHZ")!.verification.state).toBe("CORROBORATED");
    expect(review.disproven.map((f) => f.title).sort()).toEqual([
      "Bug in missing file",
      "Race condition in totals",
    ]);
    const wording = review.findings.find((f) => f.title === "Wording")!;
    expect(wording.verification.state).toBe("NEEDS_HUMAN_TRIAGE");
    expect(wording.blocking).toBe(false);
    expect(validateAgainst("change-review.schema.json", review)).toEqual([]);

    // Approvals for the reviewed head go stale after a new commit.
    const head = git(dir, "rev-parse", "HEAD");
    for (const who of ["alice", "bob"])
      await pc(dir, [
        "approve",
        "--scope",
        "change:auth",
        "--sha",
        head,
        "--approver",
        who,
        "--key",
        keys[who]!,
        "--policy",
        policy,
      ]);
    write(
      dir,
      "app/api/invoices/route.ts",
      'import { requireAuth } from "../../lib/auth";\nexport async function GET(req, { params }) {\n  const user = await requireAuth(req);\n  return Response.json(await db.invoice.findFirst({ where: { id: params.id, userId: user.id } }));\n}\n'
    );
    commit(dir, "restore auth");
    await pc(dir, ["proof", "--policy", policy, "--allow-exec", "--quiet"]);
    await pc(dir, [
      "review",
      "--repo",
      ".",
      "--base",
      "main",
      "--head",
      "HEAD",
      "--policy",
      policy,
      "--change",
      "auth",
    ]);
    review = readJson<ChangeReview>(join(dir, ".product-check", "change-review.json"));
    expect(review.cycle.number).toBe(2);
    expect(review.approvals.map((a) => a.status)).toEqual(["STALE", "STALE"]);
    expect(review.findings.some((f) => f.rule_id === "VC-TR-AUTHZ-REMOVED")).toBe(false);
    expect(review.gate.status).toBe("CONDITIONAL");
  });

  it("review loops stop at the cycle limit and escalate to a human", async () => {
    const { dir, ops } = setup({ review: { max_cycles: 2, fail_closed_unverified_p0: true } });
    const policy = join(ops, "policy.json");
    await baseline(dir);
    const id = secretFinding(dir);
    await pc(dir, [
      "transition",
      "--finding",
      id,
      "--to",
      "ACKNOWLEDGED",
      "--reason",
      "t",
      "--actor",
      "agent-1",
    ]);
    for (let i = 0; i < 2; i++) {
      await pc(dir, [
        "transition",
        "--finding",
        id,
        "--to",
        "IN_PROGRESS",
        "--reason",
        "retry",
        "--actor",
        "agent-1",
      ]).catch(() => undefined);
      write(dir, `notes/${i}.md`, `attempt ${i}\n`);
      const sha = commit(dir, `attempt ${i}`);
      expect((await pc(dir, ["fix", "--finding", id, "--sha", sha, "--actor", "agent-1"])).code).toBe(0);
      expect(
        (await pc(dir, ["verify", "--finding", id, "--head", sha, "--policy", policy, "--allow-exec"])).code
      ).toBe(6);
    }
    const e = entry(dir, id);
    expect(e.escalated).toBe(true);
    expect(e.cycles).toBe(2);
    expect(existsSync(join(dir, ".product-check", "human-review", `${id}.md`))).toBe(true);
    write(dir, "notes/3.md", "attempt 3\n");
    const sha = commit(dir, "attempt 3");
    expect((await pc(dir, ["fix", "--finding", id, "--sha", sha, "--actor", "agent-1"])).stderr).toMatch(
      /escalated/
    );
  });

  it("missing access and zero executed checks give UNKNOWN, never green", async () => {
    const dir = tempFiles({
      "README.md": "# Tiny\n",
      "index.js": "console.log(1);\n",
      ".gitignore": ".product-check/\n",
    });
    git(dir, "init", "-q");
    commit(dir, "tiny");
    await pc(dir, [
      "run",
      "--repo",
      ".",
      "--url",
      "https://app.example.invalid",
      "--out-dir",
      ".product-check",
      "--quiet",
    ]);
    const results = readJson<Results>(join(dir, ".product-check", "product-check-results.json"));
    expect(results.pop_coverage.pops.some((p) => p.status === "BLOCKED")).toBe(true);
    const r = await pc(dir, ["gate", "--fail-on", "UNKNOWN"]);
    expect(r.code).toBe(6);
    const gate = readJson<ReleaseGate>(join(dir, ".product-check", "release-gate.json"));
    expect(gate.decision).toBe("UNKNOWN");
    expect(gate.blocking_reasons.join(" ")).toMatch(/INSUFFICIENT EVIDENCE/);
    expect(gate.coverage.gaps.length).toBeGreaterThan(0);
    expect(gate.phases.find((p) => p.phase === "VC-P5")!.status).toBe("NOT_STARTED");
    const html = renderAssuranceDashboard(
      { results, register: null, review: null, proof: null, packets: [], gate, log: [], now: NOW },
      { branding: false }
    );
    expect(html).toContain("UNKNOWN / INSUFFICIENT EVIDENCE");
    expect(html).not.toMatch(/class="chip good"><span class="dot" aria-hidden="true"><\/span>GO</);
  });

  it("risk acceptance needs every field and signed approvals, never for P0, and expires back to OPEN", async () => {
    const { dir, ops, keys } = setup();
    const policy = join(ops, "policy.json");
    await baseline(dir);
    const r0 = reg(dir);
    const p0 = secretFinding(dir);
    const p2 = r0.entries.find((e) => e.severity === "P2")!.finding_id;
    const head = git(dir, "rev-parse", "HEAD");
    const args = (id: string, expires = "2026-11-30") => [
      "accept-risk",
      "--finding",
      id,
      "--owner",
      "alice",
      "--risk-scope",
      "beta tenants only",
      "--rationale",
      "low exposure",
      "--compensating",
      "WAF rule",
      "--review-date",
      "2026-11-01",
      "--expires",
      expires,
      "--closure-condition",
      "fixed in v2",
      "--policy",
      policy,
    ];
    expect((await pc(dir, args(p0))).stderr).toMatch(/P0/);
    expect(
      (await pc(dir, ["accept-risk", "--finding", p2, "--owner", "alice", "--policy", policy])).stderr
    ).toMatch(/missing/);
    expect((await pc(dir, args(p2))).stderr).toMatch(/signed human approval/);
    await pc(dir, [
      "approve",
      "--scope",
      `risk-acceptance:${p2}`,
      "--sha",
      head,
      "--approver",
      "alice",
      "--key",
      keys["alice"]!,
      "--policy",
      policy,
    ]);
    expect((await pc(dir, args(p2))).code).toBe(0);
    expect(entry(dir, p2).state).toBe("ACCEPTED_RISK");
    const later = await cli(["register", "--repo", "."], dir, new Date("2026-12-05T00:00:00.000Z"));
    expect(later.stdout).toMatch(new RegExp(`Expired acceptances re-opened: ${p2}`));
    expect(entry(dir, p2).state).toBe("OPEN");
  });

  it("false positives: P0/P1 need signed support; lower severities need a reason", async () => {
    const { dir, ops, keys } = setup();
    const policy = join(ops, "policy.json");
    await baseline(dir);
    const r0 = reg(dir);
    const p0 = secretFinding(dir);
    const p3 = r0.entries.find((e) => e.severity === "P3")!.finding_id;
    expect(
      (
        await pc(dir, [
          "reject",
          "--finding",
          p0,
          "--reason",
          "test key",
          "--actor",
          "agent-1",
          "--policy",
          policy,
        ])
      ).stderr
    ).toMatch(/signed human approval/);
    await pc(dir, [
      "approve",
      "--scope",
      `false-positive:${p0}`,
      "--sha",
      git(dir, "rev-parse", "HEAD"),
      "--approver",
      "bob",
      "--key",
      keys["bob"]!,
      "--policy",
      policy,
    ]);
    expect(
      (
        await pc(dir, [
          "reject",
          "--finding",
          p0,
          "--reason",
          "fixture key",
          "--actor",
          "bob",
          "--actor-type",
          "human",
          "--policy",
          policy,
        ])
      ).code
    ).toBe(0);
    expect((await pc(dir, ["reject", "--finding", p3, "--actor", "a", "--policy", policy])).stderr).toMatch(
      /--reason/
    );
    expect(
      (
        await pc(dir, [
          "reject",
          "--finding",
          p3,
          "--reason",
          "n/a for CLI",
          "--actor",
          "a",
          "--policy",
          policy,
        ])
      ).code
    ).toBe(0);
  });

  it("every assurance schema compiles under Ajv strict mode and accepts produced artifacts", async () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    (addFormatsModule as unknown as (a: Ajv2020) => void)(ajv);
    const dir = join(ROOT, "schemas");
    for (const f of [
      "common",
      "assurance-common",
      "approval",
      "verification-run",
      "assurance-policy",
      "evidence-record",
      "change-review",
      "fix-packet",
      "closure-register",
      "release-gate",
      "reviewer-findings",
    ])
      ajv.addSchema(JSON.parse(readFileSync(join(dir, `${f}.schema.json`), "utf8")));
    const policy = parsePolicy({}, "default");
    expect(
      ajv.validate("https://github.com/enwithai/product-check/schemas/assurance-policy.schema.json", policy),
      JSON.stringify(ajv.errors)
    ).toBe(true);
    const { dir: repo } = setup();
    await baseline(repo);
    const registerDoc = reg(repo);
    expect(
      ajv.validate(
        "https://github.com/enwithai/product-check/schemas/closure-register.schema.json",
        registerDoc
      ),
      JSON.stringify(ajv.errors)
    ).toBe(true);
    await pc(repo, ["gate"]);
    const gate = readJson(join(repo, ".product-check", "release-gate.json"));
    expect(
      ajv.validate("https://github.com/enwithai/product-check/schemas/release-gate.schema.json", gate),
      JSON.stringify(ajv.errors)
    ).toBe(true);
  });
});

describe("sibling adapters (optional, versioned)", () => {
  const impact = (high: number) => ({
    schema_version: "2.0",
    repo_revision: { commit: "c".repeat(40) },
    findings: [
      ...Array.from({ length: high }, (_, i) => ({
        id: `h${i}`,
        severity: "high",
        status: "verified_static_fact",
      })),
      { id: "u", severity: "high", status: "unknown" },
    ],
    affected_modules: [{ path: "src/util/format.ts" }, { path: "src/cart/cart.ts" }],
  });
  const spec = {
    schema_version: "1.0",
    requirements: [{ id: "FR-001", path: "specs/001/spec.md", line_start: 3 }],
    findings: [
      {
        id: "needs-clarification:1",
        severity: "high",
        summary: "Unresolved clarification",
        evidence: [{ path: "specs/001/spec.md" }],
      },
      { id: "style:2", severity: "low", summary: "Style", evidence: [] },
    ],
  };
  const outcome = {
    schema_version: "1.0",
    metrics: [
      { id: "ci_first_pass_rate", segments: { all: { value: 0.8 } } },
      { id: "revert_rate", segments: { all: { value: 0.02 } } },
    ],
  };

  it("read only documented fields and reject unsupported versions", async () => {
    const { impactAdapter, specAdapter, outcomeAdapter } = await import("../src/assurance/adapters.js");
    expect(impactAdapter(impact(1), "i")).toMatchObject({
      high: 1,
      affected_modules: 2,
      commit: "c".repeat(40),
    });
    expect(specAdapter(spec, "s").gaps).toEqual([
      {
        id: "needs-clarification:1",
        severity: "high",
        summary: "Unresolved clarification",
        path: "specs/001/spec.md",
      },
    ]);
    expect(outcomeAdapter(outcome, "o")).toEqual({ ci_first_pass_rate: 0.8, revert_rate: 0.02 });
    expect(() => impactAdapter({ ...impact(0), schema_version: "3.0" }, "i")).toThrow(/supported: 2.0/);
    expect(() => specAdapter({ schema_version: "0.9" }, "s")).toThrow(/Spec Check/);
    expect(() => outcomeAdapter([], "o")).toThrow(/Outcome Check/);
  });

  it("feed the review: Impact Check raises risk, Spec Check gaps on changed specs, Outcome Check signals", async () => {
    const { dir, ops } = setup();
    const policy = join(ops, "policy.json");
    await baseline(dir);
    git(dir, "checkout", "-q", "-b", "feature");
    write(dir, "src/util/format.ts", "export const money = (n) => n.toFixed(2);\n");
    write(dir, "specs/001/spec.md", "# Spec\n\n- FR-001 [NEEDS CLARIFICATION]\n");
    commit(dir, "feature");
    write(ops, "impact.json", JSON.stringify(impact(1)));
    write(ops, "spec.json", JSON.stringify(spec));
    write(ops, "outcome.json", JSON.stringify(outcome));
    await pc(dir, [
      "review",
      "--repo",
      ".",
      "--base",
      "main",
      "--head",
      "HEAD",
      "--policy",
      policy,
      "--change",
      "f",
      "--impact-check",
      join(ops, "impact.json"),
      "--spec-check",
      join(ops, "spec.json"),
      "--outcome-check",
      join(ops, "outcome.json"),
    ]);
    const review = readJson<ChangeReview>(join(dir, ".product-check", "change-review.json"));
    expect(review.risk.level).toBe("HIGH");
    expect(review.risk.reasons.join(" ")).toMatch(/Impact Check reports 1 high-severity/);
    expect(review.findings.find((f) => f.rule_id === "VC-SP-SPEC-GAP")!.blocking).toBe(false);
    const lane = (l: string) => review.lanes.find((x) => x.lane === l)!;
    expect(lane("spec-outcome").notes.join(" ")).toMatch(/revert rate 0.02/);
    expect(lane("impact").status).toBe("PARTIAL");
    const bad = await pc(dir, [
      "review",
      "--repo",
      ".",
      "--base",
      "main",
      "--head",
      "HEAD",
      "--impact-check",
      join(ops, "outcome.json"),
    ]);
    expect(bad.code).toBe(3);
  });
});

describe("release gate decisions", () => {
  it("GO only with every condition met; CONDITIONAL_GO with conditions; NO_GO when approvals are missing", async () => {
    const { evaluateGate } = await import("../src/assurance/gate.js");
    const { DEMO } = await import("./helpers.js");
    const results = readJson<Results>(join(DEMO, "output/retest/product-check-results.json"));
    const head = results.run.target_revision.repository!.commit!;
    const k = generateApproverKeys();
    const policy = parsePolicy(
      {
        required_checks: [{ id: "unit", argv: ["npm", "test"], purpose: "test", timeout_ms: 1000 }],
        approvers: [{ id: "alice", type: "human", roles: [], public_key: k.publicKey }],
        release: { rollback_plan: "docs/rollback.md", staged_rollout: "10% canary" },
      },
      "gate"
    );
    const env = {
      environment_id: "ENV-1",
      runner: { platform: "x", arch: "y", node_version: "v", tool_version: "t" },
      lockfile_digest: null,
    };
    const proof: VerificationRun = {
      schema_version: "0.1.0",
      kind: "verification-run",
      verification_id: "PR-0123456789",
      purpose: "author-proof",
      finding_ids: [],
      fix_id: null,
      exact_sha: head,
      worktree_clean: true,
      environment: env,
      started_at: NOW.toISOString(),
      finished_at: NOW.toISOString(),
      checks: [
        {
          check_id: "regression:unit",
          kind: "command",
          role: "regression",
          status: "PASS",
          detail: "ok",
          execution_id: "EXE-1",
          evidence_ids: [],
        },
      ],
      executions: [
        {
          execution_id: "EXE-1",
          command_id: "unit",
          purpose: "test",
          argv: ["npm", "test"],
          cwd: ".",
          status: "PASS",
          exit_code: 0,
          signal: null,
          duration_ms: 5,
          started_at: NOW.toISOString(),
          environment_id: "ENV-1",
          commit_sha: head,
          stdout_digest: null,
          stderr_digest: null,
          output_bytes: 0,
          output_truncated: false,
          excerpt: null,
          reason: null,
          evidence_id: null,
        },
      ],
      before_evidence_ids: [],
      after_evidence_ids: [],
      after_results: null,
      result: "PASS",
      reasons: [],
      limitations: [],
      actor: { id: "product-check", type: "system" },
    };
    const approval = signApproval(
      {
        approver: { id: "alice", type: "human" },
        scope: { type: "release", ref: results.contract.target.name },
        reviewed_sha: head,
        decision: "approve",
        comment: "",
        created_at: NOW.toISOString(),
      },
      k.privateKey
    );
    const base = {
      results,
      resultsSha: "0".repeat(64),
      register: null,
      review: null,
      proof,
      packets: [],
      approvals: [approval],
      policy,
      headSha: head,
      relevantReviewIds: [],
      now: NOW,
    };
    const conditional = evaluateGate(base);
    expect(results.verdict.verdict).toBe("READY_WITH_CONDITIONS");
    expect(conditional.decision).toBe("CONDITIONAL_GO");
    expect(validateAgainst("release-gate.schema.json", conditional)).toEqual([]);
    const ready = structuredClone(results);
    ready.verdict.verdict = "READY";
    ready.findings = [];
    const { createRegister } = await import("../src/assurance/register.js");
    const emptyReg = createRegister(ready, "0".repeat(64), null, policy, NOW);
    const go = evaluateGate({ ...base, results: ready, register: emptyReg });
    expect(go.decision, go.blocking_reasons.join(" | ")).toBe("GO");
    const noApproval = evaluateGate({ ...base, results: ready, register: emptyReg, approvals: [] });
    expect(noApproval.decision).toBe("NO_GO");
    expect(noApproval.conditions.find((c) => c.id === "RC-4")!.status).toBe("FAIL");
    const failedProof = evaluateGate({ ...base, results: ready, proof: { ...proof, result: "FAIL" } });
    expect(failedProof.decision).toBe("NO_GO");
    const otherHead = evaluateGate({ ...base, results: ready, headSha: "f".repeat(40) });
    expect(otherHead.decision).toBe("UNKNOWN");
    expect(otherHead.conditions.find((c) => c.id === "RC-0")!.status).toBe("NOT_EVALUATED");
    const noRollback = parsePolicy(
      { ...policy, release: { rollback_plan: null, staged_rollout: null } },
      "p"
    );
    expect(evaluateGate({ ...base, results: ready, register: emptyReg, policy: noRollback }).decision).toBe(
      "CONDITIONAL_GO"
    );
  });
});
