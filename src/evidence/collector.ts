// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Evidence collection. Every evidence item gets a deterministic ID (so identical evidence keeps its ID across
 * runs), a timestamp, a strength, a checksum of what was observed and a short redacted excerpt. Full file or
 * response contents are never stored.
 */
import type { Evidence, EvidenceKind, EvidenceStrength } from "../types.js";
import { sha256, stableId } from "../util/hash.js";
import { redactWithRules } from "../util/redact.js";

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

const MAX_EXCERPT = 160;

/** Collects evidence for one run. */
export class EvidenceCollector {
  private readonly items = new Map<string, Evidence>();

  constructor(
    private readonly runId: string,
    private readonly now: string
  ) {}

  /** Adds an evidence item (idempotent for identical input) and returns its ID. */
  add(input: EvidenceInput): string {
    const checksum = input.checksum ?? (input.content != null ? sha256(input.content) : null);
    let excerpt: string | null = null;
    let rules: string[] = [];
    if (input.excerpt != null) {
      const red = redactWithRules(input.excerpt.trim());
      rules = red.rules;
      excerpt = red.text.length > MAX_EXCERPT ? `${red.text.slice(0, MAX_EXCERPT)}…` : red.text;
    }
    const summaryRed = redactWithRules(input.summary);
    rules = [...new Set([...rules, ...summaryRed.rules])];
    const id = stableId(
      "EV",
      [input.kind, input.pop, input.locator, input.line ?? null, input.summary, checksum, excerpt],
      12
    );
    if (!this.items.has(id)) {
      this.items.set(id, {
        id,
        run_id: this.runId,
        kind: input.kind,
        pop: input.pop,
        collected_at: this.now,
        strength: input.strength,
        provenance: input.provenance,
        source: {
          locator: redactWithRules(input.locator).text,
          line_start: input.line ?? null,
          line_end: input.lineEnd ?? input.line ?? null,
          revision: input.revision ?? null,
        },
        summary: summaryRed.text.slice(0, 1000),
        excerpt,
        checksum: checksum === null ? null : { algorithm: "sha256", value: checksum },
        redaction: { applied: rules.length > 0, rules },
        validation_ids: [],
      });
    }
    return id;
  }

  /** Adds a preserved evidence item from a baseline run (kept verbatim, including its original run_id). */
  preserve(item: Evidence): void {
    if (!this.items.has(item.id)) this.items.set(item.id, { ...item, validation_ids: [] });
  }

  /** Returns an item by ID. */
  get(id: string): Evidence | undefined {
    return this.items.get(id);
  }

  /** Links an evidence item to a validation. */
  link(id: string, validationId: string): void {
    const item = this.items.get(id);
    if (item && !item.validation_ids.includes(validationId)) item.validation_ids.push(validationId);
  }

  /** All evidence, sorted by ID for deterministic output. */
  all(): Evidence[] {
    return [...this.items.values()]
      .map((e) => ({ ...e, validation_ids: [...e.validation_ids].sort() }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
