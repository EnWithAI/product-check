/**
 * Unified diff parsing (output of `git diff`): files, statuses, renames, binary markers and every added/removed
 * line with its new/old line number. Pure; no git process.
 */
export interface DiffLine {
    kind: "add" | "del";
    /** Line number in the new file (add) or old file (del). */
    line: number;
    text: string;
}
export interface DiffFile {
    path: string;
    previous_path: string | null;
    status: "added" | "modified" | "deleted" | "renamed" | "binary";
    lines: DiffLine[];
    additions: number;
    deletions: number;
}
/** Parses a unified diff. */
export declare function parseUnifiedDiff(text: string): DiffFile[];
