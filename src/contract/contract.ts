// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Scan contracts: defaults, loading (with schema validation and path resolution), and construction from CLI
 * flags. A contract is data written by the user; the scanned repository can never supply one implicitly.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { inputError, safetyError, usageError } from "../errors.js";
import { formatErrors, validateAgainst } from "../schema/registry.js";
import type { AuthorizedAction, InspectionMode, LifecycleStage, ScanContract } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";

/** Actions that are never performed, whatever a contract says. */
export const ALWAYS_PROHIBITED = [
  "production-write",
  "destructive-test",
  "real-outreach",
  "payment-flow",
  "active-security-scan",
  "credentialed-access",
  "personal-data-extraction",
  "execute-repository-code",
  "paid-external-call",
] as const;

/** A complete contract with defaults. */
export function defaultContract(): ScanContract {
  return {
    schema_version: SCHEMA_VERSION,
    kind: "scan-contract",
    contract_id: "local-scan",
    labels: { demo: false },
    target: { name: "unnamed product", purpose: null, repository: null, application: null },
    mode: "AUTO",
    lifecycle_stage: "ALPHA",
    tiers: null,
    product: {
      has_user_accounts: null,
      multi_tenant: null,
      handles_personal_data: null,
      uses_ai: null,
      payments: null,
    },
    personas: [],
    critical_journeys: [],
    authorization: {
      authorized_actions: ["read-local-source", "import-artifacts"],
      prohibited_actions: [...ALWAYS_PROHIBITED],
      scope: { origins: [] },
      attestation: null,
    },
    constraints: { max_requests: 12, request_timeout_ms: 10000, max_files: 5000 },
    imports: {
      test_results: [],
      npm_audit: null,
      har: null,
      observations: null,
      spec_check: null,
      impact_check: null,
      outcome_check: null,
    },
    control_mappings: [],
    risk_acceptances: [],
    scoring: { min_coverage: 0.5, pillar_threshold: 70 },
    release: { approver: null },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Deep-merges user values over defaults (objects merge; arrays and scalars replace). */
function merge(base: unknown, over: unknown): unknown {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

/** Fills omitted fields with defaults (as `run` does) for validation of a hand-written contract. */
export function withDefaults(raw: unknown): unknown {
  return merge(defaultContract(), raw);
}

/** Validates a complete contract against the schema. */
export function assertContract(contract: unknown, label: string): ScanContract {
  const errors = validateAgainst("scan-contract.schema.json", contract);
  if (errors.length > 0) throw usageError(`Invalid scan contract ${label}:\n${formatErrors(errors)}`);
  return contract as ScanContract;
}

/**
 * Loads a contract file: omitted fields take defaults, unknown fields are rejected, relative paths (repository and
 * imports) resolve against the contract's directory.
 */
export function loadContract(path: string): ScanContract {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw inputError(`Cannot read scan contract ${path}: ${(error as Error).message}`);
  }
  if (!isObj(raw)) throw usageError(`Scan contract ${path} must be a JSON object.`);
  const auth = isObj(raw["authorization"]) ? raw["authorization"] : {};
  const requested = Array.isArray(auth["authorized_actions"]) ? auth["authorized_actions"].map(String) : [];
  const forbidden = requested.filter((a) => (ALWAYS_PROHIBITED as readonly string[]).includes(a));
  if (forbidden.length > 0)
    throw safetyError(
      `The contract authorizes prohibited actions: ${forbidden.join(", ")}. Product Check never performs them.`
    );
  const contract = assertContract(merge(defaultContract(), raw), path);
  const base = dirname(path);
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(base, p));
  if (contract.target.repository) contract.target.repository.path = abs(contract.target.repository.path);
  const i = contract.imports;
  i.test_results = i.test_results.map(abs);
  for (const key of [
    "npm_audit",
    "har",
    "observations",
    "spec_check",
    "impact_check",
    "outcome_check",
  ] as const) {
    const value = i[key];
    if (value !== null) i[key] = abs(value);
  }
  return contract;
}

/** CLI flag inputs that can build or override a contract. */
export interface ContractFlags {
  repo?: string | undefined;
  url?: string | undefined;
  stage?: string | undefined;
  mode?: string | undefined;
  name?: string | undefined;
  authorize?: string[] | undefined;
  testResults?: string[] | undefined;
  npmAudit?: string | undefined;
  har?: string | undefined;
  observations?: string | undefined;
  specCheck?: string | undefined;
  impactCheck?: string | undefined;
  outcomeCheck?: string | undefined;
}

/** Applies CLI flags over a contract (flags win). Paths are resolved against cwd. */
export function applyFlags(
  base: ScanContract,
  flags: ContractFlags,
  cwd: string,
  today: string
): ScanContract {
  const c = structuredClone(base);
  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p));
  if (flags.name !== undefined) c.target.name = flags.name;
  if (flags.repo !== undefined) c.target.repository = { path: abs(flags.repo) };
  if (flags.url !== undefined) {
    let origin: string;
    try {
      origin = new URL(flags.url).origin;
    } catch {
      throw usageError(`--url is not a valid URL: ${flags.url}`);
    }
    c.target.application = { url: flags.url };
    if (!c.authorization.scope.origins.includes(origin)) c.authorization.scope.origins.push(origin);
  }
  if (flags.stage !== undefined) c.lifecycle_stage = flags.stage as LifecycleStage;
  if (flags.mode !== undefined) c.mode = flags.mode as InspectionMode;
  if (flags.authorize && flags.authorize.length > 0) {
    for (const a of flags.authorize) {
      if (!c.authorization.authorized_actions.includes(a as AuthorizedAction))
        c.authorization.authorized_actions.push(a as AuthorizedAction);
    }
    c.authorization.attestation ??= {
      statement:
        "Authorized on the command line (--authorize) by the person running Product Check, who confirms they own or may test the target.",
      authorized_by: "local CLI user",
      date: today,
    };
  }
  if (flags.testResults) c.imports.test_results = [...c.imports.test_results, ...flags.testResults.map(abs)];
  if (flags.npmAudit !== undefined) c.imports.npm_audit = abs(flags.npmAudit);
  if (flags.har !== undefined) c.imports.har = abs(flags.har);
  if (flags.observations !== undefined) c.imports.observations = abs(flags.observations);
  if (flags.specCheck !== undefined) c.imports.spec_check = abs(flags.specCheck);
  if (flags.impactCheck !== undefined) c.imports.impact_check = abs(flags.impactCheck);
  if (flags.outcomeCheck !== undefined) c.imports.outcome_check = abs(flags.outcomeCheck);
  if (c.target.name === "unnamed product") {
    c.target.name = c.target.repository
      ? (c.target.repository.path.split(/[\\/]/).filter(Boolean).at(-1) ?? "product")
      : c.target.application
        ? new URL(c.target.application.url).host
        : "unnamed product";
  }
  return assertContract(c, "(after applying command-line flags)");
}
