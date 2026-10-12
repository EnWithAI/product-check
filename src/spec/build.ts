// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Builds an as-built specification from the discovered product surface. The spec states what the repository
 * structurally provides (pages, endpoints, entities, integrations, configuration) with evidence for each statement,
 * marks interpretations as inferred, and leaves everything the code cannot tell us (purpose, users, priorities,
 * measurable targets) as explicit `[NEEDS CLARIFICATION: …]` markers for a person to resolve. No intent is invented.
 *
 * Statements are Markdown: every repository-derived string inside them is escaped here (`code` or `md`), so the
 * renderer can print them as they are.
 */
import type { EvidenceCollector } from "../evidence/collector.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type { ProductSurface, SurfaceItem } from "../inspectors/source/surface.js";
import type {
  AsBuiltBody,
  AsBuiltSpec,
  Evidence,
  Limitation,
  Results,
  ScanContract,
  SpecRequirement,
  SpecStory,
  SurfaceEntry,
} from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import { code, md } from "../reporting/escape.js";
import { stableId } from "../util/hash.js";
import { TOOL_VERSION } from "../version.js";

/** Inputs for the as-built spec. */
export interface SpecInput {
  contract: ScanContract;
  facts: RepoFacts;
  surface: ProductSurface;
  ev: EvidenceCollector;
  repository: string;
  generatedAt: string;
}

const EDGE_HINT =
  /\b(invalid|reject|error|unauthori[sz]ed|forbidden|denied|expired|missing|empty|fail|not found|duplicate|limit|isolat)/i;
const RATE_LIMIT =
  /^(express-rate-limit|@upstash\/ratelimit|rate-limiter-flexible|@fastify\/rate-limit|slowapi)$/;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const where = (s: SurfaceEntry): string =>
  code(`${s.location.path}${s.location.line ? `:${s.location.line}` : ""}`);

/** Builds the as-built specification. */
export function buildAsBuiltSpec(input: SpecInput): AsBuiltSpec {
  const { facts, surface, ev, contract } = input;
  const revision = facts.snapshot.git.commit;

  // ------------------------------------------------------------- surface with evidence
  const entryOf = (item: SurfaceItem): SurfaceEntry => {
    const integration = item.kind === "integration";
    const evidenceId = ev.add({
      kind: integration ? "manifest-field" : "source-location",
      pop: integration ? "dependency-manifests" : item.kind === "test" ? "automated-tests" : "repository",
      strength: item.certainty === "observed" ? "static" : "inferred",
      provenance: item.certainty,
      locator: item.path,
      line: item.line,
      revision,
      summary: `${item.kind} ${item.method ? `${item.method} ` : ""}${item.name}: ${item.detail}`,
      excerpt: item.excerpt,
      checksum: facts.snapshot.byPath.get(item.path)?.sha256 ?? null,
    });
    return {
      id: stableId("SRF", [item.kind, item.method, item.name, item.path], 10),
      kind: item.kind,
      name: item.name,
      method: item.method,
      area: item.area,
      detail: item.detail,
      location: { path: item.path, line: item.line },
      certainty: item.certainty,
      auth_hint: item.auth_hint,
      evidence_ids: [evidenceId],
    };
  };
  const entries = surface.items.map(entryOf);
  const ofKind = (k: SurfaceEntry["kind"]): SurfaceEntry[] => entries.filter((e) => e.kind === k);
  const locEv = (path: string, line: number | null, summary: string, pop = "repository"): string =>
    ev.add({
      kind: "source-location",
      pop,
      strength: "static",
      provenance: "observed",
      locator: path,
      line,
      revision,
      summary,
      checksum: facts.snapshot.byPath.get(path)?.sha256 ?? null,
    });

  const requirements: SpecRequirement[] = [];
  const clarifications: string[] = [];
  const fr = (statement: string, certainty: SpecRequirement["certainty"], items: SurfaceEntry[]): string => {
    const id = `FR-${String(requirements.length + 1).padStart(3, "0")}`;
    requirements.push({
      id,
      statement,
      certainty,
      surface_ids: items.map((i) => i.id),
      evidence_ids: [...new Set(items.flatMap((i) => i.evidence_ids))].sort(),
    });
    return id;
  };

  // ------------------------------------------------------------- stories per route area
  const routes = [...ofKind("page"), ...ofKind("endpoint")];
  const areas = [...new Set(routes.map((r) => r.area))].sort((a, b) =>
    a === "home" ? -1 : b === "home" ? 1 : cmp(a, b)
  );
  const tests = ofKind("test");
  const usedTests = new Set<string>();
  const journeys = contract.critical_journeys;
  const matchedJourneys = new Set<string>();
  const stories: SpecStory[] = [];
  for (const area of areas) {
    const members = routes
      .filter((r) => r.area === area)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "page" ? -1 : 1) || cmp(a.name, b.name));
    const ids: string[] = [];
    for (const r of members) {
      if (r.kind === "page")
        ids.push(
          fr(
            `The system MUST serve the page ${code(r.name)}.${r.auth_hint ? " Its source references an authentication helper, so access is likely limited to signed-in users." : ""}`,
            r.auth_hint ? "inferred" : r.certainty,
            [r]
          )
        );
      else
        ids.push(
          fr(
            `The system MUST handle ${r.method === "ANY" ? "requests of any method" : `${code(r.method ?? "ANY")} requests`} to ${code(r.name)}.${r.auth_hint ? " The handler references an authentication helper, so access is likely limited to signed-in users." : ""}`,
            r.auth_hint ? "inferred" : r.certainty,
            [r]
          )
        );
    }
    // Match on a crude stem ("notes" → "note") so singular and plural mentions both count.
    const stem = area.replace(/[^a-z0-9]/gi, "").replace(/(?<=.{3})s$/i, "");
    const word = new RegExp(`\\b${stem}`, "i");
    const matchable = area !== "home" && stem.length >= 3;
    const behaviours = tests
      .filter((t) => matchable && (word.test(t.name) || word.test(t.location.path)))
      .map((t) => {
        usedTests.add(t.id);
        return t;
      });
    const journey = matchable ? (journeys.find((j) => word.test(j)) ?? null) : null;
    if (journey) matchedJourneys.add(journey);
    const label =
      area === "home" ? "Home and top-level pages" : `${area.charAt(0).toUpperCase()}${area.slice(1)}`;
    stories.push({
      id: `US-${stories.length + 1}`,
      area,
      title: label,
      critical_journey: journey,
      surface_ids: [...members, ...behaviours].map((m) => m.id),
      requirement_ids: ids,
      test_behaviours: behaviours.map((b) => b.name),
    });
    clarifications.push(`Purpose of the ${label} area: who uses it, and what outcome it must deliver.`);
  }
  for (const j of journeys)
    if (!matchedJourneys.has(j))
      clarifications.push(
        `Critical journey "${j}" is declared in the scan contract but no discovered route matches it.`
      );

  // ------------------------------------------------------------- entities, integrations, configuration, auth
  const entities = new Map<string, SurfaceEntry[]>();
  for (const e of ofKind("entity"))
    entities.set(e.name.toLowerCase(), [...(entities.get(e.name.toLowerCase()) ?? []), e]);
  for (const group of entities.values()) {
    const first = group[0] as SurfaceEntry;
    const fields = group.find((g) => g.detail.startsWith("fields:"));
    fr(
      `The system MUST persist ${code(first.name)} records${
        fields || group.length > 1
          ? ` (${[fields ? md(fields.detail) : "", group.length > 1 ? `defined in ${group.length} places` : ""].filter(Boolean).join("; ")})`
          : ""
      }.`,
      "observed",
      group
    );
  }
  for (const i of ofKind("integration"))
    fr(`The system MUST integrate with ${code(i.name)} (${md(i.detail)}).`, "observed", [i]);
  const config = ofKind("config");
  if (config.length > 0) {
    const browser = config.filter((c) => c.detail.startsWith("exposed"));
    fr(
      `The system MUST be configured through ${config.length} environment variable(s): ${config.map((c) => code(c.name)).join(", ")}.${browser.length > 0 ? ` ${browser.map((c) => code(c.name)).join(", ")} ${browser.length === 1 ? "is" : "are"} exposed to the browser bundle and MUST NOT hold secrets.` : ""}`,
      "observed",
      config
    );
  }
  for (const a of ofKind("auth-boundary"))
    fr(
      `Requests MUST pass through ${code(a.name)} before reaching application routes (${code(a.detail)}).`,
      "inferred",
      [a]
    );

  // ------------------------------------------------------------- non-functional (observed only) + gaps
  const nfr: SpecRequirement[] = [];
  const addNfr = (statement: string, certainty: SpecRequirement["certainty"], evidence: string[]): void => {
    nfr.push({
      id: `NFR-${String(nfr.length + 1).padStart(3, "0")}`,
      statement,
      certainty,
      surface_ids: [],
      evidence_ids: evidence,
    });
  };
  for (const r of facts.runtimeDecl)
    addNfr(`The system MUST run on the declared runtime (${code(r.detail)}).`, "observed", [
      locEv(r.path, r.line, `runtime declaration: ${r.detail}`),
    ]);
  for (const h of facts.headerConfig)
    addNfr(
      `Responses MUST carry the HTTP headers configured in ${code(h.path)} (${md(h.detail)}).`,
      "observed",
      [locEv(h.path, h.line, `header configuration: ${h.detail}`)]
    );
  const rateLimit = [...facts.deps.keys()].filter((d) => RATE_LIMIT.test(d)).sort();
  for (const d of rateLimit) {
    const m = facts.deps.get(d);
    addNfr(`Requests MUST be rate-limited (${code(d)}).`, "inferred", [
      locEv(m?.manifest ?? "package.json", null, `dependency ${d}`, "dependency-manifests"),
    ]);
  }
  for (const gap of [
    "response-time and throughput targets for the main pages and endpoints",
    "availability target and acceptable downtime",
    "how long personal and business data is kept, and how it is deleted",
  ])
    addNfr(`[NEEDS CLARIFICATION: ${gap}]`, "hypothesis", []);

  // ------------------------------------------------------------- edge cases
  const edges: SpecRequirement[] = [];
  const addEdge = (
    statement: string,
    certainty: SpecRequirement["certainty"],
    items: SurfaceEntry[],
    evidence: string[] = []
  ): void => {
    edges.push({
      id: `EC-${String(edges.length + 1).padStart(3, "0")}`,
      statement,
      certainty,
      surface_ids: items.map((i) => i.id),
      evidence_ids: [...new Set([...evidence, ...items.flatMap((i) => i.evidence_ids)])].sort(),
    });
  };
  for (const p of facts.notFoundPages)
    addEdge(
      "Requests for unknown routes show a dedicated not-found page.",
      "observed",
      [],
      [locEv(p, 1, "not-found page", "repository")]
    );
  for (const t of tests.filter((x) => EDGE_HINT.test(x.name)))
    addEdge(`A test describes this case: ${md(t.name)} (${where(t)}).`, "inferred", [t]);

  // ------------------------------------------------------------- success criteria
  const success: SpecRequirement[] = [
    {
      id: "SC-001",
      statement:
        "[NEEDS CLARIFICATION: measurable outcomes cannot be derived from source code; state the targets this product must meet]",
      certainty: "hypothesis",
      surface_ids: [],
      evidence_ids: [],
    },
  ];
  if (facts.e2eFiles.length > 0)
    success.push({
      id: "SC-002",
      statement: `The ${facts.e2eFiles.length} end-to-end test file(s) pass on every release candidate (for example ${code(facts.e2eFiles[0] ?? "")}).`,
      certainty: "inferred",
      surface_ids: [],
      evidence_ids: [locEv(facts.e2eFiles[0] as string, null, "end-to-end test file", "automated-tests")],
    });

  // ------------------------------------------------------------- uncertainties
  const uncertainties = [
    "Purpose, users, priorities and business rules are not derivable from code; every story carries a clarification for them.",
    "Nothing was executed: requirements describe what the code declares, not verified behaviour.",
    ...(tests.length > 0 && usedTests.size < tests.length
      ? [
          `${tests.length - usedTests.size} test title(s) could not be matched to a route area and are listed separately.`,
        ]
      : []),
    ...surface.notes,
  ];
  const limitations: Limitation[] = facts.snapshot.limitations;

  return {
    schema_version: SCHEMA_VERSION,
    kind: "as-built-spec",
    generated_at: input.generatedAt,
    tool: { name: "product-check", version: TOOL_VERSION },
    target: {
      name: contract.target.name,
      repository: input.repository,
      commit: revision,
      ref: facts.snapshot.git.ref ?? null,
    },
    surface: entries,
    stories,
    requirements,
    non_functional: nfr,
    success_criteria: success,
    edge_cases: edges,
    clarifications,
    uncertainties,
    evidence: referencedEvidence(ev.all(), {
      surface: entries,
      requirements,
      non_functional: nfr,
      success_criteria: success,
      edge_cases: edges,
    }),
    limitations,
  };
}

/** The evidence items a spec references (a shared collector may hold others, for example during `run`). */
function referencedEvidence(
  all: Evidence[],
  parts: Pick<AsBuiltBody, "surface" | "requirements" | "non_functional" | "success_criteria" | "edge_cases">
): Evidence[] {
  const ids = new Set(
    [
      parts.surface,
      parts.requirements,
      parts.non_functional,
      parts.success_criteria,
      parts.edge_cases,
    ].flatMap((list) => list.flatMap((x) => x.evidence_ids))
  );
  return all.filter((e) => ids.has(e.id));
}

/** The part of a spec that is embedded in the blueprint. */
export function asBuiltBody(spec: AsBuiltSpec): AsBuiltBody {
  return {
    surface: spec.surface,
    stories: spec.stories,
    requirements: spec.requirements,
    non_functional: spec.non_functional,
    success_criteria: spec.success_criteria,
    edge_cases: spec.edge_cases,
    clarifications: spec.clarifications,
    uncertainties: spec.uncertainties,
  };
}

/** Rebuilds the standalone as-built spec from a results document (null when source was not inspected). */
export function specFromResults(r: Results): AsBuiltSpec | null {
  const body = r.blueprint.as_is.as_built;
  const repo = r.run.target_revision.repository;
  if (!body || !repo) return null;
  return {
    schema_version: SCHEMA_VERSION,
    kind: "as-built-spec",
    generated_at: r.run.started_at,
    tool: { name: "product-check", version: r.run.tool_version },
    target: { name: r.contract.target.name, repository: repo.label, commit: repo.commit, ref: repo.ref },
    ...body,
    evidence: referencedEvidence(r.evidence, body),
    limitations: r.limitations,
  };
}
