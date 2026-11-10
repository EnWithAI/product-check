/**
 * Deterministic review lanes over a change. Each lane is an independent reviewer with its own rules; none needs
 * credentials or network access. Rules look at what the change adds or removes, so a review of a diff does not
 * re-report the whole product (the baseline scan does that). Rules that only match a pattern are hypotheses and
 * go to human triage unless a second, independent signal corroborates them.
 *
 * Covered vibe-coding failure modes: client-side secrets, removed authorization, object access without an
 * ownership filter, stubbed APIs and silent fallbacks, mock data in production code, tests that only assert mocks,
 * focused/skipped tests, TLS verification disabled, wildcard CORS, string-built SQL, eval of dynamic input, model
 * output reaching a shell or eval, non-idempotent payments, irreversible migrations, images without alt text.
 */
import type { Confidence, Epistemic, Pillar, Severity } from "../types.js";
import type { DiffFile } from "./diff.js";
import type { Lane } from "./types.js";
/** One rule hit before verification. */
export interface RuleHit {
    rule_id: string;
    lane: Lane;
    title: string;
    severity: Severity;
    pillars: Pillar[];
    epistemic: Epistemic;
    confidence: Confidence;
    path: string;
    line: number | null;
    /** Normalized text of what matched (redacted later), used for the root-cause signature. */
    signature: string;
    expected: string;
    actual: string;
    impact: string;
    excerpt: string;
}
interface LineRule {
    id: string;
    lane: Lane;
    title: string;
    severity: Severity;
    pillars: Pillar[];
    epistemic: Epistemic;
    confidence: Confidence;
    expected: string;
    impact: string;
    /** Which files the rule applies to. */
    files: (path: string) => boolean;
    /** Returns the matched text, or null. */
    match: (text: string, path: string) => string | null;
}
/** Line rules: evaluated on each added line (and on whole files when re-checking a fix). */
export declare const LINE_RULES: LineRule[];
/** Runs the line rules over a set of lines of one file. */
export declare function lineHits(path: string, lines: {
    line: number | null;
    text: string;
}[]): RuleHit[];
/** File-level rules that need the whole change of a file (removed auth, ownership filters, migrations, tests). */
export declare function fileHits(file: DiffFile, headText: string | null): RuleHit[];
/** Change-level rule: production code changed but no test changed. */
export declare function changeHits(files: DiffFile[]): RuleHit[];
/** True when a path is client-reachable code (used to raise secret findings' certainty). */
export declare const isClientPath: (p: string) => boolean;
export {};
