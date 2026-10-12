// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Escaping for untrusted strings (paths, page titles, header values, test names) in Markdown and HTML output.
 */

/** Make control characters (incl. newlines, tabs, bidi overrides) visible and inert. */
export function visible(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code === 0x0a) return "\\n";
    if (code === 0x09) return "\\t";
    if (code === 0x0d) return "\\r";
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });
}

/**
 * Render a string as an inline code span. Inside code spans GitHub does not interpret Markdown, HTML, links or
 * @mentions. A fence longer than any backtick run in the content is used, and pipes are escaped for tables.
 */
export function code(text: string, maxLength = 300): string {
  let value = visible(text);
  if (value.length > maxLength) value = `${value.slice(0, maxLength)}…`;
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = value.startsWith("`") || value.endsWith("`") || value.startsWith(" ") ? " " : "";
  return `${fence}${pad}${value.replace(/\|/g, "\\|")}${pad}${fence}`;
}

/** Escape free text for Markdown paragraphs and tables (single line). */
export function md(value: string, maxLength = 2000): string {
  let out = visible(value);
  if (out.length > maxLength) out = `${out.slice(0, maxLength)}…`;
  return out
    .replace(/[\\`*_[\]<>|~#]/g, "\\$&")
    .replace(/&/g, "&amp;")
    .replace(/@/g, "@\u200b")
    .replace(/^([+=-])/, "\\$1")
    .replace(/^(\d+)([.)])/, "$1\\$2");
}

/** Escape text for HTML element content and attribute values. */
export function html(value: string): string {
  return visible(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
