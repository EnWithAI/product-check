// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * As-built spec: surface extraction per framework, requirement derivation, Spec Kit rendering, schema validity,
 * determinism, the `spec` command and its safety properties (configuration values are never read or written).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotRepo } from "../src/discovery/repo.js";
import { deriveFacts } from "../src/inspectors/source/facts.js";
import { areaOf, deriveSurface } from "../src/inspectors/source/surface.js";
import { validateAgainst } from "../src/schema/registry.js";
import type { AsBuiltSpec, Results, SurfaceEntry } from "../src/types.js";
import { cli, ROOT, tempFiles } from "./helpers.js";

// Assembled at run time so no secret-like string is committed.
const SECRET_VALUE = ["sk", "live", "x".repeat(8), "synthetic"].join("_");

function fixture(): string {
  return tempFiles({
    "package.json": {
      name: "shop",
      engines: { node: ">=22" },
      dependencies: {
        next: "15.0.0",
        react: "19.0.0",
        express: "5.0.0",
        "drizzle-orm": "0.36.0",
        "@prisma/client": "6.0.0",
        stripe: "17.0.0",
        "express-rate-limit": "7.0.0",
      },
      devDependencies: { vitest: "3.0.0" },
    },
    ".gitignore": ".env\n",
    ".env": `STRIPE_SECRET_KEY=${SECRET_VALUE}\n`,
    "app/layout.tsx": "export default function L({ children }) { return children; }\n",
    "app/page.tsx": "export default function Home() { return null; }\n",
    "app/(shop)/products/[id]/page.tsx": "export default function P() { return null; }\n",
    "app/@modal/cart/page.tsx": "export default function C() { return null; }\n",
    "app/notespage.tsx": "export const notAPage = 1;\n",
    "app/api/orders/route.ts": [
      'import { auth } from "@/auth";',
      "export async function GET() { const s = await auth(); return Response.json(s); }",
      "export async function POST(req: Request) { return Response.json({}); }",
      "",
    ].join("\n"),
    "pages/api/legacy.ts": [
      "export default function handler(req, res) {",
      '  if (req.method === "DELETE") return res.status(204).end();',
      "}",
      "",
    ].join("\n"),
    "pages/_app.tsx": "export default function App() { return null; }\n",
    "server/index.ts": [
      'import express from "express";',
      "const app = express();",
      'app.get("/health", (_req, res) => res.send("ok"));',
      'app.post("/webhooks/stripe", (_req, res) => res.send("ok"));',
      "const key = process.env.STRIPE_SECRET_KEY;",
      "const pub = process.env.NEXT_PUBLIC_SITE_URL;",
      "",
    ].join("\n"),
    "db/schema.ts":
      'import { pgTable } from "drizzle-orm/pg-core";\nexport const orders = pgTable("orders", {});\n',
    "prisma/schema.prisma": "model Product {\n  id    String @id\n  name  String\n  price Int\n}\n",
    "api/main.py": [
      "from fastapi import FastAPI",
      "app = FastAPI()",
      '@app.get("/py/items")',
      "def items(): return []",
      'database = os.environ.get("PY_DATABASE_URL")',
      "",
    ].join("\n"),
    "middleware.ts": 'export const config = { matcher: ["/account/:path*"] };\n',
    "tests/orders.test.ts": [
      'it("rejects an order with an invalid card", () => {});',
      'it("[click me](https://example.invalid) <b>orders</b>", () => {});',
      "const leaked = process.env.TEST_ONLY_TOKEN;",
      "",
    ].join("\n"),
  });
}

describe("surface extraction", () => {
  const facts = deriveFacts(snapshotRepo(fixture(), 5000, "shop"));
  const surface = deriveSurface(facts);
  const find = (kind: string, name: string, method: string | null = null) =>
    surface.items.find((i) => i.kind === kind && i.name === name && (method === null || i.method === method));

  it("reads Next.js app router pages, dropping route groups and parallel-route slots", () => {
    expect(find("page", "/")).toBeDefined();
    expect(find("page", "/products/[id]")?.area).toBe("products");
    expect(find("page", "/cart")).toBeDefined();
    expect(surface.items.some((i) => i.path === "app/notespage.tsx")).toBe(false);
  });

  it("reads route handlers per exported method and flags auth helpers as an inference", () => {
    expect(find("endpoint", "/api/orders", "GET")?.auth_hint).toBe(true);
    expect(find("endpoint", "/api/orders", "POST")?.line).toBe(3);
    expect(find("endpoint", "/api/legacy", "DELETE")?.certainty).toBe("observed");
    expect(surface.items.some((i) => i.path === "pages/_app.tsx")).toBe(false);
  });

  it("reads Express and FastAPI routes declared in code", () => {
    expect(find("endpoint", "/health", "GET")?.line).toBe(3);
    expect(find("endpoint", "/webhooks/stripe", "POST")).toBeDefined();
    expect(find("endpoint", "/py/items", "GET")?.detail).toBe("Python route decorator");
  });

  it("reads Prisma models with fields and Drizzle tables", () => {
    expect(find("entity", "Product")?.detail).toBe("fields: id, name, price");
    expect(find("entity", "orders")?.detail).toBe("Drizzle table");
  });

  it("lists configuration by name only, skipping test files, and never reads git-ignored files", () => {
    const config = surface.items.filter((i) => i.kind === "config").map((i) => i.name);
    expect(config).toEqual(["NEXT_PUBLIC_SITE_URL", "PY_DATABASE_URL", "STRIPE_SECRET_KEY"]);
    expect(find("config", "NEXT_PUBLIC_SITE_URL")?.detail).toMatch(/^exposed to the browser bundle/);
    expect(JSON.stringify(surface)).not.toContain(SECRET_VALUE);
  });

  it("classifies integrations, middleware boundaries and test titles", () => {
    expect(find("integration", "stripe")?.area).toBe("payments");
    expect(find("integration", "vitest")).toBeUndefined();
    expect(find("auth-boundary", "middleware")?.detail).toContain("/account/:path*");
    expect(find("test", "rejects an order with an invalid card")?.certainty).toBe("inferred");
  });

  it("groups routes by their first static segment", () => {
    expect(areaOf("/")).toBe("home");
    expect(areaOf("/api/orders/[id]")).toBe("orders");
    expect(areaOf("/api")).toBe("api");
    expect(areaOf("/[locale]/blog")).toBe("blog");
  });
});

describe("product-check spec", () => {
  it("writes a schema-valid JSON spec and a Spec Kit spec.md with clarifications instead of invented intent", async () => {
    const repo = fixture();
    const r = await cli(["spec", "--repo", ".", "--out-dir", "out"], repo);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("functional requirement(s)");
    const spec = JSON.parse(readFileSync(join(repo, "out/as-built-spec.json"), "utf8")) as AsBuiltSpec;
    expect(validateAgainst("as-built-spec.schema.json", spec)).toEqual([]);
    expect(spec.requirements.map((x) => x.id)).toEqual(
      spec.requirements.map((_, i) => `FR-${String(i + 1).padStart(3, "0")}`)
    );
    const ev = new Set(spec.evidence.map((e) => e.id));
    for (const s of spec.surface) for (const id of s.evidence_ids) expect(ev.has(id)).toBe(true);
    expect(spec.non_functional.some((n) => n.statement.includes("express-rate-limit"))).toBe(true);
    expect(spec.edge_cases.some((e) => e.statement.includes("invalid card"))).toBe(true);
    expect(spec.stories.find((s) => s.area === "orders")?.test_behaviours).toContain(
      "rejects an order with an invalid card"
    );

    const md = readFileSync(join(repo, "out/specs/000-as-built/spec.md"), "utf8");
    expect(md).toMatch(/^# Feature Specification: product-check-test-\w+ \(as built\)/);
    expect(md).toContain("**Purpose**: [NEEDS CLARIFICATION:");
    expect(md).toContain("- **FR-001**:");
    expect(md).toContain("[NEEDS CLARIFICATION: measurable outcomes");
    // Untrusted test titles cannot inject links or HTML.
    expect(md).not.toContain("[click me](https://example.invalid)");
    expect(md).not.toContain("<b>");
    // Configuration values never leave the repository.
    expect(md + JSON.stringify(spec)).not.toContain(SECRET_VALUE);
    expect(md).not.toContain("TEST_ONLY_TOKEN");
  });

  it("is deterministic for a fixed clock", async () => {
    const repo = fixture();
    const a = await cli(["spec", "--repo", ".", "--json"], repo);
    const b = await cli(["spec", "--repo", ".", "--json"], repo);
    expect(a.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it("matches declared critical journeys to route areas and reports the ones it cannot match", async () => {
    const repo = fixture();
    const contract = tempFiles({
      "c.json": {
        target: { name: "shop", repository: { path: repo } },
        critical_journeys: ["Place an order", "Redeem a gift card"],
      },
    });
    const r = await cli(["spec", "--contract", join(contract, "c.json"), "--json"], repo);
    expect(r.code, r.stderr).toBe(0);
    const spec = JSON.parse(r.stdout) as AsBuiltSpec;
    expect(spec.stories.find((s) => s.area === "orders")?.critical_journey).toBe("Place an order");
    expect(spec.clarifications.some((c) => c.includes("Redeem a gift card"))).toBe(true);
  });

  it("honours --format and rejects bad usage", async () => {
    const repo = fixture();
    const json = await cli(["spec", "--repo", ".", "--out-dir", "j", "--format", "json", "--quiet"], repo);
    expect(json.code).toBe(0);
    expect(() => readFileSync(join(repo, "j/specs/000-as-built/spec.md"))).toThrow();
    expect((await cli(["spec", "--repo", ".", "--format", "pdf"], repo)).code).toBe(2);
    expect((await cli(["spec", "--url", "https://example.invalid"], repo)).code).toBe(2);
    expect((await cli(["spec", "--repo", ".", "extra"], repo)).code).toBe(2);
  });

  it("says plainly when a repository has no recognisable surface", async () => {
    const repo = tempFiles({ "package.json": { name: "lib" }, "index.js": "module.exports = 1;\n" });
    const r = await cli(["spec", "--repo", ".", "--json"], repo);
    const spec = JSON.parse(r.stdout) as AsBuiltSpec;
    expect(spec.requirements).toEqual([]);
    expect(spec.uncertainties.join(" ")).toContain("No pages or API endpoints were recognised");
  });
});

describe("as-built spec in run results", () => {
  const results = JSON.parse(
    readFileSync(join(ROOT, "examples/vibe-app-demo/output/baseline/product-check-results.json"), "utf8")
  ) as Results;
  const built = results.blueprint.as_is.as_built;
  const linked = (location: string): string[] =>
    results.blueprint.traceability
      .filter((t) => t.component === location)
      .map((t) => /^As-built ([^;]+);/.exec(t.journey_or_requirement)?.[1] ?? "");
  const fr = (pred: (s: SurfaceEntry) => boolean): string[] => {
    const ids = new Set(built?.surface.filter(pred).map((s) => s.id));
    return (built?.requirements ?? [])
      .filter((r) => r.surface_ids.some((id) => ids.has(id)))
      .map((r) => r.id);
  };

  it("embeds the spec in the blueprint with evidence that resolves in the results", () => {
    expect(built?.requirements.length).toBeGreaterThan(0);
    const ev = new Set(results.evidence.map((e) => e.id));
    for (const s of built?.surface ?? []) for (const id of s.evidence_ids) expect(ev.has(id)).toBe(true);
  });

  it("links application URLs to the page with that path and manifest lines only to that dependency", () => {
    const home = fr((s) => s.kind === "page" && s.name === "/");
    expect(linked("http://127.0.0.1:4785/").every((l) => l === home.join(", "))).toBe(true);
    for (const loc of ["package.json:9", "package.json:10"]) {
      const line = Number(loc.split(":")[1]);
      const exact = fr((s) => s.kind === "integration" && s.location.line === line);
      expect(exact).toHaveLength(1);
      expect(linked(loc)).toEqual([exact[0]]);
    }
  });
});
