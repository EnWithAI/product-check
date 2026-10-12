// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Test helpers: run the CLI in-process with a fixed clock, build synthetic repositories (optionally as real git
 * repositories), and load results. Secret-like strings are assembled at runtime so none is committed.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli/run.js";
import type { Results } from "../src/types.js";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEMO = join(ROOT, "examples/vibe-app-demo");
export const NOW = new Date("2026-10-12T09:00:00.000Z");

/** Result of an in-process CLI run. */
export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with a fixed clock. */
export async function cli(args: string[], cwd: string, now: Date = NOW): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
    now: () => now,
  });
  return { code, stdout, stderr };
}

/** Creates a temporary directory with the given files (objects are written as JSON). */
export function tempFiles(files: Record<string, string | object>): string {
  const dir = mkdtempSync(join(tmpdir(), "product-check-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

/** Runs git in a directory with a fixed identity (tests may use child processes; src/ may not). */
export function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    },
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

/** Makes `dir` a git repository with everything (or the given paths) committed. */
export function commitAll(dir: string, paths: string[] = ["-A"]): string {
  git(dir, "init", "-q");
  git(dir, "add", ...paths);
  git(dir, "commit", "-q", "-m", "fixture");
  return git(dir, "rev-parse", "HEAD");
}

/** Fake credentials assembled at runtime. */
export const FAKE = {
  stripeLive: ["sk", "live", "51ABCDEFGHIJKLMNOPQRSTUVWX"].join("_"),
  stripeTest: ["sk", "test", "51ABCDEFGHIJKLMNOPQRSTUVWX"].join("_"),
  aws: ["AKIA", "ABCDEFGHIJKLMNOP"].join(""),
  jwt: (role: string): string =>
    [
      Buffer.from('{"alg":"HS256"}').toString("base64url"),
      Buffer.from(JSON.stringify({ role, iss: "x" })).toString("base64url"),
      "c2lnbmF0dXJlLW5vdC1yZWFs",
    ].join("."),
};

/** A small, clean Next.js-style repository. */
export function cleanRepo(extra: Record<string, string | object> = {}): Record<string, string | object> {
  return {
    "package.json": {
      name: "clean",
      engines: { node: ">=22" },
      scripts: { test: "vitest run" },
      dependencies: { next: "15.0.0", react: "19.0.0", "@sentry/nextjs": "8.0.0" },
      devDependencies: { vitest: "3.0.0" },
    },
    "package-lock.json": { lockfileVersion: 3 },
    "README.md": "# Clean\n\nRun `npm ci` then `npm run dev`.\n",
    ".gitignore": "node_modules\n.env*\n",
    "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    ".github/workflows/ci.yml": "jobs:\n  t:\n    steps:\n      - run: npm ci\n      - run: npm test\n",
    "app/layout.tsx":
      'export default function L({ children }) { return <html lang="en"><body>{children}</body></html>; }\n',
    "app/page.tsx": 'export default function P() { return <img src="/a.png" alt="A" />; }\n',
    "app/not-found.tsx": "export default function N() { return null; }\n",
    "app/privacy/page.tsx": "export default function Privacy() { return null; }\n",
    "SECURITY.md": "Report to security@example.invalid\n",
    "src/sum.test.ts": "test('sum', () => {});\n",
    ...extra,
  };
}

/** Runs `run --json` and returns parsed results. */
export async function runJson(cwd: string, args: string[], now: Date = NOW): Promise<Results> {
  const r = await cli(["run", ...args, "--json", "--quiet"], cwd, now);
  if (r.code !== 0) throw new Error(`run exited ${r.code}: ${r.stderr}`);
  return JSON.parse(r.stdout) as Results;
}

/** Reads a JSON file. */
export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** Validation status of a control. */
export const statusOf = (r: Results, id: string): string | undefined =>
  r.validations.find((v) => v.control_id === id)?.status;
