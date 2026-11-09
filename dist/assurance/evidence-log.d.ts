import { type EvidenceRecord } from "./types.js";
/** Fields the caller provides for a new record. */
export type EvidenceInput = Pick<EvidenceRecord, "type" | "subject" | "commit_sha" | "environment_id" | "summary" | "locator" | "line" | "payload">;
/** Parses a log; malformed lines are input errors. */
export declare function readLog(path: string): EvidenceRecord[];
/** Checks the chain: sequence numbers, payload digests, record digests and links. Returns the problems found. */
export declare function verifyLog(records: EvidenceRecord[]): string[];
/** Append-only writer over one log file. */
export declare class EvidenceLog {
    private readonly path;
    private readonly now;
    private readonly records;
    constructor(path: string, now: () => Date);
    /** Appends a record and returns its evidence ID. */
    append(input: EvidenceInput): string;
    /** All records (read-only copy). */
    all(): EvidenceRecord[];
    /** IDs known to the log. */
    has(id: string): boolean;
}
