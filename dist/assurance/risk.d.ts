/**
 * Change-risk classification and human-approval routing. Risk follows the impacted surface (paths and changed
 * content), never who or what wrote the change. UNDETERMINED is treated as HIGH. A trusted author can only waive
 * the human approval of an eligible LOW change when the policy allows it and no protected path is touched; that
 * never bypasses a security block.
 */
import type { AssurancePolicy, ChangedFile, ChangeReview } from "./types.js";
import type { DiffFile } from "./diff.js";
/** Surfaces a changed file touches. */
export declare function surfacesOf(file: DiffFile): string[];
/** Classifies a change. */
export declare function classifyRisk(files: DiffFile[], policy: AssurancePolicy, impact: ChangeReview["risk"]["impact_check"]): {
    changed: ChangedFile[];
    risk: ChangeReview["risk"];
    owners: string[];
};
/** Human approvals a change needs, including the LOW-risk waiver decision. */
export declare function approvalsRequired(risk: ChangeReview["risk"], owners: string[], policy: AssurancePolicy, author: {
    id: string | null;
    trusted: boolean;
}): ChangeReview["approvals_required"];
