import type { Results } from "../types.js";
import type { DiffFile } from "./diff.js";
import type { EvidenceLog } from "./evidence-log.js";
import type { OutcomeInput, SpecInput } from "./adapters.js";
import { type Approval, type AssurancePolicy, type ChangeReview, type Lane, type VerificationRun } from "./types.js";
import { type ReviewerClaim } from "./verification.js";
export interface ReviewInput {
    repo: string;
    targetName: string;
    repositoryLabel: string;
    mode: "PR_DIFF" | "PRE_PR_LOCAL";
    baseSha: string | null;
    headSha: string | null;
    changeRef: string;
    diffText: string;
    diffSource: "git" | "file";
    /** Reads a file as it is at head (commit or worktree); null when absent or unknown. */
    headText: (path: string) => string | null;
    policy: AssurancePolicy;
    policyDigest: string | null;
    author: {
        id: string | null;
        source: "flag" | "git" | "unknown";
    };
    impact: (NonNullable<ChangeReview["risk"]["impact_check"]> & {
        modules: string[];
    }) | null;
    spec: SpecInput | null;
    outcome: OutcomeInput | null;
    claims: ReviewerClaim[];
    previous: ChangeReview | null;
    baseline: {
        results: Results;
        sha256: string;
    } | null;
    proofRun: VerificationRun | null;
    approvals: Approval[];
    log: EvidenceLog;
    now: Date;
    files: DiffFile[];
}
/** Dedupe key from rule, component, root-cause signature and impact scope (the signature itself is not stored). */
export declare const dedupeKey: (h: {
    rule_id: string;
    path: string;
    signature: string;
    lane: Lane;
}) => string;
/** Runs a change review. */
export declare function reviewChange(input: ReviewInput): ChangeReview;
/** Reads a file from the working tree (PRE_PR_LOCAL); null when missing. */
export declare function worktreeText(repo: string): (path: string) => string | null;
