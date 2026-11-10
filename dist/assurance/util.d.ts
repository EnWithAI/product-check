/** JSON with object keys sorted recursively, so equal content always has the same digest. */
export declare function canonicalJson(value: unknown): string;
/** SHA-256 of the canonical JSON of a value. */
export declare const digestOf: (value: unknown) => string;
/** Converts a glob (`**`, `*`, `?`) to an anchored regular expression over forward-slash paths. */
export declare function globToRegExp(glob: string): RegExp;
/** True when the path matches any of the globs. */
export declare const matchesAny: (path: string, globs: readonly string[]) => boolean;
/** Reads and parses a JSON file; failures are input errors (exit 3). */
export declare function readJson<T = unknown>(path: string, label?: string): T;
/** Writes text atomically (temp file + rename), creating parent directories. */
export declare function writeText(path: string, content: string): void;
/** Writes pretty JSON atomically. */
export declare const writeJson: (path: string, value: unknown) => void;
/** Reads a JSON file when it exists. */
export declare const readJsonIfExists: <T>(path: string) => T | null;
/** YYYY-MM-DD validation. */
export declare const isIsoDate: (s: string) => boolean;
/** Days from `now` until the end of a YYYY-MM-DD date (negative when past). */
export declare function daysUntil(date: string, now: Date): number;
/** Zero-padded sequential identifier: F-001, FX-002, VR-010. */
export declare const seqId: (prefix: string, n: number) => string;
/** A git object name or ref that is safe to pass as an argument (never an option). */
export declare function assertRef(ref: string, label: string): string;
