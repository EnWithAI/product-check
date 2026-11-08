// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * review-evidence.jsonl: an append-only, hash-chained log of every piece of executed or observed evidence the
 * assurance layer produces (command executions, diff hunks, re-reads, approvals, verifications, transitions).
 * Each record carries the digest of its payload and of the previous record, so editing, removing or reordering a
 * line is detected by `verifyLog`. Payloads are small and redacted; full command output is never stored.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { inputError } from "../errors.js";
import { stableId } from "../util/hash.js";
import { redact } from "../util/redact.js";
import { ASSURANCE_SCHEMA_VERSION, type EvidenceRecord } from "./types.js";
import { digestOf } from "./util.js";

/** Fields the caller provides for a new record. */
export type EvidenceInput = Pick<
  EvidenceRecord,
  "type" | "subject" | "commit_sha" | "environment_id" | "summary" | "locator" | "line" | "payload"
>;

/** Parses a log; malformed lines are input errors. */
export function readLog(path: string): EvidenceRecord[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "");
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as EvidenceRecord;
    } catch {
      throw inputError(`${path}: line ${i + 1} is not JSON.`);
    }
  });
}

/** Checks the chain: sequence numbers, payload digests, record digests and links. Returns the problems found. */
export function verifyLog(records: EvidenceRecord[]): string[] {
  const errors: string[] = [];
  let prev: string | null = null;
  records.forEach((r, i) => {
    if (r.seq !== i + 1) errors.push(`record ${i + 1}: seq is ${r.seq}`);
    if (digestOf(r.payload) !== r.payload_digest) errors.push(`record ${r.seq}: payload digest mismatch`);
    if (r.prev_digest !== prev) errors.push(`record ${r.seq}: broken link to the previous record`);
    const { digest, ...rest } = r;
    if (digestOf(rest) !== digest) errors.push(`record ${r.seq}: record digest mismatch (edited)`);
    prev = r.digest;
  });
  return errors;
}

/** Append-only writer over one log file. */
export class EvidenceLog {
  private readonly records: EvidenceRecord[];

  constructor(
    private readonly path: string,
    private readonly now: () => Date
  ) {
    this.records = readLog(path);
    const problems = verifyLog(this.records);
    if (problems.length > 0)
      throw inputError(`${path} failed its integrity check; refusing to append:\n  ${problems.join("\n  ")}`);
  }

  /** Appends a record and returns its evidence ID. */
  append(input: EvidenceInput): string {
    const seq = this.records.length + 1;
    const prev = this.records.at(-1)?.digest ?? null;
    const payload = JSON.parse(redact(JSON.stringify(input.payload))) as Record<string, unknown>;
    const payloadDigest = digestOf(payload);
    const base: Omit<EvidenceRecord, "digest"> = {
      schema_version: ASSURANCE_SCHEMA_VERSION,
      kind: "evidence-record",
      seq,
      evidence_id: stableId("EVR", [input.type, input.subject, payloadDigest, prev], 12),
      recorded_at: this.now().toISOString(),
      type: input.type,
      subject: input.subject,
      commit_sha: input.commit_sha,
      environment_id: input.environment_id,
      summary: redact(input.summary).slice(0, 500),
      locator: input.locator,
      line: input.line,
      payload_digest: payloadDigest,
      payload,
      prev_digest: prev,
    };
    const record: EvidenceRecord = { ...base, digest: digestOf(base) };
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(record)}\n`);
    this.records.push(record);
    return record.evidence_id;
  }

  /** All records (read-only copy). */
  all(): EvidenceRecord[] {
    return [...this.records];
  }

  /** IDs known to the log. */
  has(id: string): boolean {
    return this.records.some((r) => r.evidence_id === id);
  }
}
