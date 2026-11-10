/**
 * Retest: compares this run with a baseline results file.
 * - Findings keep their stable IDs; each carries its history and the baseline evidence is preserved verbatim.
 * - A baseline finding absent now is RESOLVED only if its control was checked again with new evidence; if the
 *   control could not be checked this time it stays open as UNVERIFIED (absence of evidence is not a fix).
 * - PC-T-16 (no regressions) is evaluated from controls that went from PASS to PARTIAL/FAIL.
 */
import type { EvidenceCollector } from "../evidence/collector.js";
import type { Comparison, Finding, Results, Validation } from "../types.js";
/** Applies the baseline to this run's findings and validations (mutates them) and returns the comparison skeleton. */
export declare function applyBaseline(validations: Validation[], findings: Finding[], baseline: Results, baselineSha: string, ev: EvidenceCollector, runId: string): {
    findings: Finding[];
    comparison: Comparison;
};
