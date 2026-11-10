/**
 * Release-verdict rules (pure; recomputed by `validate`):
 *  1. Any failed hard gate or open P0 → NOT_READY.
 *  2. Any open P1 (not covered by a valid risk acceptance) → NOT_READY.
 *  3. Any unverified hard-gate control, or any pillar without a score → INCONCLUSIVE.
 *  4. Any pillar below the threshold, LOW confidence, open P2, or accepted risk → READY_WITH_CONDITIONS.
 *  5. Otherwise READY.
 * The verdict is always bounded by the evidence: the exact revision/origin and what was not verified.
 */
import type { Finding, ReleaseVerdict, Results, Scorecard, Tier, Validation } from "../types.js";
/** Inputs that bound the verdict statement. */
export interface VerdictBounds {
    repository: Results["run"]["target_revision"]["repository"];
    application: Results["run"]["target_revision"]["application"];
    finishedAt: string;
}
/** Computes the release verdict. */
export declare function computeVerdict(scorecard: Scorecard, findings: Finding[], validations: Validation[], tier: Tier, approver: string | null, rejected: {
    acceptance_id: string;
    reason: string;
}[], acceptances: {
    acceptance_id: string;
    finding_ids: string[];
    owner: string;
    expires: string;
}[], bounds: VerdictBounds): ReleaseVerdict;
