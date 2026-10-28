import { type EvalContext, type Evaluator, type Outcome } from "./context.js";
/** Evaluates a control from tests mapped to it in the contract. */
export declare function mappedOutcome(ctx: EvalContext, controlId: string): Outcome | null;
/** Import-backed evaluators by control ID. */
export declare const IMPORT_EVALUATORS: Record<string, Evaluator>;
