import type { Results, Severity } from "../types.js";
import { type Actor, type Approval, type AssurancePolicy, type ChangeReview, type ClosureRegister, type ClosureState, type CommandSpec, type FixRecord, type RegisterEntry, type RiskAcceptanceV32, type Transition, type VerificationRun } from "./types.js";
/** Allowed transitions (CT3 v3.2), plus documented out-edges for REGRESSED. */
export declare const TRANSITIONS: Record<ClosureState, ClosureState[]>;
/** Risk tier of a finding for approval counts. */
export declare const findingRisk: (s: Severity) => "LOW" | "MEDIUM" | "HIGH";
/** Creates a register from a baseline results document. */
export declare function createRegister(results: Results, resultsSha: string, repo: string | null, policy: AssurancePolicy, now: Date): ClosureRegister;
/** Adds findings that are new in a results document and marks reappearing verified/closed ones REGRESSED. */
export declare function syncResults(reg: ClosureRegister, results: Results, repo: string | null, now: Date): {
    added: string[];
    regressed: string[];
};
/** Adds non-disproven findings of a change review. */
export declare function syncReview(reg: ClosureRegister, review: ChangeReview, now: Date): string[];
/** A direct transition by a person or agent (ACKNOWLEDGED, IN_PROGRESS, DEFERRED, OPEN). */
export declare function manualTransition(reg: ClosureRegister, id: string, to: ClosureState, actor: Actor, reason: string, now: Date, extra?: {
    owner?: string;
    revisit?: string;
}): Transition;
/** Records a fix commit: IN_PROGRESS → FIX_PROPOSED → RETEST_REQUIRED. Never marks anything fixed. */
export declare function recordFix(reg: ClosureRegister, ids: string[], changeSha: string, actor: Actor, reproduction: CommandSpec[], policy: AssurancePolicy, now: Date): FixRecord;
/** Applies a verification run's outcome. */
export declare function applyVerification(reg: ClosureRegister, run: VerificationRun, now: Date, maxCycles?: number): {
    verified: string[];
    failed: string[];
    escalated: string[];
    unchanged: string[];
};
/** Adds signed approvals (deduplicated by ID). */
export declare function addApproval(reg: ClosureRegister, a: Approval): void;
/** Closes a verified finding (invariant 3). */
export declare function closeFinding(reg: ClosureRegister, id: string, verificationId: string, actorId: string, policy: AssurancePolicy, now: Date): RegisterEntry;
/** Records a v3.2 risk acceptance (invariant 4). */
export declare function acceptRisk(reg: ClosureRegister, input: Omit<RiskAcceptanceV32, "acceptance_id" | "approval_ids" | "created_at">, policy: AssurancePolicy, sha: string | null, now: Date): RiskAcceptanceV32;
/** Rejects a finding as a false positive; P0/P1 need signed human approval (secondary support). */
export declare function rejectFalsePositive(reg: ClosureRegister, id: string, rationale: string, actor: Actor, policy: AssurancePolicy, now: Date): RegisterEntry;
/** Re-opens accepted risks whose expiry passed (an expired acceptance never stays green). */
export declare function expireAcceptances(reg: ClosureRegister, now: Date): string[];
/** Integrity: chain, transition legality, guarded-state invariants and referential integrity. */
export declare function checkRegister(reg: ClosureRegister): string[];
