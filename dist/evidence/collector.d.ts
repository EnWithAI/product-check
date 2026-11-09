/**
 * Evidence collection. Every evidence item gets a deterministic ID (so identical evidence keeps its ID across
 * runs), a timestamp, a strength, a checksum of what was observed and a short redacted excerpt. Full file or
 * response contents are never stored.
 */
import type { Evidence, EvidenceKind, EvidenceStrength } from "../types.js";
/** Input for one evidence item. */
export interface EvidenceInput {
    kind: EvidenceKind;
    pop: string;
    strength: EvidenceStrength;
    provenance: Evidence["provenance"];
    locator: string;
    line?: number | null;
    lineEnd?: number | null;
    revision?: string | null;
    summary: string;
    /** Raw excerpt; it is redacted and truncated to 160 characters before storage. */
    excerpt?: string | null;
    /** Content to checksum (for example the file bytes or response body hash input). */
    content?: string | Uint8Array | null;
    /** Precomputed SHA-256 (hex) when the content itself is not kept. */
    checksum?: string | null;
}
/** Collects evidence for one run. */
export declare class EvidenceCollector {
    private readonly runId;
    private readonly now;
    private readonly items;
    constructor(runId: string, now: string);
    /** Adds an evidence item (idempotent for identical input) and returns its ID. */
    add(input: EvidenceInput): string;
    /** Adds a preserved evidence item from a baseline run (kept verbatim, including its original run_id). */
    preserve(item: Evidence): void;
    /** Returns an item by ID. */
    get(id: string): Evidence | undefined;
    /** Links an evidence item to a validation. */
    link(id: string, validationId: string): void;
    /** All evidence, sorted by ID for deterministic output. */
    all(): Evidence[];
}
