// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The bundled schema registry (schemas/ ships with the package) and helpers to validate artifacts by kind.
 */
import { readFileSync } from "node:fs";
import { SchemaRegistry, type SchemaError } from "./validator.js";

export const SCHEMA_BASE = "https://github.com/enwithai/product-check/schemas/";
const DIR = new URL("../../schemas/", import.meta.url);

/** Artifact kind → schema file name. */
export const KIND_SCHEMA: Record<string, string> = {
  "product-check-results": "product-check-results.schema.json",
  "scan-contract": "scan-contract.schema.json",
  "pop-coverage": "pop-coverage.schema.json",
  scorecard: "scorecard.schema.json",
  blueprint: "blueprint.schema.json",
  "release-verdict": "release-verdict.schema.json",
  observations: "observations.schema.json",
};

let cached: SchemaRegistry | null = null;

/** Lazily loads the bundled schemas. */
export function registry(): SchemaRegistry {
  cached ??= SchemaRegistry.fromDirectory(DIR);
  return cached;
}

/** Validates an instance against a bundled schema file name. */
export function validateAgainst(file: string, instance: unknown): SchemaError[] {
  return registry().validate(`${SCHEMA_BASE}${file}`, instance);
}

/** Reads the text of a bundled schema. */
export function schemaText(file: string): string {
  return readFileSync(new URL(file, DIR), "utf8");
}

/** Lists bundled schema files. */
export function schemaFiles(): string[] {
  return registry()
    .ids()
    .map((id) => id.slice(SCHEMA_BASE.length));
}

/** Formats schema errors for humans. */
export function formatErrors(errors: SchemaError[]): string {
  return errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
}
