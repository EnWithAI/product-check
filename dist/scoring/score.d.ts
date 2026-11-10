import type { Finding, GateResult, RunSummary, Scorecard, Validation } from "../types.js";
/** Findings that still count as open (not accepted, not resolved). */
export declare const isOpen: (f: Finding) => boolean;
/** Gate results from validations. */
export declare function computeGates(validations: Validation[]): GateResult[];
/** Computes the scorecard. `previous` is the summary of the baseline run, if any. */
export declare function computeScorecard(validations: Validation[], findings: Finding[], parameters: {
    min_coverage: number;
    pillar_threshold: number;
}, previous: RunSummary | null): Scorecard;
/** Weight of a control from the catalog (fallback 1 for unknown IDs). */
export declare const weightOf: (controlId: string) => 1 | 2 | 3;
