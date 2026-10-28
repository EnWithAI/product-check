/**
 * A pragmatic .gitignore matcher (root .gitignore plus nested .gitignore files) covering the common syntax:
 * comments, negation, directory-only patterns, anchoring, `*`, `?`, `**` and character classes. Used only to
 * decide whether a local file would be committed; results are labelled as inference, not fact.
 */
/** Matcher built from .gitignore files. */
export declare class GitIgnore {
    private readonly rules;
    /** Adds the patterns of a .gitignore located in directory `base` ("" for the root). */
    add(base: string, text: string): void;
    /** True when the path (relative to the repo root, forward slashes) is ignored. */
    ignores(path: string, isDir?: boolean): boolean;
    /** Number of rules loaded. */
    get size(): number;
}
