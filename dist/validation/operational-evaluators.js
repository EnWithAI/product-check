// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * CT-T4 evaluators backed by exported operational files (docs/operational-imports.md): PC-T-14 (monitoring and
 * alerting), PC-T-18 (SLOs complete), PC-T-19 (SLOs alerted) and PC-T-20 (declared dependencies observed at
 * runtime). Configuration files are facts about configuration; a service graph is a snapshot of one time window.
 */
import { sloMatchesRule } from "../importers/operational.js";
import { checked, unchecked, } from "./context.js";
/** Evidence for the imported OpenSLO files. */
function sloEvidence(ctx, s, summary) {
    return ctx.ev.add({
        kind: "imported-report",
        pop: "observability",
        strength: "imported-report",
        provenance: "imported",
        locator: s.source,
        revision: null,
        summary,
        checksum: s.sha256,
    });
}
const PC_T_18 = (ctx) => {
    if (!ctx.openslo)
        return unchecked("NOT_TESTED", "No OpenSLO files were imported (optional; pass --openslo <file>).");
    const s = ctx.openslo.data;
    const incomplete = s.slos.filter((o) => o.missing.length > 0);
    const services = [...new Set(s.slos.map((o) => o.service).filter((x) => x !== null))].sort();
    const id = sloEvidence(ctx, ctx.openslo, `OpenSLO: ${s.slos.length} SLO(s) for ${services.length} service(s)${services.length ? ` (${services.slice(0, 10).join(", ")})` : ""}; ${incomplete.length} incomplete; ${s.slis} SLI(s), ${s.alert_policies} alert polic(ies); ${s.unsupported} document(s) of another OpenSLO version`);
    if (s.slos.length === 0)
        return checked("PARTIAL", "The imported OpenSLO files define no SLO.", "imported-report", "imported-report", [id], [
            {
                fingerprint: "no-slo",
                location: ctx.openslo.source,
                actual: "No SLO is defined in the imported OpenSLO files.",
                evidence: [id],
                epistemic: "fact",
                confidence: "HIGH",
                title: "No SLO is defined",
            },
        ]);
    if (incomplete.length === 0)
        return checked("PASS", `All ${s.slos.length} SLO(s) define a service, a time window, an objective target and an indicator.`, "imported-report", "imported-report", [id]);
    return checked("PARTIAL", `${incomplete.length} of ${s.slos.length} SLO(s) are incomplete.`, "imported-report", "imported-report", [id], incomplete.map((o) => ({
        fingerprint: `slo-incomplete:${o.name}`,
        location: o.name,
        actual: `SLO ${o.name} is missing: ${o.missing.join(", ")}.`,
        evidence: [id],
        epistemic: "fact",
        confidence: "HIGH",
        title: "SLO is incomplete",
    })));
};
const PC_T_19 = (ctx) => {
    if (!ctx.openslo)
        return unchecked("NOT_TESTED", "No OpenSLO files were imported (optional; pass --openslo <file>).");
    const s = ctx.openslo.data;
    if (s.slos.length === 0)
        return unchecked("NOT_TESTED", "The imported OpenSLO files define no SLO.");
    const rules = ctx.alertRules?.data.alerting ?? [];
    const byPolicy = s.slos.filter((o) => o.has_alert_policy);
    const byRule = s.slos.filter((o) => !o.has_alert_policy && rules.some((r) => sloMatchesRule(o.name, r)));
    const uncovered = s.slos.filter((o) => !byPolicy.includes(o) && !byRule.includes(o));
    const id = sloEvidence(ctx, ctx.openslo, `OpenSLO alerting: ${s.slos.length} SLO(s); ${byPolicy.length} by alert policy, ${byRule.length} by alert-rule name match (inference)${ctx.alertRules ? ` against ${rules.length} alerting rule(s) in ${ctx.alertRules.source}` : "; no alert rules imported"}; ${uncovered.length} without an alert`);
    if (uncovered.length === 0)
        return checked("PASS", "Every SLO has an alert policy or a matching alerting rule.", "imported-report", "imported-report", [id]);
    return checked("PARTIAL", `${uncovered.length} of ${s.slos.length} SLO(s) have no alert policy and no matching alerting rule.`, "imported-report", "imported-report", [id], uncovered.map((o) => ({
        fingerprint: `slo-unalerted:${o.name}`,
        location: o.name,
        actual: `SLO ${o.name} has no alert policy and no alerting rule names it${o.dangling_policy_refs.length ? ` (unresolved alertPolicyRef: ${o.dangling_policy_refs.join(", ")})` : ""}.`,
        evidence: [id],
        epistemic: "fact",
        confidence: "HIGH",
        title: "SLO is not alerted on",
    })));
};
/** Lower case, letters and digits only. */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const lastSegment = (id) => id.split(".").at(-1) ?? id;
const PC_T_20 = (ctx) => {
    if (!ctx.serviceGraph)
        return unchecked("NOT_TESTED", "No service graph was imported (optional; pass --service-graph <file>).");
    if (!ctx.architecture)
        return unchecked("NOT_TESTED", "A service graph was imported, but the declared relationships come from an Architecture Check report (--architecture-check).");
    const g = ctx.serviceGraph.data;
    const candidates = ctx.architecture.data.unobserved;
    const confirmed = candidates.filter((c) => g.edges.some((e) => norm(e.client) === norm(lastSegment(c.from)) && norm(e.server) === norm(lastSegment(c.to))));
    const missing = candidates.filter((c) => !confirmed.includes(c));
    const id = ctx.ev.add({
        kind: "imported-report",
        pop: "observability",
        strength: "imported-report",
        provenance: "imported",
        locator: ctx.serviceGraph.source,
        revision: null,
        summary: `Service graph (${g.format}): ${g.edges.length} edge(s), ${g.external_peers} external peer(s); ${candidates.length} declared relationship(s) without static evidence, ${confirmed.length} observed at runtime (name match). A snapshot of one time window that the export does not record.`,
        checksum: ctx.serviceGraph.sha256,
    });
    if (missing.length === 0)
        return checked("PASS", candidates.length === 0
            ? "Every declared relationship already has static evidence; nothing needed runtime confirmation."
            : `All ${candidates.length} declared relationship(s) without static evidence were observed at runtime.`, "imported-report", "imported-report", [id]);
    return checked("PARTIAL", `${missing.length} declared relationship(s) have neither static evidence nor a runtime edge in this snapshot.`, "imported-report", "imported-report", [id], missing.map((c) => ({
        fingerprint: `relationship-not-observed:${c.from}->${c.to}`,
        location: `${c.from} -> ${c.to}`,
        actual: `The declared relationship ${c.from} -> ${c.to} has no static evidence and no runtime edge in the imported service graph.`,
        evidence: [id],
        epistemic: "inference",
        confidence: "MEDIUM",
        title: "Declared dependency not observed at runtime",
    })));
};
const PC_T_14 = (ctx) => {
    const alerting = (ctx.alertRules?.data.alerting.length ?? 0) > 0 ||
        (ctx.openslo?.data.slos.some((o) => o.has_alert_policy) ?? false);
    const telemetry = (ctx.serviceGraph?.data.edges.length ?? 0) > 0;
    if (!ctx.alertRules && !ctx.openslo && !ctx.serviceGraph)
        return unchecked("NOT_TESTED", "No operational files were imported (optional; pass --openslo, --alert-rules and/or --service-graph).");
    const sources = [ctx.openslo, ctx.alertRules, ctx.serviceGraph].filter((x) => x !== null);
    const id = ctx.ev.add({
        kind: "imported-report",
        pop: "observability",
        strength: "imported-report",
        provenance: "imported",
        locator: sources.map((s) => s.source).join(", "),
        revision: null,
        summary: `Monitoring: alert configuration ${alerting ? "present" : "absent"} (${ctx.alertRules?.data.alerting.length ?? 0} alerting rule(s), ${ctx.openslo?.data.slos.filter((o) => o.has_alert_policy).length ?? 0} SLO(s) with an alert policy); runtime telemetry ${telemetry ? `present (${ctx.serviceGraph?.data.edges.length ?? 0} service-graph edge(s))` : "absent"}`,
        checksum: sources.length === 1 ? (sources[0]?.sha256 ?? null) : null,
    });
    if (alerting && telemetry)
        return checked("PASS", "Alert configuration and runtime telemetry were imported.", "imported-report", "imported-report", [id]);
    const missingHalf = alerting
        ? "runtime telemetry (a service graph)"
        : "alert configuration (alert rules or SLO alert policies)";
    return checked("PARTIAL", `Missing ${missingHalf}.`, "imported-report", "imported-report", [id], [
        {
            fingerprint: "monitoring-incomplete",
            location: sources.map((s) => s.source).join(", "),
            actual: `The imported files show no ${missingHalf}.`,
            evidence: [id],
            epistemic: "inference",
            confidence: "MEDIUM",
            title: "Monitoring or alerting evidence is incomplete",
        },
    ]);
};
/** Evaluators for the operational controls, keyed by control ID. */
export const OPERATIONAL_EVALUATORS = {
    "PC-T-14": PC_T_14,
    "PC-T-18": PC_T_18,
    "PC-T-19": PC_T_19,
    "PC-T-20": PC_T_20,
};
