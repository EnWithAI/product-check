import type { Results } from "../types.js";
import type { ChangeReview, ClosureRegister, EvidenceRecord, FixPacket, ReleaseGate, VerificationRun } from "./types.js";
export interface DashboardBundle {
    results: Results;
    register: ClosureRegister | null;
    review: ChangeReview | null;
    proof: VerificationRun | null;
    packets: FixPacket[];
    gate: ReleaseGate;
    log: EvidenceRecord[];
    now: Date;
}
/** Agent export: fix packets with references, never evidence excerpts. */
export declare function agentExport(b: DashboardBundle): unknown;
/** Renders the dashboard. */
export declare function renderAssuranceDashboard(b: DashboardBundle, options: {
    branding: boolean;
}): string;
