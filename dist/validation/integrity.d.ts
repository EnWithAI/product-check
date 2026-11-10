/** Outcome of an integrity check. */
export interface IntegrityReport {
    errors: string[];
    warnings: string[];
}
/** Checks a parsed results document. */
export declare function checkResults(doc: unknown): IntegrityReport;
