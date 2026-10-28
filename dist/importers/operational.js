// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Operational importers for CT-T4 (docs/operational-imports.md): OpenSLO v1 documents, Prometheus/Mimir alert rules
 * and service-graph exports (Jaeger dependencies, `traces_service_graph_request_total` query results). Each reads only
 * the documented fields it needs and rejects inputs it does not recognize instead of guessing. Rule expressions are
 * kept in memory for matching and never written to results.
 */
import { inputError } from "../errors.js";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
const OPENSLO_V1 = "openslo/v1";
/** Parses OpenSLO v1 files; references resolve across all of them by metadata.name. */
export function parseOpenSlo(files) {
    const slos = [];
    const slis = new Set();
    const policies = new Set();
    let unsupported = 0;
    let other = 0;
    for (const file of files) {
        let v1 = 0;
        for (const doc of file.docs) {
            if (!isObj(doc))
                continue;
            const api = doc["apiVersion"];
            if (typeof api === "string" && api.startsWith("openslo/") && api !== OPENSLO_V1) {
                unsupported++;
                continue;
            }
            if (api !== OPENSLO_V1)
                continue;
            v1++;
            const name = isObj(doc["metadata"]) ? str(doc["metadata"]["name"]) : null;
            const kind = doc["kind"];
            if (kind === "SLO")
                slos.push({
                    name: name ?? `(unnamed SLO ${slos.length + 1})`,
                    spec: isObj(doc["spec"]) ? doc["spec"] : {},
                });
            else if (kind === "SLI" && name !== null)
                slis.add(name);
            else if (kind === "AlertPolicy" && name !== null)
                policies.add(name);
            else
                other++;
        }
        if (v1 === 0)
            throw inputError(`${file.source} contains no OpenSLO v1 document (apiVersion: ${OPENSLO_V1}).`, "Pass OpenSLO v1 files (SLO, SLI, AlertPolicy) to --openslo.");
    }
    const infos = slos.map(({ name, spec }) => {
        const missing = [];
        const service = str(spec["service"]);
        if (service === null)
            missing.push("service");
        const window = spec["timeWindow"];
        if (!Array.isArray(window) ||
            window.length !== 1 ||
            !isObj(window[0]) ||
            str(window[0]["duration"]) === null)
            missing.push("time window");
        const objectives = Array.isArray(spec["objectives"]) ? spec["objectives"].filter(isObj) : [];
        if (!objectives.some((o) => typeof o["target"] === "number" || typeof o["targetPercent"] === "number"))
            missing.push("objective target");
        const ref = str(spec["indicatorRef"]);
        if (!isObj(spec["indicator"]) && (ref === null || !slis.has(ref)))
            missing.push("indicator");
        const entries = Array.isArray(spec["alertPolicies"]) ? spec["alertPolicies"] : [];
        const dangling = [];
        let resolved = 0;
        for (const entry of entries) {
            if (!isObj(entry))
                continue;
            const policyRef = str(entry["alertPolicyRef"]);
            if (policyRef !== null) {
                if (policies.has(policyRef))
                    resolved++;
                else
                    dangling.push(policyRef);
            }
            else if (entry["kind"] === "AlertPolicy")
                resolved++;
        }
        return {
            name,
            service,
            missing,
            has_alert_policy: entries.length > 0 && resolved === entries.length,
            dangling_policy_refs: [...new Set(dangling)].sort(),
        };
    });
    return {
        slos: infos.sort(byName),
        slis: slis.size,
        alert_policies: policies.size,
        unsupported,
        other,
    };
}
/** The rule groups of one document, in any of the three accepted shapes; null when it has none. */
function groupsOf(doc) {
    if (!isObj(doc))
        return null;
    if (Array.isArray(doc["groups"]))
        return doc["groups"];
    if (isObj(doc["spec"]) && Array.isArray(doc["spec"]["groups"]))
        return doc["spec"]["groups"];
    if (isObj(doc["data"]) && Array.isArray(doc["data"]["groups"]))
        return doc["data"]["groups"];
    return null;
}
/** Parses Prometheus/Mimir rule files, PrometheusRule resources and /api/v1/rules exports. */
export function parseAlertRules(files) {
    const alerting = [];
    let recording = 0;
    for (const file of files) {
        const groups = file.docs.map(groupsOf).filter((g) => g !== null);
        if (groups.length === 0)
            throw inputError(`${file.source} has no rule groups (groups, spec.groups or data.groups).`, "Pass a Prometheus/Mimir rule file, a PrometheusRule resource or the /api/v1/rules JSON export to --alert-rules.");
        for (const group of groups.flat()) {
            if (!isObj(group) || !Array.isArray(group["rules"]))
                continue;
            for (const rule of group["rules"]) {
                if (!isObj(rule))
                    continue;
                const name = str(rule["alert"]) ?? (rule["type"] === "alerting" ? str(rule["name"]) : null);
                if (name === null) {
                    if (str(rule["record"]) !== null || rule["type"] === "recording")
                        recording++;
                    continue;
                }
                const labels = {};
                if (isObj(rule["labels"]))
                    for (const [k, v] of Object.entries(rule["labels"]))
                        if (typeof v === "string")
                            labels[k] = v;
                alerting.push({ name, expr: String(rule["expr"] ?? rule["query"] ?? ""), labels });
            }
        }
    }
    return { alerting: alerting.sort(byName), recording };
}
/** A rule matches an SLO by a label value or a label matcher in its expression (name-based: an inference). */
export function sloMatchesRule(slo, rule) {
    if (Object.values(rule.labels).includes(slo))
        return true;
    const quoted = slo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`[A-Za-z_][A-Za-z0-9_]*\\s*=~?\\s*"${quoted}"`).test(rule.expr);
}
/** A peer that looks like a host: contains ':' or a dot, or is an IPv4 address. */
const hostLike = (name) => name.includes(":") || name.includes(".");
/** Parses a Jaeger /api/dependencies export or a service-graph metrics query result. */
export function parseServiceGraph(data, source) {
    const bad = () => {
        throw inputError(`${source} is not a service graph export (Jaeger /api/dependencies, or a traces_service_graph_request_total query result).`, "Export it from Jaeger, Tempo or Prometheus as JSON and pass it to --service-graph.");
    };
    const raw = [];
    let format;
    if (isObj(data) && Array.isArray(data["data"])) {
        format = "jaeger";
        for (const link of data["data"]) {
            if (!isObj(link))
                continue;
            const client = str(link["parent"]);
            const server = str(link["child"]);
            const count = link["callCount"];
            if (client === null || server === null || typeof count !== "number")
                return bad();
            raw.push({ client, server, count });
        }
    }
    else if (isObj(data) &&
        data["status"] === "success" &&
        isObj(data["data"]) &&
        Array.isArray(data["data"]["result"])) {
        format = "prometheus";
        for (const series of data["data"]["result"]) {
            if (!isObj(series) || !isObj(series["metric"]))
                return bad();
            const metric = series["metric"];
            const name = metric["__name__"];
            if (typeof name === "string" && !name.endsWith("service_graph_request_total"))
                return bad();
            const client = str(metric["client"]);
            const server = str(metric["server"]);
            const sample = Array.isArray(series["value"])
                ? series["value"]
                : Array.isArray(series["values"])
                    ? series["values"].at(-1)
                    : null;
            const count = Array.isArray(sample) ? Number(sample[1]) : NaN;
            if (client === null || server === null || !Number.isFinite(count))
                return bad();
            raw.push({ client, server, count });
        }
    }
    else
        return bad();
    const external = new Set();
    const sums = new Map();
    for (const e of raw) {
        if (e.count <= 0)
            continue;
        if (hostLike(e.client) || hostLike(e.server)) {
            for (const peer of [e.client, e.server])
                if (hostLike(peer))
                    external.add(peer);
            continue;
        }
        const key = `${e.client}\u0000${e.server}`;
        const edge = sums.get(key) ?? { client: e.client, server: e.server, count: 0 };
        edge.count += e.count;
        sums.set(key, edge);
    }
    const edges = [...sums.values()].sort((a, b) => a.client === b.client ? (a.server < b.server ? -1 : 1) : a.client < b.client ? -1 : 1);
    return { format, edges, external_peers: external.size };
}
