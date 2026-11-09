/** Hex SHA-256 of a string or buffer. */
export declare function sha256(data: string | Uint8Array): string;
/** A short deterministic ID: prefix + first `length` hex chars of SHA-256 over the joined parts. */
export declare function stableId(prefix: string, parts: readonly (string | number | null)[], length?: number): string;
