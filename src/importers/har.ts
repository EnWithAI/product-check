// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Converts a HAR file (browser DevTools "Save all as HAR") into observations for one origin. Only entries for the
 * scoped origin are used; request headers, cookies and bodies are discarded; response headers pass through the
 * same allowlist as live probes.
 */
import { createHash } from "node:crypto";
import { inputError } from "../errors.js";
import { SCHEMA_VERSION } from "../types.js";
import { htmlFacts, keepHeaders, type Observation, type ObservationSet } from "../inspectors/http/observe.js";

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Converts parsed HAR JSON into an observation set for `origin`. */
export function harToObservations(har: unknown, origin: string, label: string): ObservationSet {
  const log = isObj(har) && isObj(har["log"]) ? har["log"] : null;
  const entries = log && Array.isArray(log["entries"]) ? log["entries"] : null;
  if (!entries) throw inputError(`${label} is not a HAR file (missing log.entries).`);
  const observations: Observation[] = [];
  let landingSeen = false;
  for (const entry of entries.slice(0, 5000)) {
    if (!isObj(entry) || !isObj(entry["request"]) || !isObj(entry["response"])) continue;
    const req = entry["request"];
    const res = entry["response"];
    if (typeof req["url"] !== "string") continue;
    let url: URL;
    try {
      url = new URL(req["url"]);
    } catch {
      continue;
    }
    if (url.origin !== origin || (req["method"] !== "GET" && req["method"] !== "HEAD")) continue;
    const headers = Array.isArray(res["headers"])
      ? res["headers"]
          .filter(isObj)
          .map((h) => [String(h["name"] ?? ""), String(h["value"] ?? "")] as [string, string])
      : [];
    const kept = keepHeaders(headers);
    const content = isObj(res["content"]) ? res["content"] : {};
    const mime = typeof content["mimeType"] === "string" ? content["mimeType"] : (kept["content-type"] ?? "");
    let body = typeof content["text"] === "string" ? content["text"] : "";
    if (content["encoding"] === "base64") body = Buffer.from(body, "base64").toString("utf8");
    const isDocument = /text\/html/i.test(mime) && body.length > 0;
    const status = typeof res["status"] === "number" && res["status"] > 0 ? res["status"] : null;
    let purpose: string | null = null;
    if (isDocument && !landingSeen && url.pathname === "/") purpose = "landing";
    else if (/privacy/i.test(url.pathname) && isDocument) purpose = "privacy";
    else if (url.pathname === "/.well-known/security.txt") purpose = "security-txt";
    else if (url.pathname === "/robots.txt") purpose = "robots";
    if (purpose === null) continue;
    if (purpose === "landing") landingSeen = true;
    const timings = isObj(entry["timings"]) ? entry["timings"] : {};
    const wait = typeof timings["wait"] === "number" && timings["wait"] >= 0 ? timings["wait"] : null;
    observations.push({
      url: url.href,
      method: req["method"] === "HEAD" ? "HEAD" : "GET",
      purpose,
      requested_at:
        typeof entry["startedDateTime"] === "string" && !Number.isNaN(Date.parse(entry["startedDateTime"]))
          ? new Date(entry["startedDateTime"]).toISOString()
          : new Date(0).toISOString(),
      status,
      redirect_location:
        typeof res["redirectURL"] === "string" && res["redirectURL"] !== "" ? res["redirectURL"] : null,
      final_url: url.href,
      headers: kept,
      timing_ms: wait === null ? null : Math.round(wait),
      body_sha256: body ? createHash("sha256").update(body).digest("hex") : null,
      body_bytes: body ? Buffer.byteLength(body) : null,
      truncated: false,
      html: isDocument ? htmlFacts(body) : null,
      exposure: null,
      error: null,
    });
  }
  return { schema_version: SCHEMA_VERSION, kind: "observations", origin, source: "har", observations };
}
