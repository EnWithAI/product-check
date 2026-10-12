// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Derives structured facts from a repository snapshot: manifests and dependencies, lockfiles, tests, CI,
 * documentation, runtime declarations, frameworks, data layer, authentication, AI usage and hosting. Facts are
 * observations of files; whether the product *behaves* accordingly is never inferred from them.
 */
import { basename } from "node:path";
import type { RepoFile, RepoSnapshot } from "../../discovery/repo.js";

/** A dependency manifest (npm package.json or Python requirements/pyproject). */
export interface Manifest {
  path: string;
  ecosystem: "npm" | "python";
  deps: Record<string, string>;
  devDeps: Record<string, string>;
  scripts: Record<string, string>;
  engines: string | null;
  text: string;
}

/** A file location with an optional line. */
export interface Loc {
  path: string;
  line: number | null;
  detail: string;
}

/** Everything derived from the repository. */
export interface RepoFacts {
  snapshot: RepoSnapshot;
  manifests: Manifest[];
  /** package.json files that are not valid JSON. */
  malformedManifests: string[];
  lockfiles: string[];
  deps: Map<string, { version: string; manifest: string; dev: boolean }>;
  frameworks: string[];
  testFiles: string[];
  e2eFiles: string[];
  testScripts: Loc[];
  ciFiles: RepoFile[];
  readme: RepoFile | null;
  runtimeDecl: Loc[];
  staticAnalysis: Loc[];
  observability: string[];
  dbDeps: string[];
  migrations: string[];
  authDeps: string[];
  aiDeps: string[];
  aiEvals: string[];
  hosting: string[];
  headerConfig: Loc[];
  notFoundPages: string[];
  privacyPages: string[];
  securityPolicy: string[];
  envFiles: RepoFile[];
  gitignore: RepoFile | null;
  markupFiles: RepoFile[];
  codeFiles: RepoFile[];
  appRouter: boolean;
}

/** 1-based line number of a character index. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** The text of the given 1-based line. */
export function lineText(text: string, line: number): string {
  return text.split("\n")[line - 1] ?? "";
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const strMap = (v: unknown): Record<string, string> =>
  isObj(v)
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string") as [string, string][])
    : {};

const FRAMEWORKS: [string, string][] = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["nuxt", "Nuxt"],
  ["svelte", "Svelte"],
  ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"],
  ["@remix-run/react", "Remix"],
  ["@angular/core", "Angular"],
  ["solid-js", "Solid"],
  ["vite", "Vite"],
  ["react-scripts", "Create React App"],
  ["expo", "Expo"],
  ["react-native", "React Native"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["@nestjs/core", "NestJS"],
  ["hono", "Hono"],
  ["koa", "Koa"],
  ["django", "Django"],
  ["flask", "Flask"],
  ["fastapi", "FastAPI"],
  ["streamlit", "Streamlit"],
];
const OBSERVABILITY =
  /^(@sentry\/.+|@opentelemetry\/.+|@vercel\/otel|dd-trace|newrelic|@datadog\/.+|@honeybadger-io\/.+|rollbar|@bugsnag\/.+|@highlight-run\/.+|posthog-node|@axiomhq\/.+|@logtail\/.+|sentry-sdk|opentelemetry-.+|ddtrace)$/;
const DB =
  /^(prisma|@prisma\/client|drizzle-orm|typeorm|sequelize|mongoose|knex|kysely|@supabase\/supabase-js|pg|postgres|mysql2|better-sqlite3|@libsql\/client|@planetscale\/database|@neondatabase\/serverless|firebase|firebase-admin|mongodb|@vercel\/postgres|sqlalchemy|psycopg2|psycopg2-binary|psycopg|django|pymongo)$/;
const AUTH =
  /^(next-auth|@auth\/.+|@clerk\/.+|@supabase\/auth-helpers.*|@supabase\/ssr|lucia|passport|@kinde-oss\/.+|better-auth|@auth0\/.+|auth0|firebase|@workos-inc\/.+|@stackframe\/.+|django-allauth|flask-login|authlib)$/;
const AI =
  /^(openai|@anthropic-ai\/sdk|ai|@ai-sdk\/.+|langchain|@langchain\/.+|llamaindex|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/mistralai|groq-sdk|replicate|@huggingface\/inference|anthropic|google-generativeai|google-genai|litellm|llama-index)$/;

/** Parses a requirements.txt / pyproject.toml into a dependency map (names and specifiers only). */
function pythonDeps(file: RepoFile): Record<string, string> {
  const out: Record<string, string> = {};
  const text = file.text ?? "";
  if (basename(file.path) === "pyproject.toml") {
    const block = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(text)?.[1] ?? "";
    for (const m of block.matchAll(/["']([A-Za-z0-9_.-]+)\s*([^"']*)["']/g))
      out[(m[1] as string).toLowerCase()] = (m[2] ?? "").trim();
    return out;
  }
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*(.*)$/.exec(line);
    if (m && !line.startsWith("-")) out[(m[1] as string).toLowerCase()] = (m[2] ?? "").trim();
  }
  return out;
}

/** Derives repository facts. */
export function deriveFacts(snapshot: RepoSnapshot): RepoFacts {
  const files = snapshot.files;
  const readable = files.filter((f) => f.text !== null);
  const manifests: Manifest[] = [];
  const malformedManifests: string[] = [];
  for (const f of readable) {
    const name = basename(f.path);
    if (name === "package.json") {
      try {
        const pkg = JSON.parse(f.text as string) as Record<string, unknown>;
        const engines =
          isObj(pkg["engines"]) && typeof pkg["engines"]["node"] === "string" ? pkg["engines"]["node"] : null;
        manifests.push({
          path: f.path,
          ecosystem: "npm",
          deps: strMap(pkg["dependencies"]),
          devDeps: strMap(pkg["devDependencies"]),
          scripts: strMap(pkg["scripts"]),
          engines,
          text: f.text as string,
        });
      } catch {
        malformedManifests.push(f.path);
      }
    } else if (name === "requirements.txt" || name === "pyproject.toml") {
      manifests.push({
        path: f.path,
        ecosystem: "python",
        deps: pythonDeps(f),
        devDeps: {},
        scripts: {},
        engines: null,
        text: f.text as string,
      });
    }
  }
  manifests.sort((a, b) => a.path.split("/").length - b.path.split("/").length || (a.path < b.path ? -1 : 1));
  const deps = new Map<string, { version: string; manifest: string; dev: boolean }>();
  for (const m of manifests) {
    for (const [n, v] of Object.entries(m.deps))
      if (!deps.has(n)) deps.set(n, { version: v, manifest: m.path, dev: false });
    for (const [n, v] of Object.entries(m.devDeps))
      if (!deps.has(n)) deps.set(n, { version: v, manifest: m.path, dev: true });
  }
  const depNames = [...deps.keys()].sort();
  const lockfiles = files
    .map((f) => f.path)
    .filter((p) =>
      /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|uv\.lock|requirements\.lock)$/.test(
        p
      )
    );

  const testFiles = files
    .map((f) => f.path)
    .filter(
      (p) =>
        /(^|\/)(__tests__|tests?|e2e|cypress|playwright)\//.test(p) ||
        /\.(test|spec|e2e|cy)\.[cm]?[jt]sx?$/.test(p) ||
        /(^|\/)test_[^/]+\.py$|_test\.(py|go)$/.test(p)
    )
    .filter((p) => /\.([cm]?[jt]sx?|py|go)$/.test(p));
  const e2eFiles = [
    ...testFiles.filter((p) =>
      /(^|\/)(e2e|cypress|playwright|acceptance)\/|\.(e2e|cy)\.[cm]?[jt]sx?$/.test(p)
    ),
    ...files.map((f) => f.path).filter((p) => /(^|\/)(playwright|cypress)\.config\.[cm]?[jt]s$/.test(p)),
  ].sort();
  const testScripts: Loc[] = [];
  for (const m of manifests) {
    const test = m.scripts["test"];
    if (test !== undefined && !/no test specified/.test(test)) {
      const idx = m.text.indexOf('"test"');
      testScripts.push({
        path: m.path,
        line: idx >= 0 ? lineOf(m.text, idx) : null,
        detail: `scripts.test = ${test}`,
      });
    }
  }
  if (files.some((f) => /(^|\/)(pytest\.ini|conftest\.py)$/.test(f.path))) {
    const f = files.find((x) => /(^|\/)(pytest\.ini|conftest\.py)$/.test(x.path)) as RepoFile;
    testScripts.push({ path: f.path, line: null, detail: "pytest configuration" });
  }

  const ciFiles = files.filter((f) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.yml$|^\.circleci\/config\.yml$|^azure-pipelines\.yml$|^bitbucket-pipelines\.yml$|^Jenkinsfile$|^\.buildkite\/.+\.ya?ml$/.test(
      f.path
    )
  );
  const readme = files.find((f) => /^readme(\.md|\.markdown|\.txt|\.rst)?$/i.test(f.path)) ?? null;

  const runtimeDecl: Loc[] = [];
  for (const m of manifests) {
    if (m.engines) {
      const idx = m.text.indexOf('"engines"');
      runtimeDecl.push({
        path: m.path,
        line: idx >= 0 ? lineOf(m.text, idx) : null,
        detail: `engines.node = ${m.engines}`,
      });
    }
  }
  for (const f of files) {
    if (/^(\.nvmrc|\.node-version|\.tool-versions|\.python-version|runtime\.txt)$/.test(f.path))
      runtimeDecl.push({ path: f.path, line: 1, detail: basename(f.path) });
  }

  const staticAnalysis: Loc[] = [];
  for (const f of readable) {
    if (
      /(^|\/)tsconfig(\.[^/]+)?\.json$/.test(f.path) &&
      !f.path.includes("/node_modules/") &&
      /"strict"\s*:\s*true/.test(f.text as string)
    ) {
      const idx = (f.text as string).search(/"strict"\s*:\s*true/);
      staticAnalysis.push({
        path: f.path,
        line: lineOf(f.text as string, idx),
        detail: "TypeScript strict mode",
      });
    }
  }
  for (const f of files) {
    if (
      /(^|\/)(\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|\.flake8|ruff\.toml|\.ruff\.toml|\.pylintrc|deno\.json)$/.test(
        f.path
      )
    )
      staticAnalysis.push({ path: f.path, line: null, detail: "linter configuration" });
  }
  for (const m of manifests)
    if (m.ecosystem === "python" && /\[tool\.(ruff|mypy|pylint)\]/.test(m.text))
      staticAnalysis.push({ path: m.path, line: null, detail: "Python linter/type checker configuration" });

  const frameworks = FRAMEWORKS.filter(([dep]) => deps.has(dep)).map(([, name]) => name);
  const migrations = [
    ...new Set(
      files
        .map((f) => f.path)
        .filter((p) =>
          /(^|\/)(prisma\/migrations|drizzle|supabase\/migrations|migrations|alembic\/versions|db\/migrate)\/[^/]+/.test(
            p
          )
        )
        .map((p) =>
          p.replace(
            /^(.*?(prisma\/migrations|drizzle|supabase\/migrations|migrations|alembic\/versions|db\/migrate))\/.*$/,
            "$1"
          )
        )
    ),
  ].sort();
  const hosting = files
    .map((f) => f.path)
    .filter(
      (p) =>
        /^(vercel\.json|netlify\.toml|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|fly\.toml|render\.yaml|railway\.json|wrangler\.toml|app\.yaml|serverless\.yml|Procfile|firebase\.json|amplify\.yml)$/.test(
          p
        ) || /\.tf$/.test(p)
    );

  const headerConfig: Loc[] = [];
  for (const f of readable) {
    const t = f.text as string;
    if (/^next\.config\.[cm]?[jt]s$/.test(f.path) && /headers\s*\(|async\s+headers/.test(t))
      headerConfig.push({
        path: f.path,
        line: lineOf(t, t.search(/headers/)),
        detail: "Next.js headers() configuration",
      });
    if (f.path === "vercel.json" && /"headers"\s*:/.test(t))
      headerConfig.push({
        path: f.path,
        line: lineOf(t, t.search(/"headers"/)),
        detail: "vercel.json headers",
      });
    if (f.path === "netlify.toml" && /\[\[headers\]\]/.test(t))
      headerConfig.push({
        path: f.path,
        line: lineOf(t, t.indexOf("[[headers]]")),
        detail: "netlify.toml headers",
      });
    if (f.path === "_headers" || f.path === "public/_headers")
      headerConfig.push({ path: f.path, line: 1, detail: "_headers file" });
  }
  if (deps.has("helmet"))
    headerConfig.push({
      path: deps.get("helmet")?.manifest ?? "package.json",
      line: null,
      detail: "helmet dependency",
    });

  const paths = files.map((f) => f.path);
  const notFoundPages = paths.filter((p) =>
    /(^|\/)(app|src\/app)\/not-found\.[jt]sx?$|(^|\/)pages\/404\.[jt]sx?$|(^|\/)(public\/)?404\.html$|(^|\/)src\/routes\/\+error\.svelte$|(^|\/)src\/pages\/404\.astro$/.test(
      p
    )
  );
  const privacyPages = paths.filter((p) =>
    /(^|\/)(app|src\/app)\/privacy(-policy)?\/page\.[jt]sx?$|(^|\/)pages\/privacy(-policy)?\.[jt]sx?$|(^|\/)(public\/)?privacy(-policy)?\.html$|(^|\/)src\/(routes|pages)\/privacy/.test(
      p
    )
  );
  const securityPolicy = paths.filter((p) =>
    /^(SECURITY\.md|\.github\/SECURITY\.md|docs\/SECURITY\.md|(public\/|static\/)?\.well-known\/security\.txt)$/i.test(
      p
    )
  );
  const envFiles = files.filter(
    (f) =>
      /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/.test(f.path) &&
      !/\.(example|sample|template|dist|defaults)$/i.test(f.path)
  );
  const aiEvals = paths.filter((p) =>
    /(^|\/)(promptfooconfig\.ya?ml|promptfoo\.config\.[cm]?[jt]s)$|(^|\/)evals?\/[^/]+|\.eval\.[cm]?[jt]s$|_eval\.py$/.test(
      p
    )
  );
  const markupFiles = readable.filter((f) => /\.(html?|[jt]sx|vue|svelte|astro)$/.test(f.path));
  const codeFiles = readable.filter((f) => /\.([cm]?[jt]sx?|vue|svelte|astro|py)$/.test(f.path));
  const appRouter = deps.has("next") && paths.some((p) => /^(src\/)?app\/layout\.[jt]sx?$/.test(p));

  return {
    snapshot,
    manifests,
    malformedManifests,
    lockfiles,
    deps,
    frameworks,
    testFiles,
    e2eFiles,
    testScripts,
    ciFiles,
    readme,
    runtimeDecl,
    staticAnalysis,
    observability: depNames.filter((d) => OBSERVABILITY.test(d)),
    dbDeps: depNames.filter((d) => DB.test(d)),
    migrations,
    authDeps: depNames.filter((d) => AUTH.test(d)),
    aiDeps: depNames.filter((d) => AI.test(d)),
    aiEvals,
    hosting,
    headerConfig,
    notFoundPages,
    privacyPages,
    securityPolicy,
    envFiles,
    gitignore: files.find((f) => f.path === ".gitignore") ?? null,
    markupFiles,
    codeFiles,
    appRouter,
  };
}
