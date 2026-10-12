// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Optional importers for artifacts produced by other tools: `npm audit --json`, and the JSON reports of the
 * sibling Engineering Commons tools (Spec Check 1.0, Impact Check 2.0, Outcome Check 1.0). Each importer reads
 * only the documented fields it needs and rejects unknown schema versions instead of guessing.
 */
import { inputError } from "../errors.js";

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Vulnerability counts from npm audit. */
export interface AuditSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  packages: { name: string; severity: string }[];
}

/** Parses `npm audit --json` (npm 7+ format, auditReportVersion 2). */
export function parseNpmAudit(data: unknown, source: string): AuditSummary {
  if (
    !isObj(data) ||
    !isObj(data["metadata"]) ||
    !isObj((data["metadata"] as Record<string, unknown>)["vulnerabilities"])
  ) {
    throw inputError(
      `${source} is not npm audit JSON (missing metadata.vulnerabilities).`,
      "Produce it with `npm audit --json > npm-audit.json`."
    );
  }
  const v = (data["metadata"] as Record<string, Record<string, unknown>>)["vulnerabilities"] as Record<
    string,
    unknown
  >;
  const packages: { name: string; severity: string }[] = [];
  if (isObj(data["vulnerabilities"])) {
    for (const [name, info] of Object.entries(data["vulnerabilities"])) {
      if (isObj(info) && typeof info["severity"] === "string")
        packages.push({ name, severity: info["severity"] });
    }
  }
  packages.sort((a, b) => (a.name < b.name ? -1 : 1));
  return {
    critical: num(v["critical"]),
    high: num(v["high"]),
    moderate: num(v["moderate"]),
    low: num(v["low"]),
    packages,
  };
}

/** Summary of a Spec Check report. */
export interface SpecCheckSummary {
  high: number;
  medium: number;
  requirements: number;
}

/** Parses a Spec Check report (schema 1.0). */
export function parseSpecCheck(data: unknown, source: string): SpecCheckSummary {
  if (
    !isObj(data) ||
    data["schema_version"] !== "1.0" ||
    !Array.isArray(data["findings"]) ||
    !Array.isArray(data["requirements"])
  ) {
    throw inputError(
      `${source} is not a Spec Check report (schema 1.0).`,
      "Produce it with `spec-check check --format json`."
    );
  }
  const findings = data["findings"].filter(isObj);
  return {
    high: findings.filter((f) => f["severity"] === "high").length,
    medium: findings.filter((f) => f["severity"] === "medium").length,
    requirements: data["requirements"].length,
  };
}

/** Summary of an Impact Check report. */
export interface ImpactCheckSummary {
  high: number;
  findings: number;
  affected_modules: number;
  test_candidates: number;
  commit: string | null;
}

/** Parses an Impact Check report (schema 2.0). */
export function parseImpactCheck(data: unknown, source: string): ImpactCheckSummary {
  if (!isObj(data) || data["schema_version"] !== "2.0" || !Array.isArray(data["findings"])) {
    throw inputError(
      `${source} is not an Impact Check report (schema 2.0).`,
      "Produce it with `impact-check --format json`."
    );
  }
  const findings = data["findings"].filter(isObj);
  const head = isObj(data["repo_revision"]) ? data["repo_revision"] : {};
  return {
    high: findings.filter((f) => f["severity"] === "high").length,
    findings: findings.length,
    affected_modules: Array.isArray(data["affected_modules"]) ? data["affected_modules"].length : 0,
    test_candidates: Array.isArray(data["test_candidates"]) ? data["test_candidates"].length : 0,
    commit: typeof head["commit"] === "string" ? head["commit"] : null,
  };
}

/** Summary of an Outcome Check report. */
export interface OutcomeCheckSummary {
  ci_first_pass_rate: number | null;
  reverted_prs: number | null;
}

/** Parses an Outcome Check report (schema 1.0); reads the all-PR segment of two metrics. */
export function parseOutcomeCheck(data: unknown, source: string): OutcomeCheckSummary {
  if (!isObj(data) || data["schema_version"] !== "1.0" || !Array.isArray(data["metrics"])) {
    throw inputError(
      `${source} is not an Outcome Check report (schema 1.0).`,
      "Produce it with `outcome-check report --format json`."
    );
  }
  const metric = (id: string): Record<string, unknown> | null => {
    const m = data["metrics"] as unknown[];
    const found = m.find((x) => isObj(x) && x["id"] === id);
    if (!isObj(found) || !isObj(found["segments"])) return null;
    const all = (found["segments"] as Record<string, unknown>)["all"];
    return isObj(all) ? all : null;
  };
  const ci = metric("ci_first_pass_rate");
  const reverts = metric("revert_rate");
  return {
    ci_first_pass_rate: ci && typeof ci["value"] === "number" ? ci["value"] : null,
    reverted_prs: reverts && typeof reverts["numerator"] === "number" ? reverts["numerator"] : null,
  };
}
