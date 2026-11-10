export type CaseStatus = "passed" | "failed" | "skipped";
/** One executed test case. */
export interface TestCase {
    name: string;
    file: string | null;
    status: CaseStatus;
}
/** A parsed results file. */
export interface TestRun {
    source: string;
    format: "junit" | "jest-json";
    cases: TestCase[];
    sha256: string;
}
/** Parses JUnit XML: <testcase> elements anywhere (inside <testsuite> or directly under <testsuites>). */
export declare function parseJUnit(xml: string, source: string, sha: string): TestRun;
/** Parses Jest/Vitest JSON reporter output. */
export declare function parseJestJson(data: unknown, source: string, sha: string): TestRun;
/** Detects the format and parses a results file. */
export declare function parseTestResults(text: string, source: string, sha: string): TestRun;
/** True for cases that look like end-to-end tests (by file path or name). */
export declare function isEndToEnd(c: TestCase): boolean;
/** Counts by status. */
export declare function tally(cases: TestCase[]): Record<CaseStatus, number>;
