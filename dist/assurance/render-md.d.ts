import type { Results } from "../types.js";
import type { ChangeReview, ClosureRegister, FixPacket, RegisterEntry, ReleaseGate } from "./types.js";
/** Appends the Engineering Commons footer used by every Product Check rendering (omitted with --no-branding). */
export declare const withFooter: (text: string, branding: boolean) => string;
/** PRODUCT_CHECK_REVIEW.md */
export declare function renderReviewMd(review: ChangeReview | null, reg: ClosureRegister | null, results: Results): string;
/** As-is and to-be Mermaid diagrams. */
export declare function mermaidViews(results: Results, packets: FixPacket[], reg: ClosureRegister | null): {
    asIs: string;
    toBe: string;
};
/** PRODUCT_CHECK_BLUEPRINT.md */
export declare function renderBlueprintMd(results: Results, packets: FixPacket[], reg: ClosureRegister | null, gate: ReleaseGate | null): string;
/** PRODUCT_CHECK_RELEASE_GATE.md */
export declare function renderGateMd(gate: ReleaseGate): string;
/** Human review packet for an escalated finding (cycle limit reached). */
export declare function renderHumanPacket(e: RegisterEntry, reg: ClosureRegister): string;
