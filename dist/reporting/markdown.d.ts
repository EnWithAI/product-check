/**
 * Markdown renderings of a results document: the assessment report, the blueprint, and one file per work packet
 * (written for a human or any coding agent). Every untrusted string is escaped; everything shown is read from the
 * results JSON, which stays the source of truth.
 */
import type { Results, WorkPacket } from "../types.js";
import { PILLARS } from "../types.js";
/** Rendering options. */
export interface RenderOptions {
    branding: boolean;
}
/** One-line score text for a pillar. */
export declare function scoreText(r: Results, p: (typeof PILLARS)[number]): string;
/** The assessment report. */
export declare function renderReport(r: Results, options: RenderOptions): string;
/** The blueprint document. */
export declare function renderBlueprint(r: Results, options: RenderOptions): string;
/** One work packet, written so a human or any coding agent can act on it. */
export declare function renderPacket(r: Results, p: WorkPacket): string;
