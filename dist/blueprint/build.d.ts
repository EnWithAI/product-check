/**
 * Builds the engineering blueprint from validated findings: discovered (as-is) architecture with stated
 * uncertainties, target (to-be) changes with rationale, prioritized remediations with measurable acceptance
 * criteria and regression tests, vendor-neutral work packets for humans or agents, the target test architecture
 * and the finding-to-retest traceability chain. Everything is advisory: Product Check never edits code, and a
 * remediation is VERIFIED only by retest evidence, never because someone reports it done.
 */
import type { EvidenceCollector } from "../evidence/collector.js";
import type { ObservationSet } from "../inspectors/http/observe.js";
import type { RepoFacts } from "../inspectors/source/facts.js";
import type { AsBuiltSpec, Blueprint, Finding, ScanContract, Validation } from "../types.js";
/** Inputs for blueprint construction. */
export interface BlueprintInput {
    contract: ScanContract;
    repo: RepoFacts | null;
    app: ObservationSet | null;
    validations: Validation[];
    findings: Finding[];
    ev: EvidenceCollector;
    revision: string | null;
    runId: string;
    hasBaseline: boolean;
    testsImported: boolean;
    aiInScope: boolean;
    /** The as-built spec derived from the same snapshot (null when source was not inspected). */
    asBuilt: AsBuiltSpec | null;
}
/** Builds the blueprint and links findings to work packets (mutates finding.work_packet_id). */
export declare function buildBlueprint(input: BlueprintInput): Blueprint;
