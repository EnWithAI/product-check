/**
 * Renders an as-built specification as a GitHub Spec Kit style `spec.md`, so Spec Check can lint it like any other
 * specification. Statements carry their certainty and source location; open questions are left as
 * `[NEEDS CLARIFICATION: …]` markers. Untrusted strings (paths, route names, test titles) go through the escaping
 * helpers.
 */
import type { AsBuiltSpec } from "../types.js";
/** Renders the as-built spec. */
export declare function renderAsBuiltSpec(spec: AsBuiltSpec): string;
