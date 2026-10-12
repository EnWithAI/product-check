/**
 * Runs every catalog control through the source, application and import evaluators and merges the outcomes:
 * - controls above the selected tier are NOT_APPLICABLE (tiers carry forward downwards, never upwards);
 * - when several sources checked a control, the worst status wins (FAIL > PARTIAL > PASS) and the strongest
 *   evidence strength is reported; evidence and findings are unioned;
 * - with no checked outcome, the control is NOT_APPLICABLE, BLOCKED (its points of presence were inaccessible)
 *   or NOT_TESTED, always with a reason. Nothing unchecked is ever reported as PASS.
 */
import type { Finding, PopEntry, Tier, Validation } from "../types.js";
import { type EvalContext } from "./context.js";
/** Result of evaluating all controls. */
export interface Evaluation {
    validations: Validation[];
    findings: Finding[];
}
/** Evaluates every control. Baseline-dependent PC-T-16 is evaluated afterwards by retest. */
export declare function evaluateControls(ctx: EvalContext, primary: Tier, pops: Map<string, PopEntry>, runId: string): Evaluation;
