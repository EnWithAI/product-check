// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Point-of-presence (PoP) inventory: every place the assessment could observe the product, with its status
 * (AVAILABLE, PARTIAL, BLOCKED, NOT_APPLICABLE), authorization, scope, freshness and provenance. A relevant but
 * inaccessible PoP is BLOCKED, and the controls that depend on it become BLOCKED, which lowers coverage.
 */
import type { ObservationSet } from "../inspectors/http/observe.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type { PopCoverage, PopEntry, ScanContract, Tier } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import { tierIndex } from "../validation/tiers.js";

/** Inputs for the inventory. */
export interface PopInput {
  contract: ScanContract;
  repo: RepoFacts | null;
  app: ObservationSet | null;
  appBlockedReason: string | null;
  testsImported: number;
  auditImported: boolean;
  specImported: boolean;
  outcomeImported: boolean;
  aiInScope: boolean;
  tier: Tier;
  now: string;
}

/** Builds the PoP inventory (evidence IDs are attached later). */
export function buildPops(input: PopInput): PopEntry[] {
  const { repo, app, contract } = input;
  const repoPath = contract.target.repository ? "local checkout (read-only)" : null;
  const repoMissing = "No repository was provided (--repo).";
  const entry = (
    e: Omit<PopEntry, "evidence_ids" | "observed_at" | "access" | "authorization"> &
      Partial<Pick<PopEntry, "observed_at" | "access" | "authorization">>
  ): PopEntry => ({
    access: e.status === "AVAILABLE" || e.status === "PARTIAL" ? "read-only" : "none",
    authorization: "not-required",
    observed_at: e.status === "AVAILABLE" || e.status === "PARTIAL" ? input.now : null,
    evidence_ids: [],
    ...e,
  });
  const fromRepo = (
    id: string,
    category: PopEntry["category"],
    name: string,
    found: boolean,
    missing: string
  ): PopEntry =>
    repo
      ? entry({
          id,
          category,
          name,
          status: found ? "AVAILABLE" : "PARTIAL",
          relevant: true,
          scope: repoPath,
          provenance: "observed",
          limitations: found ? [] : [missing],
        })
      : entry({
          id,
          category,
          name,
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: [repoMissing],
        });

  const pops: PopEntry[] = [];
  const capped = repo?.snapshot.limitations.some((l) => l.code === "file-cap") ?? false;
  pops.push(
    repo
      ? entry({
          id: "repository",
          category: "source-build",
          name: "Source repository",
          status: capped ? "PARTIAL" : "AVAILABLE",
          relevant: true,
          scope: repoPath,
          provenance: "observed",
          limitations: [
            ...(capped ? ["File cap reached; not every file was inspected."] : []),
            ...(repo.snapshot.git.present ? [] : ["No git metadata; revision unknown."]),
          ],
        })
      : entry({
          id: "repository",
          category: "source-build",
          name: "Source repository",
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: [repoMissing],
        })
  );
  pops.push(
    fromRepo(
      "dependency-manifests",
      "source-build",
      "Dependency manifests",
      (repo?.manifests.length ?? 0) > 0,
      "No dependency manifest found."
    )
  );
  pops.push(
    fromRepo(
      "automated-tests",
      "source-build",
      "Automated test sources",
      (repo?.testFiles.length ?? 0) > 0,
      "No test files found."
    )
  );
  pops.push(
    input.testsImported > 0
      ? entry({
          id: "test-results",
          category: "source-build",
          name: "Executed test results",
          status: "AVAILABLE",
          relevant: true,
          scope: `${input.testsImported} imported results file(s)`,
          provenance: "imported",
          limitations: ["Results were produced outside Product Check; their environment is not verified."],
        })
      : entry({
          id: "test-results",
          category: "source-build",
          name: "Executed test results",
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: ["No executed test results were imported (Product Check never runs repository code)."],
        })
  );
  pops.push(
    fromRepo(
      "ci-cd",
      "source-build",
      "CI/CD configuration",
      (repo?.ciFiles.length ?? 0) > 0 || input.outcomeImported,
      "No CI configuration found."
    )
  );
  pops.push(
    repo
      ? entry({
          id: "iac",
          category: "operations",
          name: "Hosting / infrastructure configuration",
          status: repo.hosting.length > 0 ? "AVAILABLE" : "NOT_APPLICABLE",
          relevant: repo.hosting.length > 0,
          scope: repoPath,
          provenance: repo.hosting.length > 0 ? "observed" : "none",
          limitations:
            repo.hosting.length > 0
              ? ["Configuration files only; deployed cloud settings were not read."]
              : ["No hosting or IaC files in the repository."],
        })
      : entry({
          id: "iac",
          category: "operations",
          name: "Hosting / infrastructure configuration",
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: [repoMissing],
        })
  );
  pops.push(
    repo
      ? repo.dbDeps.length > 0
        ? entry({
            id: "database-schema",
            category: "data",
            name: "Database schema and migrations",
            status: repo.migrations.length > 0 ? "AVAILABLE" : "PARTIAL",
            relevant: true,
            scope: repoPath,
            provenance: "observed",
            limitations: [
              "Schema files only; the live database was not accessed.",
              ...(repo.migrations.length > 0 ? [] : ["No migrations directory."]),
            ],
          })
        : entry({
            id: "database-schema",
            category: "data",
            name: "Database schema and migrations",
            status: "NOT_APPLICABLE",
            relevant: false,
            scope: null,
            provenance: "inferred",
            limitations: ["No database dependency detected."],
          })
      : entry({
          id: "database-schema",
          category: "data",
          name: "Database schema and migrations",
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: [repoMissing],
        })
  );

  const url = contract.target.application?.url ?? null;
  if (app) {
    const failed = app.observations.filter((o) => o.error !== null || o.status === null);
    const landing = app.observations.find((o) => o.purpose === "landing" && o.status !== null);
    pops.push(
      entry({
        id: "deployed-web",
        category: "experience",
        name: "Deployed web application",
        status: !landing ? "BLOCKED" : failed.length > 0 ? "PARTIAL" : "AVAILABLE",
        relevant: true,
        scope: `${app.origin} (passive GET requests to fixed paths only)`,
        provenance: app.source === "live" ? "observed" : "imported",
        authorization: app.source === "live" ? "authorized" : "not-required",
        observed_at: app.observations[0]?.requested_at ?? null,
        access: landing ? "read-only" : "none",
        limitations: [
          ...(app.source === "har"
            ? ["Observations come from a HAR file recorded by the user."]
            : app.source === "recorded"
              ? ["Observations were recorded earlier and replayed."]
              : []),
          ...(!landing ? ["The entry page could not be fetched."] : []),
          ...failed.slice(0, 5).map((o) => `${o.purpose}: ${o.error ?? "no response"}`),
          "Unauthenticated pages only; no forms, logins or data-changing actions.",
        ],
      })
    );
  } else {
    pops.push(
      entry({
        id: "deployed-web",
        category: "experience",
        name: "Deployed web application",
        status: "BLOCKED",
        relevant: true,
        scope: url,
        provenance: "none",
        authorization: url ? "not-authorized" : "not-required",
        limitations: [
          url ? (input.appBlockedReason ?? "Not observed.") : "No deployed URL was provided (--url).",
        ],
      })
    );
  }

  const apiSpecs =
    repo?.snapshot.files.filter((f) =>
      /(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$|\.graphql$/i.test(f.path)
    ) ?? [];
  pops.push(
    repo
      ? entry({
          id: "api-definition",
          category: "interfaces",
          name: "API definition (OpenAPI/GraphQL)",
          status: apiSpecs.length > 0 ? "AVAILABLE" : "NOT_APPLICABLE",
          relevant: apiSpecs.length > 0,
          scope:
            apiSpecs.length > 0
              ? apiSpecs
                  .map((f) => f.path)
                  .slice(0, 3)
                  .join(", ")
              : null,
          provenance: apiSpecs.length > 0 ? "observed" : "none",
          limitations:
            apiSpecs.length > 0
              ? ["Inventoried only; API conformance testing is not implemented in this release."]
              : ["No API definition files found."],
        })
      : entry({
          id: "api-definition",
          category: "interfaces",
          name: "API definition (OpenAPI/GraphQL)",
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: [repoMissing],
        })
  );
  const postLaunch = tierIndex(input.tier) >= 4;
  pops.push(
    entry({
      id: "observability",
      category: "operations",
      name: "Production telemetry (logs, metrics, traces, alerts)",
      status: postLaunch ? "BLOCKED" : "NOT_APPLICABLE",
      relevant: postLaunch,
      scope: null,
      provenance: "none",
      limitations: [
        postLaunch
          ? "No telemetry adapter in this release; production signals were not read."
          : "Not required before launch tiers (CT-T4+).",
      ],
    })
  );
  pops.push(
    input.aiInScope
      ? entry({
          id: "ai-integration",
          category: "ai",
          name: "AI integration (SDKs, prompts, evals)",
          status: repo ? "AVAILABLE" : "BLOCKED",
          relevant: true,
          scope: repo ? repo.aiDeps.join(", ") || "declared in contract" : null,
          provenance: repo ? "observed" : "declared",
          limitations: repo ? ["Static inspection only; model behaviour was not exercised."] : [repoMissing],
        })
      : entry({
          id: "ai-integration",
          category: "ai",
          name: "AI integration (SDKs, prompts, evals)",
          status: repo || contract.product.uses_ai === false ? "NOT_APPLICABLE" : "BLOCKED",
          relevant: !repo && contract.product.uses_ai !== false,
          scope: null,
          provenance: repo ? "inferred" : "none",
          limitations: [
            repo
              ? "No AI SDK detected."
              : contract.product.uses_ai === false
                ? "Declared as not using AI."
                : "AI use unknown without source; declare product.uses_ai.",
          ],
        })
  );
  pops.push(
    fromRepo(
      "documentation",
      "governance",
      "Documentation and specifications",
      !!repo?.readme || input.specImported,
      "No README found."
    )
  );
  const govFound = (repo?.privacyPages.length ?? 0) + (repo?.securityPolicy.length ?? 0) > 0 || !!app;
  pops.push(
    repo || app
      ? entry({
          id: "governance",
          category: "governance",
          name: "Privacy and security policies",
          status: govFound ? "AVAILABLE" : "PARTIAL",
          relevant: true,
          scope: null,
          provenance: "observed",
          limitations: ["Presence only; policy content is not assessed (this is not a legal review)."],
        })
      : entry({
          id: "governance",
          category: "governance",
          name: "Privacy and security policies",
          status: "BLOCKED",
          relevant: true,
          scope: null,
          provenance: "none",
          limitations: ["Neither source nor application was available."],
        })
  );
  return pops;
}

/** Wraps PoP entries into the pop-coverage artifact. */
export function popCoverage(pops: PopEntry[]): PopCoverage {
  return {
    schema_version: SCHEMA_VERSION,
    kind: "pop-coverage",
    pops,
    summary: {
      available: pops.filter((p) => p.status === "AVAILABLE").length,
      partial: pops.filter((p) => p.status === "PARTIAL").length,
      blocked: pops.filter((p) => p.status === "BLOCKED").length,
      not_applicable: pops.filter((p) => p.status === "NOT_APPLICABLE").length,
      relevant: pops.filter((p) => p.relevant).length,
    },
  };
}
