/** Builds a checked outcome (PASS/PARTIAL/FAIL), which must carry evidence. */
export function checked(status, actual, method, strength, evidence, findings = [], reproduction = []) {
    if (evidence.length === 0)
        throw new Error(`checked outcome without evidence: ${actual}`);
    return {
        status,
        actual,
        method,
        strength,
        reason: null,
        evidence: [...new Set(evidence)],
        findings,
        reproduction,
    };
}
/** Builds an unchecked outcome (BLOCKED/NOT_TESTED/NOT_APPLICABLE), which must carry a reason. */
export function unchecked(status, reason, evidence = []) {
    return {
        status,
        actual: "Not evaluated.",
        method: "none",
        strength: null,
        reason,
        evidence,
        findings: [],
        reproduction: [],
    };
}
