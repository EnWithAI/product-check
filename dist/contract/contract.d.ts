import type { ScanContract } from "../types.js";
/** Actions that are never performed, whatever a contract says. */
export declare const ALWAYS_PROHIBITED: readonly ["production-write", "destructive-test", "real-outreach", "payment-flow", "active-security-scan", "credentialed-access", "personal-data-extraction", "execute-repository-code", "paid-external-call"];
/** A complete contract with defaults. */
export declare function defaultContract(): ScanContract;
/** Fills omitted fields with defaults (as `run` does) for validation of a hand-written contract. */
export declare function withDefaults(raw: unknown): unknown;
/** Validates a complete contract against the schema. */
export declare function assertContract(contract: unknown, label: string): ScanContract;
/**
 * Loads a contract file: omitted fields take defaults, unknown fields are rejected, relative paths (repository and
 * imports) resolve against the contract's directory.
 */
export declare function loadContract(path: string): ScanContract;
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
export declare function applyFlags(base: ScanContract, flags: ContractFlags, cwd: string, today: string): ScanContract;
