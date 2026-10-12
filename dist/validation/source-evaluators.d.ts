import type { Severity } from "../types.js";
import { type Evaluator } from "./context.js";
/**
 * Test, fixture and example paths. Credential-like strings there are usually deliberate fakes, so matches are
 * reported as P2 hypotheses for human review instead of P0 facts (they never fail the secrets gate on their own).
 */
export declare const FIXTURE_PATH: RegExp;
interface SecretRule {
    name: string;
    re: RegExp;
    severity: Severity;
    describe: string;
    check?: (match: string) => Severity | null;
}
export declare const SECRET_RULES: SecretRule[];
/** Source evaluators by control ID. */
export declare const SOURCE_EVALUATORS: Record<string, Evaluator>;
export {};
