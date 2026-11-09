/**
 * Masks secret-like strings in any text before it is stored as evidence or rendered. Product Check stores short
 * excerpts only, and every excerpt passes through redact(). The rule names are recorded in evidence.redaction.
 */
/** Replacement text for masked secrets. */
export declare const REDACTED = "[REDACTED]";
/** Result of redacting a string. */
export interface Redacted {
    text: string;
    rules: string[];
}
/** Masks token-like substrings and secret assignments; returns the text and the names of rules that fired. */
export declare function redactWithRules(text: string): Redacted;
/** Masks token-like substrings. */
export declare function redact(text: string): string;
