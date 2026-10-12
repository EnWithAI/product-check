/** Revision information for the scanned repository. */
export interface GitInfo {
    present: boolean;
    commit: string | null;
    ref: string | null;
    /** Paths tracked in the index (forward slashes), or null when the index could not be read. */
    tracked: Set<string> | null;
    notes: string[];
}
/** Parses the paths from a git index file (versions 2, 3 and 4). */
export declare function parseIndex(buf: Buffer): Set<string> | null;
/** Reads revision and index information for a repository root. */
export declare function readGit(root: string): GitInfo;
