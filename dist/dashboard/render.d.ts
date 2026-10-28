import type { Results } from "../types.js";
/**
 * Converts an as-built statement (Markdown built in src/spec/build.ts: code spans for repository-derived names,
 * backslash escapes elsewhere) to HTML. Every segment is HTML-escaped; only `<code>` is produced.
 */
export declare function statementHtml(statement: string): string;
/** Renders the dashboard HTML. */
export declare function renderDashboard(r: Results, options: {
    branding: boolean;
}): string;
