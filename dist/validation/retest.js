import { stableId } from "../util/hash.js";
import { control } from "./catalog.js";
const isChecked = (v) => !!v && (v.status === "PASS" || v.status === "PARTIAL" || v.status === "FAIL");
/** Applies the baseline to this run's findings and validations (mutates them) and returns the comparison skeleton. */
export function applyBaseline(validations, findings, baseline, baselineSha, ev, runId) {
    const prevFindings = new Map(baseline.findings.map((f) => [f.id, f]));
    const prevValidations = new Map(baseline.validations.map((v) => [v.control_id, v]));
    const prevEvidence = new Map(baseline.evidence.map((e) => [e.id, e]));
    const nowValidations = new Map(validations.map((v) => [v.control_id, v]));
    const preserve = (ids) => {
        for (const id of ids) {
            const item = prevEvidence.get(id);
            if (item)
                ev.preserve(item);
        }
    };
    const baselineEntry = (f) => ({
        run_id: baseline.run.run_id,
        status: f.status,
        evidence_ids: f.evidence_ids,
    });
    const comparison = {
        baseline_run_id: baseline.run.run_id,
        baseline_sha256: baselineSha,
        score_delta: { customer: null, technology: null, trust: null },
        coverage_delta: { customer: 0, technology: 0, trust: 0 },
        regressed_controls: [],
        improved_controls: [],
        findings_new: [],
        findings_resolved: [],
        findings_reopened: [],
        findings_persisting: [],
        findings_unverified: [],
    };
    for (const v of validations) {
        const before = prevValidations.get(v.control_id);
        if (!before)
            continue;
        if (before.status === "PASS" && (v.status === "FAIL" || v.status === "PARTIAL"))
            comparison.regressed_controls.push(v.control_id);
        if ((before.status === "FAIL" || before.status === "PARTIAL") && v.status === "PASS")
            comparison.improved_controls.push(v.control_id);
    }
    // PC-T-16: release-to-release regression.
    const t16 = nowValidations.get("PC-T-16");
    const extra = [];
    if (t16 && t16.status === "NOT_TESTED") {
        const def = control("PC-T-16");
        const id = ev.add({
            kind: "baseline-comparison",
            pop: "repository",
            strength: "static",
            provenance: "observed",
            locator: `baseline ${baseline.run.run_id}`,
            summary: comparison.regressed_controls.length === 0
                ? "No control regressed from PASS since the baseline."
                : `Regressed since baseline: ${comparison.regressed_controls.join(", ")}`,
            checksum: baselineSha,
        });
        t16.evidence_ids = [id];
        t16.method = "baseline-comparison";
        t16.strength = "static";
        t16.reason = null;
        ev.link(id, t16.id);
        if (comparison.regressed_controls.length === 0) {
            t16.status = "PASS";
            t16.actual = `Compared with ${baseline.run.run_id}: no control regressed from PASS.`;
        }
        else {
            t16.status = "FAIL";
            t16.actual = `${comparison.regressed_controls.length} control(s) regressed since ${baseline.run.run_id}: ${comparison.regressed_controls.join(", ")}.`;
            for (const c of comparison.regressed_controls) {
                const fid = stableId("PCF", ["PC-T-16", c]);
                const prev = prevFindings.get(fid);
                extra.push({
                    id: fid,
                    control_id: "PC-T-16",
                    title: `Regression: ${control(c).title}`,
                    category: def.category,
                    pillar: def.pillar,
                    severity: def.severity,
                    ux_severity: null,
                    status: "OPEN",
                    lifecycle: prev ? "PERSISTING" : "NEW",
                    epistemic: "fact",
                    confidence: "HIGH",
                    reproducibility: "deterministic",
                    reproduction: [`Compare VAL-${c} in this run with the baseline ${baseline.run.run_id}.`],
                    pop: "repository",
                    location: c,
                    expected: def.expected,
                    actual: `${c} was PASS in the baseline and is ${nowValidations.get(c)?.status ?? "?"} now.`,
                    impact: { ...def.impact },
                    root_cause: { statement: def.root_cause, certainty: "inference" },
                    evidence_ids: [id, ...(nowValidations.get(c)?.evidence_ids.slice(0, 3) ?? [])],
                    validation_id: t16.id,
                    work_packet_id: null,
                    first_seen_run: prev?.first_seen_run ?? runId,
                    history: prev ? [...prev.history, baselineEntry(prev)] : [],
                });
                (prev ? comparison.findings_persisting : comparison.findings_new).push(fid);
            }
            t16.finding_ids = extra.map((f) => f.id).sort();
        }
    }
    // Lifecycle of this run's findings, then of baseline findings no longer observed (after PC-T-16 is decided).
    for (const f of findings) {
        const prev = prevFindings.get(f.id);
        if (!prev) {
            f.lifecycle = "NEW";
            comparison.findings_new.push(f.id);
            continue;
        }
        preserve(prev.evidence_ids);
        f.first_seen_run = prev.first_seen_run;
        f.history = [...prev.history, baselineEntry(prev)];
        if (prev.status === "RESOLVED") {
            f.lifecycle = "REOPENED";
            comparison.findings_reopened.push(f.id);
        }
        else {
            f.lifecycle = "PERSISTING";
            comparison.findings_persisting.push(f.id);
        }
    }
    const current = new Set([...findings, ...extra].map((f) => f.id));
    const carried = [];
    for (const prev of baseline.findings) {
        if (current.has(prev.id) || prev.status === "RESOLVED")
            continue;
        preserve(prev.evidence_ids);
        const v = nowValidations.get(prev.control_id);
        const history = [...prev.history, baselineEntry(prev)];
        if (isChecked(v) && v) {
            carried.push({
                ...prev,
                status: "RESOLVED",
                lifecycle: "RESOLVED",
                evidence_ids: [...new Set([...prev.evidence_ids, ...v.evidence_ids])],
                history,
                work_packet_id: null,
            });
            comparison.findings_resolved.push(prev.id);
        }
        else {
            carried.push({
                ...prev,
                status: "UNVERIFIED",
                lifecycle: "CARRIED_UNVERIFIED",
                history,
                work_packet_id: null,
            });
            comparison.findings_unverified.push(prev.id);
            if (v && !v.finding_ids.includes(prev.id))
                v.finding_ids = [...v.finding_ids, prev.id].sort();
        }
    }
    for (const key of [
        "findings_new",
        "findings_resolved",
        "findings_reopened",
        "findings_persisting",
        "findings_unverified",
        "regressed_controls",
        "improved_controls",
    ]) {
        comparison[key].sort();
    }
    return { findings: [...findings, ...extra, ...carried], comparison };
}
