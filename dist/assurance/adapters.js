// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Optional, versioned adapters to the sibling Engineering Commons tools. Product Check reads only documented
 * fields of their JSON reports and never runs or bundles their engines (no dependency in either direction):
 *
 *   Impact Check  2.0 → change-risk input (high-severity impact findings raise risk; affected modules)
 *   Spec Check    1.0 → requirement IDs and acceptance gaps for the spec/outcome lane and fix packets
 *   Outcome Check 1.0 → intent-to-delivery signal for the spec/outcome lane (never a whole-product score)
 *
 * An unsupported version is rejected with a clear message instead of being guessed at.
 */
import { inputError } from "../errors.js";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** Supported report versions, by tool. */
export const ADAPTER_VERSIONS = {
    "impact-check": ["2.0"],
    "spec-check": ["1.0"],
    "outcome-check": ["1.0"],
};
/** Impact Check 2.0 → risk input. */
export function impactAdapter(data, source) {
    if (!isObj(data) || data["schema_version"] !== "2.0" || !Array.isArray(data["findings"]))
        throw inputError(`${source} is not an Impact Check report (supported: ${ADAPTER_VERSIONS["impact-check"].join(", ")}).`, "Produce it with `impact-check --format json`.");
    const findings = data["findings"].filter(isObj);
    const modules = Array.isArray(data["affected_modules"])
        ? data["affected_modules"]
            .filter(isObj)
            .map((m) => String(m["path"] ?? ""))
            .filter(Boolean)
        : [];
    const rev = isObj(data["repo_revision"]) ? data["repo_revision"] : {};
    return {
        schema_version: "2.0",
        high: findings.filter((f) => f["severity"] === "high" && f["status"] !== "unknown").length,
        affected_modules: modules.length,
        commit: typeof rev["commit"] === "string" ? rev["commit"] : null,
        modules,
    };
}
export function specAdapter(data, source) {
    if (!isObj(data) ||
        data["schema_version"] !== "1.0" ||
        !Array.isArray(data["requirements"]) ||
        !Array.isArray(data["findings"]))
        throw inputError(`${source} is not a Spec Check report (supported: ${ADAPTER_VERSIONS["spec-check"].join(", ")}).`, "Produce it with `spec-check check --format json`.");
    return {
        requirements: data["requirements"].filter(isObj).map((r) => ({
            id: String(r["id"] ?? ""),
            path: String(r["path"] ?? ""),
            line: typeof r["line_start"] === "number" ? r["line_start"] : null,
        })),
        gaps: data["findings"]
            .filter(isObj)
            .filter((f) => f["severity"] === "high" || f["severity"] === "medium")
            .map((f) => {
            const ev = Array.isArray(f["evidence"]) ? f["evidence"].filter(isObj)[0] : undefined;
            return {
                id: String(f["id"] ?? ""),
                severity: String(f["severity"]),
                summary: String(f["summary"] ?? ""),
                path: ev && typeof ev["path"] === "string" ? ev["path"] : null,
            };
        }),
    };
}
export function outcomeAdapter(data, source) {
    if (!isObj(data) || data["schema_version"] !== "1.0" || !Array.isArray(data["metrics"]))
        throw inputError(`${source} is not an Outcome Check report (supported: ${ADAPTER_VERSIONS["outcome-check"].join(", ")}).`, "Produce it with `outcome-check report --format json`.");
    const val = (id) => {
        const m = data["metrics"].find((x) => isObj(x) && x["id"] === id);
        const all = isObj(m) && isObj(m["segments"]) ? m["segments"]["all"] : null;
        return isObj(all) && typeof all["value"] === "number" ? all["value"] : null;
    };
    return { ci_first_pass_rate: val("ci_first_pass_rate"), revert_rate: val("revert_rate") };
}
