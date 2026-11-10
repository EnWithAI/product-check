/**
 * Release gate (VC-P3/VC-P6): GO / CONDITIONAL_GO / NO_GO / UNKNOWN from the product verdict, the closure
 * register, the change review, author-side proof and signed approvals. Rules, in order:
 *
 *  NO_GO          a substantiated blocker: open verified P0/P1, failed hard gate or required check, pending retest,
 *                 regression, a NOT_READY product verdict or a BLOCK change gate.
 *  UNKNOWN        nothing was executed (no passing executed check of any kind), the product verdict is
 *                 INCONCLUSIVE, coverage is below the contract minimum, or required checks/approvals cannot be
 *                 evaluated. A zero-finding scan with no executed checks is UNKNOWN, never green.
 *  NO_GO          (then) release preconditions unmet with sufficient evidence: approvals for HEAD, rollback plan.
 *  CONDITIONAL_GO accepted risks, open P2s, a READY_WITH_CONDITIONS product verdict, a CONDITIONAL change gate, or
 *                 a release condition that could not be evaluated.
 *  GO             every condition PASSES.
 * A high score never overrides a blocker.
 */
import type { Results } from "../types.js";
import { type Approval, type AssurancePolicy, type ChangeReview, type ClosureRegister, type FixPacket, type PhaseProgress, type ReleaseGate, type VerificationRun } from "./types.js";
export interface GateInput {
    results: Results;
    resultsSha: string;
    register: ClosureRegister | null;
    review: ChangeReview | null;
    proof: VerificationRun | null;
    packets: FixPacket[];
    approvals: Approval[];
    policy: AssurancePolicy;
    headSha: string | null;
    /** Change reviews whose head commit is HEAD or one of its ancestors (their findings apply to this commit). */
    relevantReviewIds: string[];
    now: Date;
}
/** Accepted-risk status at a date. */
export declare function acceptanceStatus(expires: string, reviewDate: string, now: Date): "ACTIVE" | "REVIEW_DUE" | "EXPIRED";
/** Phase progress (VC-P0…P7), from what was actually produced. Unexecuted phases are never shown as complete. */
export declare function phaseProgress(i: GateInput): PhaseProgress[];
/** Evaluates the release gate. */
export declare function evaluateGate(i: GateInput): ReleaseGate;
