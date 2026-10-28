/**
 * Point-of-presence (PoP) inventory: every place the assessment could observe the product, with its status
 * (AVAILABLE, PARTIAL, BLOCKED, NOT_APPLICABLE), authorization, scope, freshness and provenance. A relevant but
 * inaccessible PoP is BLOCKED, and the controls that depend on it become BLOCKED, which lowers coverage.
 */
import type { ObservationSet } from "../inspectors/http/observe.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type { PopCoverage, PopEntry, ScanContract, Tier } from "../types.js";
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
    /** OpenSLO, alert rules or a service graph was imported (CT-T4). */
    operationalImported: boolean;
    aiInScope: boolean;
    tier: Tier;
    now: string;
}
/** Builds the PoP inventory (evidence IDs are attached later). */
export declare function buildPops(input: PopInput): PopEntry[];
/** Wraps PoP entries into the pop-coverage artifact. */
export declare function popCoverage(pops: PopEntry[]): PopCoverage;
