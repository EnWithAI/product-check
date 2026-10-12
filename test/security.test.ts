// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Security invariants: no process/eval primitives in src/; network only in the probe module; no Trojan Source;
 * a run writes only its output directory; ignored files are never read; hostile content is escaped.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDashboard } from "../src/dashboard/render.js";
import { renderReport } from "../src/reporting/markdown.js";
import type { Results } from "../src/types.js";
import { cleanRepo, cli, commitAll, DEMO, FAKE, readJson, ROOT, runJson, tempFiles } from "./helpers.js";

function files(dir: string, ext = ".ts"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}
function tree(dir: string, prefix = ""): string[] {
  return readdirSync(dir)
    .flatMap((name) =>
      statSync(join(dir, name)).isDirectory()
        ? tree(join(dir, name), `${prefix}${name}/`)
        : [`${prefix}${name}`]
    )
    .sort();
}

describe("security invariants", () => {
  it("src/ has no process, vm or eval primitives, and network only in inspectors/http/fetch.ts", () => {
    for (const file of files(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /from "node:(child_process|worker_threads|vm|http|https|net|tls|dgram|http2)"/
      );
      expect(text, file).not.toMatch(/\beval\(|new Function\(|\bimport\(/);
      // candidates.ts only contains test code as text for users to copy; it never calls fetch itself.
      if (
        !file.endsWith(join("inspectors", "http", "fetch.ts")) &&
        !file.endsWith(join("blueprint", "candidates.ts"))
      )
        expect(text, file).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket/);
    }
  });

  it("no invisible or bidirectional control characters in src/, test/ or dashboard/", () => {
    for (const file of [
      ...files(join(ROOT, "src")),
      ...files(join(ROOT, "test")),
      ...files(join(ROOT, "dashboard"), ".js"),
      ...files(join(ROOT, "dashboard"), ".css"),
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/);
    }
  });

  it("a run writes only inside --out-dir and never modifies the scanned repository", async () => {
    const dir = tempFiles(cleanRepo());
    commitAll(dir);
    const before = tree(dir).filter((p) => !p.startsWith(".git/"));
    await cli(["run", "--repo", ".", "--json"], dir);
    expect(tree(dir).filter((p) => !p.startsWith(".git/"))).toEqual(before);
    await cli(["run", "--repo", ".", "--out-dir", "out", "--quiet"], dir);
    expect(tree(dir).filter((p) => !p.startsWith(".git/") && !p.startsWith("out/"))).toEqual(before);
  });

  it("never reads git-ignored files, so local secrets are neither reported nor copied", async () => {
    const dir = tempFiles(cleanRepo({ ".env.local": `STRIPE_SECRET_KEY=${FAKE.stripeLive}\n` }));
    commitAll(dir);
    const r = await runJson(dir, ["--repo", "."]);
    expect(r.validations.find((v) => v.control_id === "PC-S-01")?.status).toBe("PASS");
    expect(r.validations.find((v) => v.control_id === "PC-S-03")?.status).toBe("PASS");
    expect(JSON.stringify(r)).not.toContain(FAKE.stripeLive);
    expect(r.limitations.find((l) => l.code === "ignored-not-read")?.paths).toContain(".env.local");
  });

  it("evidence excerpts are redacted and contain no full file contents", () => {
    const r = readJson<Results>(join(DEMO, "output/baseline/product-check-results.json"));
    for (const e of r.evidence) {
      expect((e.excerpt ?? "").length).toBeLessThanOrEqual(161);
      expect(e.excerpt ?? "").not.toMatch(/sk_live_[A-Za-z0-9]{8}|eyJ[A-Za-z0-9_-]{20}\./);
    }
    expect(r.evidence.some((e) => e.redaction.applied)).toBe(true);
  });

  it("hostile page titles and paths are escaped in every rendering", () => {
    const r = structuredClone(readJson<Results>(join(DEMO, "output/baseline/product-check-results.json")));
    const payload = "<script>alert(1)</script><img src=x onerror=alert(2)>";
    r.contract.target.name = payload;
    r.findings[0]!.title = payload;
    r.findings[0]!.location = payload;
    const html = renderDashboard(r, { branding: false });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    const md = renderReport(r, { branding: false });
    // Outside code spans, markup is backslash-escaped; inside code spans GitHub renders it as literal text.
    expect(md).not.toMatch(/(^|[^`\\])<script>/m);
  });
});
