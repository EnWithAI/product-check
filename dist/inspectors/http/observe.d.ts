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
    exposure: {
        looks_sensitive: boolean;
        signature: string | null;
    } | null;
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
export declare const KEPT_HEADERS: readonly ["content-security-policy", "content-security-policy-report-only", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "server", "x-powered-by", "set-cookie", "location", "content-type"];
/** Redacts cookie values, keeping names and attributes. */
export declare function redactSetCookie(value: string): string;
/** Normalizes headers to lowercase names, keeps the allowlist and redacts cookie values. */
export declare function keepHeaders(entries: Iterable<[string, string]>): Record<string, string>;
/** Extracts page facts from (at most the first MiB of) an HTML document. */
export declare function htmlFacts(body: string): HtmlFacts;
/** Recognizes a publicly served sensitive file from its first bytes, without keeping them. */
export declare function exposureSignature(path: string, status: number | null, contentType: string | null, body: string): {
    looks_sensitive: boolean;
    signature: string | null;
};
/** Known framework starter titles that indicate an unedited template. */
export declare const STARTER_TITLES: string[];
