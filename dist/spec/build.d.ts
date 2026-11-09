/**
 * Builds an as-built specification from the discovered product surface. The spec states what the repository
 * structurally provides (pages, endpoints, entities, integrations, configuration) with evidence for each statement,
 * marks interpretations as inferred, and leaves everything the code cannot tell us (purpose, users, priorities,
 * measurable targets) as explicit `[NEEDS CLARIFICATION: …]` markers for a person to resolve. No intent is invented.
 *
 * Statements are Markdown: every repository-derived string inside them is escaped here (`code` or `md`), so the
 * renderer can print them as they are.
 */
import type { EvidenceCollector } from "../evidence/collector.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type { ProductSurface } from "../inspectors/source/surface.js";
import type { AsBuiltBody, AsBuiltSpec, Results, ScanContract } from "../types.js";
/** Inputs for the as-built spec. */
export interface SpecInput {
    contract: ScanContract;
    facts: RepoFacts;
    surface: ProductSurface;
    ev: EvidenceCollector;
    repository: string;
    generatedAt: string;
}
/** Builds the as-built specification. */
export declare function buildAsBuiltSpec(input: SpecInput): AsBuiltSpec;
/** The part of a spec that is embedded in the blueprint. */
export declare function asBuiltBody(spec: AsBuiltSpec): AsBuiltBody;
/** Rebuilds the standalone as-built spec from a results document (null when source was not inspected). */
export declare function specFromResults(r: Results): AsBuiltSpec | null;
