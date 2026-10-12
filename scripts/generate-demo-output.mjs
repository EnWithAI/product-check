// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Regenerates the committed Vibe Notes demo (examples/vibe-app-demo): inputs/ (recorded observations and executed
 * test results) and output/ (baseline assessment and retest). Requires git and a prior `npm run build`.
 *
 * 1. Generate the synthetic app (baseline commit) and start its local stand-in deployment on 127.0.0.1:4785.
 * 2. Probe it live (authorized passive-http + exposure-probe) and record the observations.
 * 3. Assess offline from the recording → output/baseline.
 * 4. Apply the remediation commit, restart the deployment in its fixed form, run the app's real tests with the
 *    JUnit reporter, and record the observations again.
 * 5. Retest offline against the baseline → output/retest.
 *
 * Normalized for byte-reproducibility (and nothing else): observation timestamps and timings, JUnit times and
 * absolute file paths, and run.node_version. The clock is fixed with SOURCE_DATE_EPOCH.
 * Usage: npm run build && node scripts/generate-demo-output.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const demo = join(root, "examples/vibe-app-demo");
const bin = join(root, "dist/cli/main.js");
const { startServer } = await import(join(demo, "serve.mjs"));
const BASELINE_EPOCH = "1791972000"; // 2026-10-14T10:00:00Z
const RETEST_EPOCH = "1792058400"; // 2026-10-15T10:00:00Z
const tmp = mkdtempSync(join(tmpdir(), "product-check-demo-"));

function sh(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { cwd: demo, encoding: "utf8", ...options });
  if (r.status !== 0 && !options.allowFail)
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}
const cli = (args, epoch, extra = {}) =>
  sh(process.execPath, [bin, ...args], { env: { ...process.env, SOURCE_DATE_EPOCH: epoch }, ...extra });

/** Async child process (needed while this process hosts the demo server: a sync spawn would block it). */
function shAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: demo, ...options, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${out}`))
    );
  });
}
const cliLive = (args, epoch) =>
  shAsync(process.execPath, [bin, ...args], { env: { ...process.env, SOURCE_DATE_EPOCH: epoch } });

/** Fixed timestamps and timings in a recorded observation file (documented normalization). */
function normalizeObservations(from, to, epoch) {
  const data = JSON.parse(readFileSync(from, "utf8"));
  data.source = "recorded";
  data.observations.forEach((o, i) => {
    o.requested_at = new Date(Number(epoch) * 1000 - 60_000 + i * 1000).toISOString();
    if (o.timing_ms !== null) o.timing_ms = 25;
  });
  writeFileSync(to, `${JSON.stringify(data, null, 2)}\n`);
}

/** Replaces the run's node_version so outputs do not depend on the generating machine. */
function normalizeNode(file) {
  const r = JSON.parse(readFileSync(file, "utf8"));
  r.run.node_version = "normalized";
  writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
}

try {
  // 1–3: baseline
  sh(process.execPath, ["create-app.mjs"]);
  let server = await startServer("baseline");
  await cliLive(
    [
      "run",
      "--contract",
      "scan-contract.json",
      "--allow-network",
      "--json",
      "--record-observations",
      join(tmp, "obs-baseline.json"),
    ],
    BASELINE_EPOCH
  );
  await server.close();
  normalizeObservations(
    join(tmp, "obs-baseline.json"),
    join(demo, "inputs/observations-baseline.json"),
    BASELINE_EPOCH
  );
  rmSync(join(demo, "output"), { recursive: true, force: true });
  for (const d of ["repo-only", "aborted-run"])
    for (const f of [
      "product-check-results.json",
      "report.md",
      "blueprint.md",
      "dashboard.html",
      "work-packets",
    ])
      rmSync(join(root, "examples", d, f), { recursive: true, force: true });
  cli(
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
    BASELINE_EPOCH
  );
  normalizeNode(join(demo, "output/baseline/product-check-results.json"));

  // Repository-only scan of the same baseline source (shows what a SOURCE scan can and cannot claim).
  cli(
    ["run", "--contract", "../repo-only/scan-contract.json", "--out-dir", "../repo-only", "--quiet"],
    BASELINE_EPOCH
  );
  normalizeNode(join(root, "examples/repo-only/product-check-results.json"));
  // An unauthorized application scan: refused by the safety gate, recorded as ABORTED.
  const refused = cli(
    [
      "run",
      "--url",
      "https://vibenotes-demo.example",
      "--mode",
      "APPLICATION",
      "--out-dir",
      "../aborted-run",
      "--quiet",
    ],
    BASELINE_EPOCH,
    { allowFail: true }
  );
  if (refused.status !== 4)
    throw new Error(`expected a safety refusal (exit 4), got ${refused.status}: ${refused.stderr}`);
  normalizeNode(join(root, "examples/aborted-run/product-check-results.json"));

  // 4: remediation commit, fixed deployment, real tests, new recording
  sh(process.execPath, ["create-app.mjs", "--remediate"]);
  server = await startServer("remediated");
  const junit = join(tmp, "junit.xml");
  await shAsync(
    process.execPath,
    ["--test", "--test-reporter=junit", `--test-reporter-destination=${junit}`, "tests/**/*.test.mjs"],
    { cwd: join(demo, "app"), env: { ...process.env, BASE_URL: "http://127.0.0.1:4785" } }
  );
  await cliLive(
    [
      "run",
      "--contract",
      "scan-contract.json",
      "--allow-network",
      "--json",
      "--record-observations",
      join(tmp, "obs-remediated.json"),
    ],
    RETEST_EPOCH
  );
  await server.close();
  normalizeObservations(
    join(tmp, "obs-remediated.json"),
    join(demo, "inputs/observations-remediated.json"),
    RETEST_EPOCH
  );
  const xml = readFileSync(junit, "utf8")
    .replace(/time="[\d.]+"/g, 'time="0"')
    .replace(/duration_ms [\d.]+/g, "duration_ms 0")
    .split(join(demo, "app") + "/")
    .join("app/");
  writeFileSync(join(demo, "inputs/test-results-remediated.xml"), xml);

  // 5: retest
  cli(
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
    RETEST_EPOCH
  );
  normalizeNode(join(demo, "output/retest/product-check-results.json"));
  console.log("Wrote examples/vibe-app-demo/inputs/* and output/{baseline,retest}/*");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
