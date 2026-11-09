// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
// Closure demo (CT3 v3.2): builds a synthetic, deliberately weak app ("Vibe Invoices") as a git repository in a
// temporary directory, then drives the whole vibe-code assurance workflow with the built CLI:
//   baseline scan → register → author proof → fix packets → faulty patch (fails verify) → correct fix (verified)
//   → signed human approvals → closure → change review of a dangerous auth PR with AI reviewer claims → gate.
// Every command really runs; the fake credential is assembled at run time and never written to this directory.
// Outputs (minus private keys and the app itself) are copied to output/. Timestamps and durations differ per run.
//   npm run build && node examples/closure-demo/run-demo.mjs
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "..", "dist", "cli", "main.js");
const work = mkdtempSync(join(tmpdir(), "pc-closure-demo-"));
const app = join(work, "app");
const ops = join(work, "ops");
mkdirSync(app, { recursive: true });
mkdirSync(ops, { recursive: true });
const KEY = ["sk", "live", "51DEMODEMODEMODEMODEMODEMO"].join("_");
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "dev",
  GIT_AUTHOR_EMAIL: "dev@example.invalid",
  GIT_COMMITTER_NAME: "dev",
  GIT_COMMITTER_EMAIL: "dev@example.invalid",
};
const sh = (cmd, args, cwd = app) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const git = (...a) => sh("git", ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...a]);
const pc = (...a) => {
  const r = sh(process.execPath, [CLI, ...a]);
  console.log(
    `\n$ product-check ${a.join(" ").replaceAll(work, "<tmp>")}\n${r.out.replaceAll(work, "<tmp>").trimEnd()}  [exit ${r.code}]`
  );
  return r;
};
const put = (p, text) => {
  mkdirSync(dirname(join(app, p)), { recursive: true });
  writeFileSync(join(app, p), text);
};
const commit = (msg) => {
  git("add", "-A");
  git("commit", "-q", "-m", msg);
  return git("rev-parse", "HEAD").out.trim();
};

put(
  "package.json",
  JSON.stringify(
    {
      name: "vibe-invoices",
      private: true,
      scripts: { test: "node --test" },
      dependencies: { next: "15.0.0", react: "19.0.0" },
    },
    null,
    2
  )
);
put(".gitignore", "node_modules\n.env*\n.product-check/\n");
put("README.md", "# Vibe Invoices (synthetic demo)\n\nRun `npm test`.\n");
put(
  "app/checkout/page.tsx",
  `const STRIPE_SECRET_KEY = "${KEY}";\nexport default function Checkout() { return <button data-n={STRIPE_SECRET_KEY.length}>Pay</button>; }\n`
);
put(
  "app/api/invoices/route.ts",
  'import { requireAuth } from "../../lib/auth";\nexport async function GET(req) {\n  const user = await requireAuth(req);\n  return Response.json(await db.invoice.findMany({ where: { userId: user.id } }));\n}\n'
);
put(
  "test/total.test.mjs",
  'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("total", () => { assert.equal([1, 2].reduce((a, b) => a + b, 0), 3); });\n'
);
git("init", "-q");
commit("baseline");

pc("keygen", "--approver", "alice", "--out-dir", ops, "--quiet");
pc("keygen", "--approver", "bob", "--out-dir", ops, "--quiet");
const policy = join(ops, "policy.json");
writeFileSync(
  policy,
  JSON.stringify(
    {
      policy_id: "closure-demo",
      required_checks: [{ id: "unit", argv: ["node", "--test"], purpose: "test", timeout_ms: 120000 }],
      approvers: ["alice", "bob"].map((id) => ({
        id,
        type: "human",
        roles: ["engineering"],
        public_key: readFileSync(join(ops, `${id}.pub.pem`), "utf8"),
      })),
      risk: {
        protected_paths: [{ pattern: "app/lib/auth*", owners: ["bob"] }],
        trusted_authors: ["dev@example.invalid"],
        allow_low_risk_waiver: true,
      },
      release: {
        rollback_plan: "Revert the release commit and redeploy the previous build",
        staged_rollout: null,
      },
    },
    null,
    2
  )
);

pc(
  "run",
  "--repo",
  ".",
  "--out-dir",
  ".product-check",
  "--name",
  "Vibe Invoices (synthetic demo)",
  "--quiet"
);
pc("register", "--repo", ".");
const reg = () => JSON.parse(readFileSync(join(app, ".product-check", "closure-register.json"), "utf8"));
const F = reg().entries.find((e) => e.rule_or_control === "PC-S-01" && e.severity === "P0").finding_id;
pc("proof", "--policy", policy, "--allow-exec");
pc("fix-packets", "--policy", policy);

pc(
  "transition",
  "--finding",
  F,
  "--to",
  "ACKNOWLEDGED",
  "--reason",
  "Confirmed: live key in client bundle",
  "--actor",
  "coding-agent"
);
pc(
  "transition",
  "--finding",
  F,
  "--to",
  "IN_PROGRESS",
  "--reason",
  "Applying fix packet",
  "--actor",
  "coding-agent"
);
put("app/lib/config.ts", `export const STRIPE_SECRET_KEY = "${KEY}";\n`);
put(
  "app/checkout/page.tsx",
  'import { STRIPE_SECRET_KEY } from "../lib/config";\nexport default function Checkout() { return <button data-n={STRIPE_SECRET_KEY.length}>Pay</button>; }\n'
);
put(
  "test/secret.test.mjs",
  'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("secret moved", () => { assert.ok(true); });\n'
);
const bad = commit("move the key to a config module");
pc(
  "fix",
  "--finding",
  F,
  "--sha",
  bad,
  "--actor",
  "coding-agent",
  "--repro-cmd",
  "node --test test/secret.test.mjs"
);
pc("verify", "--finding", F, "--head", bad, "--policy", policy, "--allow-exec");

put("app/lib/config.ts", "export const stripeKey = () => process.env.STRIPE_SECRET_KEY;\n");
put(
  "app/checkout/page.tsx",
  'export default function Checkout() { return <form action="/api/checkout" method="post"><button>Pay</button></form>; }\n'
);
put(
  "test/secret.test.mjs",
  'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\ntest("no secret key in client code", () => { assert.ok(!/sk_live_/.test(readFileSync("app/checkout/page.tsx", "utf8"))); });\n'
);
const good = commit("read the Stripe key from the server environment");
pc(
  "fix",
  "--finding",
  F,
  "--sha",
  good,
  "--actor",
  "coding-agent",
  "--repro-cmd",
  "node --test test/secret.test.mjs"
);
pc("verify", "--finding", F, "--head", good, "--policy", policy, "--allow-exec");
const vr = reg()
  .entries.find((e) => e.finding_id === F)
  .verification_ids.at(-1);
pc("close", "--finding", F, "--evidence", vr, "--approver", "alice", "--policy", policy);
pc(
  "approve",
  "--scope",
  `closure:${F}`,
  "--sha",
  good,
  "--approver",
  "alice",
  "--key",
  join(ops, "alice.key.pem"),
  "--policy",
  policy,
  "--comment",
  "Verified repro and regression; key rotated"
);
pc(
  "approve",
  "--scope",
  `closure:${F}`,
  "--sha",
  good,
  "--approver",
  "bob",
  "--key",
  join(ops, "bob.key.pem"),
  "--policy",
  policy
);
pc("close", "--finding", F, "--evidence", vr, "--approver", "alice", "--policy", policy);
pc(
  "learn",
  "--finding",
  F,
  "--cmd",
  "node --test test/secret.test.mjs",
  "--origin",
  "verified-fix",
  "--actor",
  "alice"
);
pc(
  "retest",
  "--baseline",
  ".product-check/product-check-results.json",
  "--repo",
  ".",
  "--out-dir",
  ".product-check",
  "--name",
  "Vibe Invoices (synthetic demo)",
  "--quiet"
);
pc("register", "--repo", ".");

git("checkout", "-q", "-b", "simplify-invoices");
put(
  "app/api/invoices/route.ts",
  "export async function GET(req, { params }) {\n  return Response.json(await db.invoice.findUnique({ where: { id: params.id } }));\n}\n"
);
commit("simplify invoices api");
writeFileSync(
  join(ops, "ai-review.json"),
  JSON.stringify(
    {
      kind: "reviewer-findings",
      reviewer: "ai-code-reviewer",
      type: "ai",
      findings: [
        {
          path: "app/api/invoices/route.ts",
          line: 2,
          title: "Possible IDOR: invoice fetched by id without owner check",
          severity: "P1",
          body: "findUnique({ where: { id: params.id } }) is not scoped to the user.",
        },
        {
          path: "app/api/invoices/route.ts",
          line: 40,
          title: "Race condition when totals are recomputed",
          severity: "P0",
          body: "No such code exists at this line.",
        },
      ],
    },
    null,
    2
  )
);
pc("proof", "--policy", policy, "--allow-exec");
pc(
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
  "simplify-invoices",
  "--reviewer-findings",
  join(ops, "ai-review.json")
);
pc("assure", "--policy", policy);

const out = join(HERE, "output");
rmSync(out, { recursive: true, force: true });
cpSync(join(app, ".product-check"), out, { recursive: true });
const text = (p) => readFileSync(p, "utf8");
for (const f of ["closure-register.json", "review-evidence.jsonl", "dashboard/index.html"])
  if (text(join(out, f)).includes(KEY)) throw new Error(`credential leaked into ${f}`);
rmSync(work, { recursive: true, force: true });
console.log(
  "\nCopied the workspace to examples/closure-demo/output (no keys, no app). Open output/dashboard/index.html."
);
