import type { Finding, Results, Severity } from "../types.js";
import { type RuleHit } from "./lanes.js";
import type { DiffFile } from "./diff.js";
import type { FindingVerification, VerificationCheck, VerificationState } from "./types.js";
/** Rules evaluated over a whole changed file (re-checked with the file rules, not line by line). */
export declare const FILE_RULES: Set<string>;
/** True when a verified finding of this severity may block. P0 also blocks unverified under a fail-closed policy. */
export declare function isBlocking(severity: Severity, state: VerificationState, failClosedP0: boolean): boolean;
/** Re-checks a review hit against the file as it is at the head commit. */
export declare function recheckHit(hit: RuleHit, headText: string | null, diffFile: DiffFile | undefined): VerificationCheck;
/** Verifies a hit given the recheck and the other hits/claims of the same review. */
export declare function verifyHit(hit: RuleHit, recheck: VerificationCheck, others: {
    path: string;
    line: number | null;
    source: string;
}[]): FindingVerification;
/** An external reviewer's claim (for example an AI code reviewer's comment). */
export interface ReviewerClaim {
    reviewer: string;
    type: "ai" | "human" | "imported";
    path: string;
    line: number | null;
    title: string;
    severity: Severity;
    body: string;
}
/** Verifies an external claim: it can be disproven by the code, corroborated by a deterministic hit, or triaged. */
export declare function verifyClaim(claim: ReviewerClaim, headText: string | null, hits: RuleHit[]): FindingVerification;
/** Verifies a finding from a Product Check results document (baseline whole-product scan). */
export declare function verifyResultsFinding(f: Finding, results: Results, repo: string | null): FindingVerification;
