/** Vulnerability counts from npm audit. */
export interface AuditSummary {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    packages: {
        name: string;
        severity: string;
    }[];
}
/** Parses `npm audit --json` (npm 7+ format, auditReportVersion 2). */
export declare function parseNpmAudit(data: unknown, source: string): AuditSummary;
/** Summary of a Spec Check report. */
export interface SpecCheckSummary {
    high: number;
    medium: number;
    requirements: number;
}
/** Parses a Spec Check report (schema 1.0). */
export declare function parseSpecCheck(data: unknown, source: string): SpecCheckSummary;
/** Summary of an Impact Check report. */
export interface ImpactCheckSummary {
    high: number;
    findings: number;
    affected_modules: number;
    test_candidates: number;
    commit: string | null;
}
/** Parses an Impact Check report (schema 2.0). */
export declare function parseImpactCheck(data: unknown, source: string): ImpactCheckSummary;
/** Summary of an Outcome Check report. */
export interface OutcomeCheckSummary {
    ci_first_pass_rate: number | null;
    reverted_prs: number | null;
}
/** Parses an Outcome Check report (schema 1.0); reads the all-PR segment of two metrics. */
export declare function parseOutcomeCheck(data: unknown, source: string): OutcomeCheckSummary;
