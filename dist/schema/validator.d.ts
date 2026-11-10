/** One validation error with a JSON-pointer-like instance path. */
export interface SchemaError {
    path: string;
    message: string;
}
/** A set of schemas addressable by $id (and by file name relative to a shared base). */
export declare class SchemaRegistry {
    private readonly byId;
    private readonly patterns;
    /** Adds a schema document; it must declare an absolute $id. */
    add(schema: Record<string, unknown>): void;
    /** Loads every *.schema.json in a directory. */
    static fromDirectory(dir: URL): SchemaRegistry;
    /** All registered $ids. */
    ids(): string[];
    /** Rejects unsupported keywords so nothing is silently ignored. */
    private check;
    /** Resolves a $ref relative to the base $id of the document it appears in. */
    private resolve;
    /** Validates an instance against the schema with the given $id. */
    validate(id: string, instance: unknown, maxErrors?: number): SchemaError[];
    /** Returns true when the instance matches (without collecting errors beyond the first). */
    private matches;
    private regex;
    private walk;
}
