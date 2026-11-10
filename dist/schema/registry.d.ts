import { SchemaRegistry, type SchemaError } from "./validator.js";
export declare const SCHEMA_BASE = "https://github.com/enwithai/product-check/schemas/";
/** Artifact kind → schema file name. */
export declare const KIND_SCHEMA: Record<string, string>;
/** Lazily loads the bundled schemas. */
export declare function registry(): SchemaRegistry;
/** Validates an instance against a bundled schema file name. */
export declare function validateAgainst(file: string, instance: unknown): SchemaError[];
/** Reads the text of a bundled schema. */
export declare function schemaText(file: string): string;
/** Lists bundled schema files. */
export declare function schemaFiles(): string[];
/** Formats schema errors for humans. */
export declare function formatErrors(errors: SchemaError[]): string;
