/**
 * Executable regression-test candidates for controls where a small, safe, framework-neutral test can be written:
 * header and status assertions against the user's own deployment (Node's built-in test runner and fetch) and a
 * secret-pattern guard for CI. Candidates are text in the blueprint; Product Check never runs them.
 */
/** A runnable test candidate, or null when none is defensible for the control. */
export declare function regressionCandidate(controlId: string, origin: string | null): {
    language: string;
    code: string;
} | null;
