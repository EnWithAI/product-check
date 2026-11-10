import type { RunPermissions } from "./contract/safety.js";
import type { ObservationSet } from "./inspectors/http/observe.js";
import type { Results, ScanContract } from "./types.js";
/** Options for one assessment run. */
export interface RunOptions {
    contract: ScanContract;
    permissions: RunPermissions;
    baseline: {
        results: Results;
        sha256: string;
    } | null;
    now?: () => Date;
    /** Set when the run was refused by the safety gate: produces an ABORTED record without inspecting anything. */
    abortReason?: string;
    /** Directory that paths in the results are made relative to (normally the working directory). */
    baseDir?: string;
}
/** The results plus the live observations (so the CLI can record them). */
export interface RunOutput {
    results: Results;
    observations: ObservationSet | null;
}
/** Run ID: UTC timestamp plus a short hash of the contract and start time. */
export declare function makeRunId(started: Date, contract: ScanContract): string;
/** Runs one assessment. */
export declare function runAssessment(options: RunOptions): Promise<RunOutput>;
