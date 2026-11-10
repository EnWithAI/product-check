// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Error types and documented process exit codes. Every expected failure is a ProductCheckError carrying an exit
 * code and an optional remediation hint; anything else is treated as an internal bug (exit 1).
 */
export const ExitCode = {
    Ok: 0,
    Internal: 1,
    Usage: 2,
    Input: 3,
    Safety: 4,
    Invalid: 5,
    Gate: 6,
};
/** An expected, user-facing error with a defined exit code and optional remediation hint. */
export class ProductCheckError extends Error {
    exitCode;
    hint;
    constructor(message, exitCode, hint) {
        super(message);
        this.name = "ProductCheckError";
        this.exitCode = exitCode;
        this.hint = hint;
    }
}
/** Creates a usage/configuration error (exit 2). */
export const usageError = (message, hint) => new ProductCheckError(message, ExitCode.Usage, hint);
/** Creates an input error: an input file is missing, unreadable or malformed (exit 3). */
export const inputError = (message, hint) => new ProductCheckError(message, ExitCode.Input, hint);
/** Creates a safety refusal: the request needs an authorization it does not have, or is never allowed (exit 4). */
export const safetyError = (message, hint) => new ProductCheckError(message, ExitCode.Safety, hint);
