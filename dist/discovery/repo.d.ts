import type { Limitation } from "../types.js";
import { type GitInfo } from "./git.js";
/** One file in the snapshot. */
export interface RepoFile {
    path: string;
    size: number;
    /** true/false from the git index; null when unknown (no git or unreadable index). */
    tracked: boolean | null;
    ignored: boolean;
    /** UTF-8 text for scannable, non-ignored files within limits; otherwise null. */
    text: string | null;
    sha256: string | null;
}
/** A read-only view of a repository at scan time. */
export interface RepoSnapshot {
    root: string;
    label: string;
    git: GitInfo;
    files: RepoFile[];
    byPath: Map<string, RepoFile>;
    limitations: Limitation[];
    /** True when .gitignore rules ignore the path (inference; nested rules included). */
    ignores: (path: string) => boolean;
}
export declare const REPO_LIMITS: {
    readonly maxFileBytes: number;
    readonly maxDepth: 25;
    readonly maxLine: 10000;
};
/** True when a file's content is worth reading for analysis. */
export declare function isScannable(path: string): boolean;
/** Builds a snapshot of a local repository directory. */
export declare function snapshotRepo(root: string, maxFiles: number, label?: string): RepoSnapshot;
/** True when a line looks minified/generated (skip pattern scanning). */
export declare function isMinified(file: RepoFile): boolean;
