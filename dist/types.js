// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Result contract types (schema 0.1.0). Mirrors schemas/*.schema.json; tests validate real results against the
 * schemas with both the built-in validator and Ajv.
 */
export const SCHEMA_VERSION = "0.1.0";
export const RUBRIC_VERSION = "pc-rubric-0.2";
/**
 * Rubric versions a stored scorecard may carry. pc-rubric-0.2 only adds control PC-T-17; the scoring rules are those
 * of pc-rubric-0.1, so earlier results still recompute and load as baselines.
 */
export const RUBRIC_VERSIONS = ["pc-rubric-0.1", RUBRIC_VERSION];
export const PILLARS = ["customer", "technology", "trust"];
export const TIERS = ["CT-T0", "CT-T1", "CT-T2", "CT-T3", "CT-T4", "CT-T5", "CT-T6"];
