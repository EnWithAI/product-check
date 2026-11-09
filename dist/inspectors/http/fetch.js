// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The only module in Product Check that touches the network. It performs a small, fixed set of passive GET
 * requests against one authorized origin: no forms, no credentials, no request bodies, no cross-origin
 * redirects, a hard request budget and per-request timeouts. The exposure probe (well-known sensitive paths) runs
 * only when separately authorized. Callers must have passed the safety checks in contract/safety.ts.
 */
import { createHash } from "node:crypto";
import { TOOL_VERSION } from "../../version.js";
import { exposureSignature, htmlFacts, keepHeaders } from "./observe.js";
const MAX_BODY = 1024 * 1024;
export const EXPOSURE_PATHS = ["/.env", "/.env.local", "/.git/HEAD", "/.git/config"];
/** Reads at most MAX_BODY bytes of a response body. */
async function readBody(response) {
    if (!response.body)
        return { bytes: new Uint8Array(), truncated: false };
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    let truncated = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        chunks.push(value);
        total += value.length;
        if (total >= MAX_BODY) {
            truncated = true;
            await reader.cancel();
            break;
        }
    }
    const bytes = new Uint8Array(Math.min(total, MAX_BODY));
    let offset = 0;
    for (const chunk of chunks) {
        const slice = chunk.subarray(0, Math.max(0, bytes.length - offset));
        bytes.set(slice, offset);
        offset += slice.length;
    }
    return { bytes, truncated };
}
/** Performs passive requests against the origin of `options.url`. */
export async function probe(options) {
    const target = new URL(options.url);
    const origin = target.origin;
    const observations = [];
    const skipped = [];
    let requests = 0;
    const request = async (url, purpose) => {
        if (requests >= options.maxRequests) {
            skipped.push(`${purpose} ${url} (request budget of ${options.maxRequests} reached)`);
            return null;
        }
        requests++;
        const requestedAt = options.now().toISOString();
        const started = performance.now();
        try {
            const response = await fetch(url, {
                method: "GET",
                redirect: "manual",
                credentials: "omit",
                headers: {
                    "user-agent": `product-check/${TOOL_VERSION} (passive; authorized assessment)`,
                    accept: "text/html,*/*;q=0.5",
                },
                signal: AbortSignal.timeout(options.timeoutMs),
            });
            const { bytes, truncated } = await readBody(response);
            const timing = Math.round(performance.now() - started);
            const headerEntries = [...response.headers.entries()].filter(([k]) => k !== "set-cookie");
            for (const cookie of response.headers.getSetCookie())
                headerEntries.push(["set-cookie", cookie]);
            const headers = keepHeaders(headerEntries);
            const contentType = response.headers.get("content-type");
            const text = new TextDecoder("utf-8").decode(bytes);
            const isHtml = contentType !== null && /text\/html/i.test(contentType);
            const location = response.headers.get("location");
            const exposure = purpose.startsWith("exposure:")
                ? exposureSignature(new URL(url).pathname, response.status, contentType, text)
                : null;
            return {
                url,
                method: "GET",
                purpose,
                requested_at: requestedAt,
                status: response.status,
                redirect_location: location === null ? null : new URL(location, url).href,
                final_url: url,
                headers,
                timing_ms: timing,
                body_sha256: createHash("sha256").update(bytes).digest("hex"),
                body_bytes: bytes.length,
                truncated,
                html: isHtml && !purpose.startsWith("exposure:") ? htmlFacts(text) : null,
                exposure,
                error: null,
            };
        }
        catch (error) {
            const cause = error.cause?.code;
            return {
                url,
                method: "GET",
                purpose,
                requested_at: requestedAt,
                status: null,
                redirect_location: null,
                final_url: null,
                headers: {},
                timing_ms: null,
                body_sha256: null,
                body_bytes: null,
                truncated: false,
                html: null,
                exposure: null,
                error: `${error.name}${cause ? ` (${cause})` : ""}: ${error.message}`.slice(0, 300),
            };
        }
    };
    // 1. Landing page, following same-origin redirects only (at most 3 hops).
    let url = target.href;
    for (let hop = 0; hop < 4; hop++) {
        const obs = await request(url, "landing");
        if (!obs)
            break;
        observations.push(obs);
        if (obs.status !== null && obs.status >= 300 && obs.status < 400 && obs.redirect_location) {
            const next = new URL(obs.redirect_location);
            if (next.origin !== origin || hop === 3)
                break;
            url = next.href;
        }
        else
            break;
    }
    // 2. Plain-HTTP redirect check (only for https targets; never followed).
    if (target.protocol === "https:") {
        const http = await request(`http://${target.host}/`, "http-redirect");
        if (http)
            observations.push(http);
    }
    // 3. Not-found behaviour, robots.txt, security.txt, privacy page.
    const nonce = createHash("sha256").update(origin).digest("hex").slice(0, 12);
    for (const [path, purpose] of [
        [`/product-check-not-found-${nonce}`, "not-found"],
        ["/robots.txt", "robots"],
        ["/.well-known/security.txt", "security-txt"],
    ]) {
        const obs = await request(`${origin}${path}`, purpose);
        if (obs)
            observations.push(obs);
    }
    const landing = observations.filter((o) => o.purpose === "landing").at(-1);
    const link = landing?.html?.privacy_link;
    const privacyUrl = link ? new URL(link, landing?.final_url ?? origin) : new URL("/privacy", origin);
    if (privacyUrl.origin === origin) {
        const obs = await request(privacyUrl.href, "privacy");
        if (obs)
            observations.push(obs);
    }
    // 4. Exposure probe (separately authorized).
    if (options.exposureProbe) {
        for (const path of EXPOSURE_PATHS) {
            const obs = await request(`${origin}${path}`, `exposure:${path}`);
            if (obs)
                observations.push(obs);
        }
    }
    return { observations, requests, skipped };
}
