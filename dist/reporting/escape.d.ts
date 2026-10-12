/**
 * Escaping for untrusted strings (paths, page titles, header values, test names) in Markdown and HTML output.
 */
/** Make control characters (incl. newlines, tabs, bidi overrides) visible and inert. */
export declare function visible(text: string): string;
/**
 * Render a string as an inline code span. Inside code spans GitHub does not interpret Markdown, HTML, links or
 * @mentions. A fence longer than any backtick run in the content is used, and pipes are escaped for tables.
 */
export declare function code(text: string, maxLength?: number): string;
/** Escape free text for Markdown paragraphs and tables (single line). */
export declare function md(value: string, maxLength?: number): string;
/** Escape text for HTML element content and attribute values. */
export declare function html(value: string): string;
