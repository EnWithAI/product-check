// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Library entry point: the assessment pipeline, contract helpers, renderers, integrity checks and the catalog.
 */
export { runAssessment, type RunOptions, type RunOutput } from "./run.js";
export { applyFlags, defaultContract, loadContract, ALWAYS_PROHIBITED } from "./contract/contract.js";
export { decidePermissions, type RunPermissions } from "./contract/safety.js";
export { checkResults, type IntegrityReport } from "./validation/integrity.js";
export { computeScorecard } from "./scoring/score.js";
export { computeVerdict } from "./scoring/verdict.js";
export { CONTROLS, GATES } from "./validation/catalog.js";
export { TIER_INFO, STAGE_TIER } from "./validation/tiers.js";
export { renderReport, renderBlueprint, renderPacket } from "./reporting/markdown.js";
export { renderDashboard } from "./dashboard/render.js";
export { validateAgainst, schemaFiles } from "./schema/registry.js";
export { SchemaRegistry } from "./schema/validator.js";
export { ExitCode, ProductCheckError } from "./errors.js";
export type * from "./types.js";
export { TOOL_VERSION } from "./version.js";
