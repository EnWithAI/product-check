// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Pure helpers that turn an HTTP response (live, recorded or from a HAR file) into an observation: an allowlist
 * of security-relevant headers (cookie values redacted), a body checksum and a few derived page facts. Bodies and
 * request headers are never kept.
 */
import { SCHEMA_VERSION } from "../../types.js";

/** One passive HTTP observation (schemas/observations.schema.json). */
export interface Observation {
  url: string;
  method: "GET" | "HEAD";
  purpose: string;
  requested_at: string;
  status: number | null;
  redirect_location: string | null;
  final_url: string | null;
  headers: Record<string, string>;
  timing_ms: number | null;
  body_sha256: string | null;
  body_bytes: number | null;
  truncated: boolean;
  html: HtmlFacts | null;
  exposure: { looks_sensitive: boolean; signature: string | null } | null;
  error: string | null;
}

/** Page facts derived from an HTML body. */
export interface HtmlFacts {
  title: string | null;
  lang: string | null;
  has_viewport: boolean;
  meta_csp: string | null;
  img_total: number;
  img_missing_alt: number;
  privacy_link: string | null;
}

/** An observations document. */
export interface ObservationSet {
  schema_version: typeof SCHEMA_VERSION;
  kind: "observations";
  origin: string;
  source: "live" | "har" | "recorded";
  observations: Observation[];
}

/** Response headers kept in observations. Everything else is dropped. */
export const KEPT_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "server",
  "x-powered-by",
  "set-cookie",
  "location",
  "content-type",
] as const;

/** Redacts cookie values, keeping names and attributes. */
export function redactSetCookie(value: string): string {
  return value
    .split("\n")
    .map((cookie) => {
      const [pair = "", ...attrs] = cookie.split(";");
      const name = pair.split("=")[0]?.trim() ?? "";
      return [`${name}=[REDACTED]`, ...attrs.map((a) => a.trim()).filter(Boolean)].join("; ");
    })
    .join("\n");
}

/** Normalizes headers to lowercase names, keeps the allowlist and redacts cookie values. */
export function keepHeaders(entries: Iterable<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawName, value] of entries) {
    const name = rawName.toLowerCase();
    if (!(KEPT_HEADERS as readonly string[]).includes(name)) continue;
    const clipped = value.slice(0, 4000);
    out[name] = out[name] !== undefined ? `${out[name]}\n${clipped}` : clipped;
  }
  if (out["set-cookie"] !== undefined) out["set-cookie"] = redactSetCookie(out["set-cookie"]);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Decodes the handful of entities that commonly appear in titles. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Extracts page facts from (at most the first MiB of) an HTML document. */
export function htmlFacts(body: string): HtmlFacts {
  const text = body.slice(0, 1024 * 1024);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1];
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([^"'\s>]*)/i.exec(text)?.[1];
  const csp =
    /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*content\s*=\s*"([^"]*)"/i.exec(
      text
    )?.[1];
  const imgs = text.match(/<img\b[^>]*>/gi) ?? [];
  const privacy = /<a\b[^>]*href\s*=\s*["']([^"']*privacy[^"']*)["']/i.exec(text)?.[1];
  return {
    title: title === undefined ? null : decodeEntities(title).replace(/\s+/g, " ").trim().slice(0, 300),
    lang: lang === undefined || lang === "" ? null : lang.slice(0, 50),
    has_viewport: /<meta\b[^>]*name\s*=\s*["']?viewport/i.test(text),
    meta_csp: csp === undefined ? null : csp.slice(0, 2000),
    img_total: imgs.length,
    img_missing_alt: imgs.filter((tag) => !/\balt\s*=/i.test(tag)).length,
    privacy_link: privacy === undefined ? null : privacy.slice(0, 500),
  };
}

/** Recognizes a publicly served sensitive file from its first bytes, without keeping them. */
export function exposureSignature(
  path: string,
  status: number | null,
  contentType: string | null,
  body: string
): { looks_sensitive: boolean; signature: string | null } {
  if (status === null || status < 200 || status >= 300) return { looks_sensitive: false, signature: null };
  if (contentType !== null && /text\/html/i.test(contentType))
    return { looks_sensitive: false, signature: null };
  const head = body.slice(0, 4096);
  if (/\.env/.test(path) && /^[A-Z_][A-Z0-9_]*\s*=/m.test(head))
    return { looks_sensitive: true, signature: "env-assignments" };
  if (/\.git\/HEAD$/.test(path) && /^ref:\s*refs\//.test(head))
    return { looks_sensitive: true, signature: "git-head" };
  if (/\.git\/config$/.test(path) && /^\[core\]/m.test(head))
    return { looks_sensitive: true, signature: "git-config" };
  return { looks_sensitive: false, signature: null };
}

/** Known framework starter titles that indicate an unedited template. */
export const STARTER_TITLES = [
  "create next app",
  "vite + react",
  "vite + react + ts",
  "vite + vue",
  "vite + svelte",
  "vite app",
  "react app",
  "svelte app",
  "nuxt",
  "welcome to remix",
  "new remix app",
  "astro",
  "my v0 project",
  "v0 app",
  "lovable app",
  "bolt",
];
