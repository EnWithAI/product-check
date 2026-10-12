// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Derives the product surface from repository facts: pages, API endpoints, data entities, configuration names,
 * external integrations, authentication boundaries and the behaviours that test titles describe. Like the other
 * source inspectors this reads only the snapshot (never the file system again), never executes code and never
 * reads configuration values: environment variables are reported by name only.
 *
 * Structure found at a file and line is `observed`. Anything that interprets that structure (for example, that a
 * handler is restricted to signed-in users because it calls a session helper) is `inferred`.
 */
import type { RepoFile } from "../../discovery/repo.js";
import { lineOf, lineText, type RepoFacts } from "./facts.js";

export type SurfaceKind =
  "page" | "endpoint" | "entity" | "config" | "integration" | "auth-boundary" | "test";

/** One element of the product surface. */
export interface SurfaceItem {
  kind: SurfaceKind;
  /** Route path, entity name, variable name, package name or test title. */
  name: string;
  /** HTTP method for endpoints (`ANY` when the handler dispatches on method itself); null otherwise. */
  method: string | null;
  /** Grouping area: first meaningful route segment, or the entity/integration category. */
  area: string;
  /** Short human-readable detail (fields, category, matcher, how it was recognised). */
  detail: string;
  path: string;
  line: number | null;
  excerpt: string | null;
  certainty: "observed" | "inferred";
  /** Endpoints and pages whose source references a session or auth helper (inference). */
  auth_hint: boolean;
}

/** Everything derived about the surface. */
export interface ProductSurface {
  items: SurfaceItem[];
  /** Notes about what could not be determined (for the spec's uncertainties). */
  notes: string[];
}

const MAX_ITEMS_PER_KIND = 500;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const AUTH_HELPER =
  /\b(getServerSession|auth\(\)|currentUser\(|getUser\(|getSession\(|requireAuth|requireUser|isAuthenticated|withAuth|clerkClient|supabase\.auth\.|verifyToken|jwt\.verify|login_required|Depends\(\s*get_current_user)/;

/** Extra integrations not already classified by facts.ts, by category. */
const INTEGRATIONS: [RegExp, string][] = [
  [/^(stripe|@stripe\/.+|@lemonsqueezy\/.+|@paddle\/.+|braintree|razorpay)$/, "payments"],
  [
    /^(resend|nodemailer|@sendgrid\/mail|postmark|mailgun\.js|@react-email\/.+|@aws-sdk\/client-ses)$/,
    "email",
  ],
  [
    /^(@aws-sdk\/client-s3|@vercel\/blob|uploadthing|cloudinary|@google-cloud\/storage|@azure\/storage-blob)$/,
    "storage",
  ],
  [
    /^(posthog-js|@vercel\/analytics|@segment\/analytics-next|mixpanel-browser|@amplitude\/.+|plausible-tracker)$/,
    "analytics",
  ],
  [/^(twilio|@slack\/web-api|@octokit\/rest|octokit|pusher|pusher-js|ably|@liveblocks\/.+)$/, "messaging"],
  [
    /^(@upstash\/redis|@upstash\/ratelimit|ioredis|redis|bullmq|inngest|@trigger\.dev\/sdk|@vercel\/kv)$/,
    "queue-cache",
  ],
];

const isJs = (p: string): boolean => /\.[cm]?[jt]sx?$/.test(p);
const strip = (p: string): string => p.replace(/^src\//, "");

/** Turns a file-system route (segments) into a URL path, dropping route groups and parallel-route slots. */
function routeFromSegments(segments: string[]): string {
  const kept = segments.filter((s) => s !== "" && !/^\(.*\)$/.test(s) && !s.startsWith("@") && s !== "index");
  return `/${kept.join("/")}`;
}

/** The grouping area of a URL path: first static segment after an optional `api` prefix. */
export function areaOf(route: string): string {
  const segs = route.split("/").filter(Boolean);
  const rest = segs[0] === "api" ? segs.slice(1) : segs;
  const first = rest.find((s) => !/^[[:{(]/.test(s));
  return first ? first.toLowerCase() : segs[0] === "api" ? "api" : "home";
}

function firstLineMatching(text: string, re: RegExp): { line: number; excerpt: string } | null {
  const m = re.exec(text);
  if (!m) return null;
  const line = lineOf(text, m.index);
  return { line, excerpt: lineText(text, line).trim() };
}

/** Derives the product surface. */
export function deriveSurface(facts: RepoFacts): ProductSurface {
  const items: SurfaceItem[] = [];
  const notes: string[] = [];
  const counts = new Map<SurfaceKind, number>();
  const seen = new Set<string>();
  const add = (item: Omit<SurfaceItem, "auth_hint"> & { auth_hint?: boolean }): void => {
    const key = `${item.kind}\u001f${item.method ?? ""}\u001f${item.name}\u001f${item.path}`;
    if (seen.has(key)) return;
    const n = counts.get(item.kind) ?? 0;
    if (n >= MAX_ITEMS_PER_KIND) return;
    seen.add(key);
    counts.set(item.kind, n + 1);
    items.push({ ...item, auth_hint: item.auth_hint ?? false });
  };
  const files = facts.snapshot.files;
  const code = facts.codeFiles;
  const has = (dep: string): boolean => facts.deps.has(dep);
  const authHint = (f: RepoFile): boolean => AUTH_HELPER.test(f.text ?? "");

  // ------------------------------------------------------------- file-system routes
  for (const f of files) {
    const p = f.path;
    // Next.js app router pages and route handlers.
    let m = /^(?:src\/)?app\/(?:(.*)\/)?page\.[jt]sx?$/.exec(p);
    if (m && has("next")) {
      const route = routeFromSegments((m[1] ?? "").split("/"));
      add({
        kind: "page",
        name: route,
        method: null,
        area: areaOf(route),
        detail: "Next.js app router page",
        path: p,
        line: 1,
        excerpt: null,
        certainty: "observed",
        auth_hint: authHint(f),
      });
      continue;
    }
    m = /^(?:src\/)?app\/(?:(.*)\/)?route\.[jt]s$/.exec(p);
    if (m && has("next")) {
      const route = routeFromSegments((m[1] ?? "").split("/"));
      const text = f.text ?? "";
      let found = false;
      for (const method of METHODS) {
        const hit = firstLineMatching(
          text,
          new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`)
        );
        if (hit) {
          found = true;
          add({
            kind: "endpoint",
            name: route,
            method,
            area: areaOf(route),
            detail: "Next.js route handler",
            path: p,
            line: hit.line,
            excerpt: hit.excerpt,
            certainty: "observed",
            auth_hint: authHint(f),
          });
        }
      }
      if (!found)
        add({
          kind: "endpoint",
          name: route,
          method: "ANY",
          area: areaOf(route),
          detail: "Next.js route handler (methods not recognised)",
          path: p,
          line: 1,
          excerpt: null,
          certainty: "inferred",
          auth_hint: authHint(f),
        });
      continue;
    }
    // Next.js pages router.
    m = /^(?:src\/)?pages\/(.+)\.[jt]sx?$/.exec(p);
    if (m && has("next")) {
      const rel = m[1] as string;
      if (/(^|\/)_(app|document|error|middleware)$/.test(rel)) continue;
      const route = routeFromSegments(rel.split("/"));
      if (rel.startsWith("api/")) {
        const text = f.text ?? "";
        const methods = [
          ...new Set([...text.matchAll(/method\s*===?\s*["'`]([A-Z]+)["'`]/g)].map((x) => x[1] as string)),
        ].filter((x) => (METHODS as readonly string[]).includes(x));
        for (const method of methods.length > 0 ? methods.sort() : ["ANY"])
          add({
            kind: "endpoint",
            name: route,
            method,
            area: areaOf(route),
            detail: "Next.js API route",
            path: p,
            line: 1,
            excerpt: null,
            certainty: methods.length > 0 ? "observed" : "inferred",
            auth_hint: authHint(f),
          });
      } else if (rel !== "404" && rel !== "500") {
        add({
          kind: "page",
          name: route,
          method: null,
          area: areaOf(route),
          detail: "Next.js pages router page",
          path: p,
          line: 1,
          excerpt: null,
          certainty: "observed",
          auth_hint: authHint(f),
        });
      }
      continue;
    }
    // SvelteKit.
    m = /^src\/routes\/(?:(.*)\/)?\+(page\.svelte|server\.[jt]s)$/.exec(p);
    if (m && has("@sveltejs/kit")) {
      const route = routeFromSegments((m[1] ?? "").split("/"));
      if ((m[2] as string).startsWith("page"))
        add({
          kind: "page",
          name: route,
          method: null,
          area: areaOf(route),
          detail: "SvelteKit page",
          path: p,
          line: 1,
          excerpt: null,
          certainty: "observed",
          auth_hint: authHint(f),
        });
      else
        for (const method of METHODS) {
          const hit = firstLineMatching(
            f.text ?? "",
            new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`)
          );
          if (hit)
            add({
              kind: "endpoint",
              name: route,
              method,
              area: areaOf(route),
              detail: "SvelteKit endpoint",
              path: p,
              line: hit.line,
              excerpt: hit.excerpt,
              certainty: "observed",
              auth_hint: authHint(f),
            });
        }
      continue;
    }
    // Astro.
    m = /^src\/pages\/(.+)\.(astro|md|mdx)$/.exec(p);
    if (m && has("astro") && m[1] !== "404") {
      const route = routeFromSegments((m[1] as string).split("/"));
      add({
        kind: "page",
        name: route,
        method: null,
        area: areaOf(route),
        detail: "Astro page",
        path: p,
        line: 1,
        excerpt: null,
        certainty: "observed",
      });
    }
  }

  // ------------------------------------------------------------- routes declared in code
  const serverFw = ["express", "fastify", "hono", "koa", "@koa/router", "koa-router", "@nestjs/core"].some(
    has
  );
  for (const f of code) {
    const text = f.text as string;
    if (isJs(f.path) && serverFw) {
      for (const hit of text.matchAll(
        /\b(?:app|router|server|api|fastify|route[rs]?|r)\.(get|post|put|patch|delete|all)\(\s*(["'`])(\/[^"'`]*)\2/g
      )) {
        const line = lineOf(text, hit.index);
        const route = hit[3] as string;
        const method = (hit[1] as string).toUpperCase();
        add({
          kind: "endpoint",
          name: route,
          method: method === "ALL" ? "ANY" : method,
          area: areaOf(route),
          detail: "route registered in code",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
          auth_hint: AUTH_HELPER.test(lineText(text, line)),
        });
      }
      for (const hit of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)) {
        const ctrl = /@Controller\(\s*["'`]([^"'`]*)["'`]/.exec(text)?.[1] ?? "";
        const route = `/${[ctrl, hit[2] ?? ""].filter(Boolean).join("/")}`.replace(/\/+/g, "/");
        const line = lineOf(text, hit.index);
        add({
          kind: "endpoint",
          name: route,
          method: (hit[1] as string).toUpperCase(),
          area: areaOf(route),
          detail: "NestJS controller route",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
        });
      }
    }
    if (isJs(f.path) && /react-router/.test(text)) {
      for (const hit of text.matchAll(/(?:<Route\b[^>]*\bpath=|\bpath\s*:\s*)(["'`])(\/?[^"'`]*)\1/g)) {
        const raw = hit[2] as string;
        const route = raw.startsWith("/") ? raw : `/${raw}`;
        const line = lineOf(text, hit.index);
        add({
          kind: "page",
          name: route,
          method: null,
          area: areaOf(route),
          detail: "React Router route",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
        });
      }
    }
    if (f.path.endsWith(".py")) {
      for (const hit of text.matchAll(
        /@(?:\w+)\.(get|post|put|patch|delete|route|api_route)\(\s*["'](\/[^"']*)["']([^)]*)\)/g
      )) {
        const line = lineOf(text, hit.index);
        const verb = (hit[1] as string).toUpperCase();
        const methods = /methods\s*=\s*\[([^\]]*)\]/.exec(hit[3] ?? "")?.[1];
        const list =
          verb === "ROUTE" || verb === "API_ROUTE"
            ? methods
              ? [...methods.matchAll(/["'](\w+)["']/g)].map((x) => (x[1] as string).toUpperCase())
              : ["GET"]
            : [verb];
        for (const method of list)
          add({
            kind: "endpoint",
            name: hit[2] as string,
            method,
            area: areaOf(hit[2] as string),
            detail: "Python route decorator",
            path: f.path,
            line,
            excerpt: lineText(text, line).trim(),
            certainty: "observed",
            auth_hint: AUTH_HELPER.test(text.slice(hit.index, hit.index + 600)),
          });
      }
    }
  }

  // ------------------------------------------------------------- data entities
  for (const f of facts.snapshot.files) {
    const text = f.text;
    if (text === null) continue;
    if (f.path.endsWith(".prisma")) {
      for (const hit of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        const fields = [...(hit[2] as string).matchAll(/^\s+(\w+)\s+\w+/gm)]
          .map((x) => x[1] as string)
          .filter((x) => !x.startsWith("@@"));
        const line = lineOf(text, hit.index);
        add({
          kind: "entity",
          name: hit[1] as string,
          method: null,
          area: "data",
          detail: fields.length
            ? `fields: ${fields.slice(0, 15).join(", ")}${fields.length > 15 ? ", …" : ""}`
            : "no fields recognised",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
        });
      }
    } else if (f.path.endsWith(".sql")) {
      for (const hit of text.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?["`[]?(?:\w+["`\]]?\.["`[]?)?(\w+)/gi
      )) {
        const line = lineOf(text, hit.index);
        add({
          kind: "entity",
          name: hit[1] as string,
          method: null,
          area: "data",
          detail: "SQL table",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
        });
      }
    } else if (isJs(f.path)) {
      for (const hit of text.matchAll(/\b(?:pgTable|mysqlTable|sqliteTable)\(\s*["'`](\w+)["'`]/g)) {
        const line = lineOf(text, hit.index);
        add({
          kind: "entity",
          name: hit[1] as string,
          method: null,
          area: "data",
          detail: "Drizzle table",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
        });
      }
      if (has("mongoose"))
        for (const hit of text.matchAll(/\bmodel(?:<[^>]*>)?\(\s*["'`](\w+)["'`]/g)) {
          const line = lineOf(text, hit.index);
          add({
            kind: "entity",
            name: hit[1] as string,
            method: null,
            area: "data",
            detail: "Mongoose model",
            path: f.path,
            line,
            excerpt: lineText(text, line).trim(),
            certainty: "observed",
          });
        }
    } else if (f.path.endsWith(".py")) {
      for (const hit of text.matchAll(
        /^class\s+(\w+)\((?:[\w.]*\b(?:models\.Model|Base|db\.Model|SQLModel|DeclarativeBase)\b[^)]*)\)\s*:/gm
      )) {
        const line = lineOf(text, hit.index);
        add({
          kind: "entity",
          name: hit[1] as string,
          method: null,
          area: "data",
          detail: "Python model class",
          path: f.path,
          line,
          excerpt: lineText(text, line).trim(),
          certainty: "observed",
        });
      }
    }
  }

  // ------------------------------------------------------------- configuration names (never values)
  const env = new Map<string, { path: string; line: number; refs: number }>();
  const testSet = new Set(facts.testFiles);
  for (const f of code) {
    if (testSet.has(f.path)) continue;
    const text = f.text as string;
    for (const hit of text.matchAll(
      /\b(?:process\.env\.|import\.meta\.env\.|process\.env\[["'`]|os\.environ\[["']|os\.environ\.get\(\s*["']|os\.getenv\(\s*["'])([A-Z][A-Z0-9_]{1,80})\b/g
    )) {
      const name = hit[1] as string;
      if (name === "NODE_ENV") continue;
      const prev = env.get(name);
      if (prev) prev.refs++;
      else env.set(name, { path: f.path, line: lineOf(text, hit.index), refs: 1 });
    }
  }
  for (const [name, loc] of [...env.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const publicVar = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/.test(name);
    add({
      kind: "config",
      name,
      method: null,
      area: "configuration",
      detail: `${publicVar ? "exposed to the browser bundle" : "server-side"}; ${loc.refs} reference(s)`,
      path: loc.path,
      line: loc.line,
      excerpt: null,
      certainty: "observed",
    });
  }

  // ------------------------------------------------------------- integrations
  const manifestLine = (dep: string): { path: string; line: number | null } => {
    const d = facts.deps.get(dep);
    const m = facts.manifests.find((x) => x.path === d?.manifest);
    if (!d || !m) return { path: d?.manifest ?? "package.json", line: null };
    const idx = m.text.indexOf(`"${dep}"`);
    return { path: m.path, line: idx >= 0 ? lineOf(m.text, idx) : null };
  };
  const integration = (dep: string, category: string): void => {
    const loc = manifestLine(dep);
    if (facts.deps.get(dep)?.dev) return;
    add({
      kind: "integration",
      name: dep,
      method: null,
      area: category,
      detail: category,
      path: loc.path,
      line: loc.line,
      excerpt: null,
      certainty: "observed",
    });
  };
  for (const d of facts.dbDeps) integration(d, "data");
  for (const d of facts.authDeps) integration(d, "authentication");
  for (const d of facts.aiDeps) integration(d, "ai");
  for (const d of facts.observability) integration(d, "observability");
  for (const d of [...facts.deps.keys()].sort())
    for (const [re, cat] of INTEGRATIONS) if (re.test(d)) integration(d, cat);

  // ------------------------------------------------------------- authentication boundaries
  for (const f of files) {
    if (!/^(?:src\/)?middleware\.[jt]s$/.test(f.path) || f.text === null) continue;
    const hit = firstLineMatching(f.text, /matcher\s*:/);
    add({
      kind: "auth-boundary",
      name: "middleware",
      method: null,
      area: "authentication",
      detail: hit
        ? `request middleware; ${hit.excerpt}`
        : "request middleware (no matcher: applies to every route)",
      path: f.path,
      line: hit?.line ?? 1,
      excerpt: hit?.excerpt ?? null,
      certainty: "inferred",
    });
  }

  // ------------------------------------------------------------- behaviours named by tests
  for (const p of facts.testFiles) {
    const text = facts.snapshot.byPath.get(p)?.text;
    if (!text) continue;
    for (const hit of text.matchAll(/\b(?:it|test|describe)(?:\.\w+)?\(\s*(["'`])([^"'`\n]{3,200})\1/g)) {
      const line = lineOf(text, hit.index);
      add({
        kind: "test",
        name: (hit[2] as string).trim(),
        method: null,
        area: strip(p).split("/").slice(0, -1).join("/") || ".",
        detail: "test title",
        path: p,
        line,
        excerpt: null,
        certainty: "inferred",
      });
    }
  }

  // ------------------------------------------------------------- notes
  for (const [kind, n] of counts)
    if (n >= MAX_ITEMS_PER_KIND)
      notes.push(
        `More than ${MAX_ITEMS_PER_KIND} ${kind} items were found; only the first ${MAX_ITEMS_PER_KIND} are listed.`
      );
  if (!items.some((i) => i.kind === "page" || i.kind === "endpoint"))
    notes.push(
      "No pages or API endpoints were recognised; the product may be a library, CLI or use a framework this release does not read."
    );
  if (facts.dbDeps.length > 0 && !items.some((i) => i.kind === "entity"))
    notes.push("A data layer is used but no entity definitions were recognised in the repository.");
  if (env.size > 0) notes.push("Configuration is listed by variable name only; values were never read.");
  if (facts.snapshot.files.some((f) => /\.(go|rs|java|kt|php|rb|cs)$/.test(f.path)))
    notes.push(
      "Go, Rust, Java, Kotlin, PHP, Ruby and C# sources are present but their routes and models are not read in this release."
    );

  const order: SurfaceKind[] = [
    "page",
    "endpoint",
    "entity",
    "config",
    "integration",
    "auth-boundary",
    "test",
  ];
  items.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.method ?? "").localeCompare(b.method ?? "") ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
  return { items, notes };
}
