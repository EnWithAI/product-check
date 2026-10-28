// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Integrity checks for a results document: JSON Schema validity, referential integrity (every evidence, finding,
 * remediation and packet reference resolves), and recomputation of the scorecard and verdict from the
 * validations and findings. A document whose figures do not recompute was edited after generation.
 */
import { formatErrors, validateAgainst } from "../schema/registry.js";
import { computeScorecard } from "../scoring/score.js";
import { computeVerdict } from "../scoring/verdict.js";
import { RUBRIC_VERSIONS } from "../types.js";
import { CONTROL_BY_ID } from "./catalog.js";
/** Stable JSON for comparisons. */
const canon = (v) => JSON.stringify(v);
/** Checks a parsed results document. */
export function checkResults(doc) {
    const errors = [];
    const warnings = [];
    const schemaErrors = validateAgainst("product-check-results.schema.json", doc);
    if (schemaErrors.length > 0)
        return { errors: [`Schema violations:\n${formatErrors(schemaErrors)}`], warnings };
    const r = doc;
    const evidence = new Set();
    for (const e of r.evidence) {
        if (evidence.has(e.id))
            errors.push(`Duplicate evidence ID ${e.id}.`);
        evidence.add(e.id);
    }
    const needEvidence = (ids, where) => {
        for (const id of ids)
            if (!evidence.has(id))
                errors.push(`${where} references missing evidence ${id}.`);
    };
    const validations = new Map(r.validations.map((v) => [v.id, v]));
    const findings = new Map(r.findings.map((f) => [f.id, f]));
    const packets = new Map(r.blueprint.work_packets.map((p) => [p.id, p]));
    const remediations = new Map(r.blueprint.remediations.map((x) => [x.id, x]));
    for (const v of r.validations) {
        needEvidence(v.evidence_ids, v.id);
        if (!CONTROL_BY_ID.has(v.control_id))
            warnings.push(`${v.id}: control ${v.control_id} is not in this version's catalog.`);
        for (const fid of v.finding_ids)
            if (!findings.has(fid))
                errors.push(`${v.id} references missing finding ${fid}.`);
    }
    for (const f of r.findings) {
        needEvidence(f.evidence_ids, f.id);
        if (!validations.has(f.validation_id))
            errors.push(`${f.id} references missing validation ${f.validation_id}.`);
        if (f.work_packet_id !== null && !packets.has(f.work_packet_id))
            errors.push(`${f.id} references missing work packet ${f.work_packet_id}.`);
        if (f.status === "RESOLVED" && validations.get(f.validation_id)?.status === "NOT_TESTED")
            errors.push(`${f.id} is RESOLVED although its control was not re-tested.`);
    }
    for (const p of r.pop_coverage.pops)
        needEvidence(p.evidence_ids, `PoP ${p.id}`);
    for (const rem of r.blueprint.remediations) {
        for (const fid of rem.finding_ids)
            if (!findings.has(fid))
                errors.push(`${rem.id} references missing finding ${fid}.`);
        for (const dep of rem.depends_on)
            if (!remediations.has(dep))
                errors.push(`${rem.id} depends on missing ${dep}.`);
        needEvidence(rem.verification.evidence_ids, rem.id);
        if (rem.verification.status === "VERIFIED" && rem.verification.verified_in_run === null)
            errors.push(`${rem.id} is VERIFIED without a verifying run.`);
    }
    for (const p of r.blueprint.work_packets) {
        if (!remediations.has(p.remediation_id))
            errors.push(`${p.id} references missing remediation ${p.remediation_id}.`);
        for (const fid of p.finding_ids)
            if (!findings.has(fid))
                errors.push(`${p.id} references missing finding ${fid}.`);
        needEvidence(p.context.evidence_ids, p.id);
    }
    for (const t of r.blueprint.traceability) {
        if (!findings.has(t.finding_id))
            errors.push(`Traceability references missing finding ${t.finding_id}.`);
        needEvidence(t.evidence_ids, `traceability ${t.finding_id}`);
    }
    for (const c of r.blueprint.as_is.components)
        needEvidence(c.evidence_ids, c.id);
    for (const l of r.blueprint.test_architecture.layers)
        needEvidence(l.evidence_ids, `test layer ${l.layer}`);
    const last = r.history.at(-1);
    if (!last || last.run_id !== r.run.run_id)
        errors.push("history must end with this run's summary.");
    if ((r.comparison === null) !== (r.run.baseline === null))
        errors.push("comparison and run.baseline must both be present or both be null.");
    if (r.comparison && r.run.baseline && r.comparison.baseline_run_id !== r.run.baseline.run_id)
        errors.push("comparison.baseline_run_id does not match run.baseline.");
    const previous = r.history.length >= 2 ? (r.history.at(-2) ?? null) : null;
    const scorecard = computeScorecard(r.validations, r.findings, r.scorecard.parameters, previous);
    // Earlier rubrics share the scoring rules; keep the stored version so their results still recompute.
    if (RUBRIC_VERSIONS.includes(r.scorecard.rubric_version))
        scorecard.rubric_version = r.scorecard.rubric_version;
    if (canon(scorecard) !== canon(r.scorecard))
        errors.push("The scorecard does not recompute from the validations and findings (edited after generation?).");
    else {
        const verdict = computeVerdict(scorecard, r.findings, r.validations, r.verdict.tier, r.verdict.approval.approver, r.verdict.rejected_acceptances, r.verdict.accepted_risks, {
            repository: r.run.target_revision.repository,
            application: r.run.target_revision.application,
            finishedAt: r.run.finished_at,
        });
        if (verdict.verdict !== r.verdict.verdict ||
            canon(verdict.blocking_gates) !== canon(r.verdict.blocking_gates) ||
            canon(verdict.blocking_findings) !== canon(r.verdict.blocking_findings)) {
            errors.push(`The verdict does not recompute (stored ${r.verdict.verdict}, recomputed ${verdict.verdict}).`);
        }
    }
    if (last &&
        (last.verdict !== r.verdict.verdict ||
            canon(last.scores) !==
                canon({
                    customer: r.scorecard.pillars.customer.score,
                    technology: r.scorecard.pillars.technology.score,
                    trust: r.scorecard.pillars.trust.score,
                }))) {
        errors.push("The history summary for this run does not match the scorecard/verdict.");
    }
    return { errors, warnings };
}
