/**
 * The control catalog (rubric pc-rubric-0.1). Each control states what is expected, which pillar and lifecycle
 * tier it belongs to, its weight, whether it backs a hard gate, and the remediation knowledge used by the
 * blueprint. Evaluation logic lives in evaluators; this file is data only.
 */
import type { Horizon, Pillar, Severity, Tier, UxSeverity } from "../types.js";
/** Remediation knowledge attached to a control (used only when the control fails). */
export interface RemediationTemplate {
    change: string;
    why: string;
    to_be: string;
    alternatives: string[];
    steps: string[];
    acceptance: string[];
    regression: string;
    effort: "S" | "M" | "L" | null;
    human_review: boolean;
    depends_on: string[];
    horizon?: Horizon;
}
/** One control in the catalog. */
export interface ControlDef {
    id: string;
    pillar: Pillar;
    tier: Tier;
    title: string;
    expected: string;
    category: string;
    /** 3 = hard-gate/critical, 2 = core, 1 = hygiene. */
    weight: 1 | 2 | 3;
    gate: string | null;
    severity: Severity;
    ux: UxSeverity | null;
    pops: string[];
    impact: {
        customer: string | null;
        technology: string | null;
        trust: string | null;
    };
    root_cause: string;
    remediation: RemediationTemplate;
}
/** Hard gates: a FAIL on any member control blocks READY regardless of scores. */
export declare const GATES: {
    id: string;
    title: string;
}[];
declare const VERIFY = "Re-run Product Check with `product-check retest --baseline <previous results>` and confirm the control evaluates PASS with new evidence.";
export declare const CONTROLS: ControlDef[];
/** Catalog lookup by ID. */
export declare const CONTROL_BY_ID: ReadonlyMap<string, ControlDef>;
/** Returns a control or throws (programming error). */
export declare function control(id: string): ControlDef;
export { VERIFY as VERIFY_INSTRUCTION };
