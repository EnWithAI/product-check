import type { EnvironmentRecord } from "./types.js";
/** Environment fingerprint for executed evidence. */
export declare function environmentRecord(repo: string): EnvironmentRecord;
/** Resolves a revision to a full commit SHA, or null. */
export declare function resolveSha(repo: string, rev: string): string | null;
/** Commit, cleanliness and changed paths of the working tree. `ignore` is a directory excluded from the check. */
export declare function worktreeState(repo: string, ignore: string | null): {
    head: string | null;
    clean: boolean | null;
    dirty: string[];
};
/** Commit author email (or name) of a revision. */
export declare function commitAuthor(repo: string, rev: string): string | null;
/** File content at a revision, or null when it does not exist there. */
export declare function fileAt(repo: string, rev: string, path: string): string | null;
