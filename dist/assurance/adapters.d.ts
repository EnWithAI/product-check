import type { ChangeReview } from "./types.js";
/** Supported report versions, by tool. */
export declare const ADAPTER_VERSIONS: {
    readonly "impact-check": readonly ["2.0"];
    readonly "spec-check": readonly ["1.0"];
    readonly "outcome-check": readonly ["1.0"];
};
/** Impact Check 2.0 → risk input. */
export declare function impactAdapter(data: unknown, source: string): NonNullable<ChangeReview["risk"]["impact_check"]> & {
    modules: string[];
};
/** Spec Check 1.0 → requirements and gaps. */
export interface SpecInput {
    requirements: {
        id: string;
        path: string;
        line: number | null;
    }[];
    gaps: {
        id: string;
        severity: string;
        summary: string;
        path: string | null;
    }[];
}
export declare function specAdapter(data: unknown, source: string): SpecInput;
/** Outcome Check 1.0 → delivery signal. */
export interface OutcomeInput {
    ci_first_pass_rate: number | null;
    revert_rate: number | null;
}
export declare function outcomeAdapter(data: unknown, source: string): OutcomeInput;
