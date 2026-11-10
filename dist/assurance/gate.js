import { isOpen } from "../scoring/score.js";
import { stableId } from "../util/hash.js";
import { tallyApprovals } from "./approvals.js";
import { ASSURANCE_SCHEMA_VERSION, METHODOLOGY_VERSION, } from "./types.js";
import { daysUntil, digestOf } from "./util.js";
const RESOLVED = new Set(["CLOSED", "VERIFIED_FIXED", "REJECTED_FALSE_POSITIVE"]);
/** Accepted-risk status at a date. */
export function acceptanceStatus(expires, reviewDate, now) {
    if (daysUntil(expires, now) < 0)
        return "EXPIRED";
    if (daysUntil(reviewDate, now) < 0)
        return "REVIEW_DUE";
    return "ACTIVE";
}
/** Phase progress (VC-P0…P7), from what was actually produced. Unexecuted phases are never shown as complete. */
export function phaseProgress(i) {
    const r = i.results;
    const reg = i.register;
    const runs = reg?.verification_runs ?? [];
    const p = (phase, name, status, evidence) => ({ phase, name, status, evidence });
    return [
        p("VC-P0", "Intake and baseline", r.run.status === "COMPLETED" ? "COMPLETED" : "PARTIAL", [
            `Scan ${r.run.run_id} (${r.run.status}, ${r.run.mode_effective ?? "no mode"}, ${r.run.tier}) at ${r.run.target_revision.repository?.commit?.slice(0, 12) ?? "no commit"}; PoP ${r.pop_coverage.summary.available} available / ${r.pop_coverage.summary.blocked} blocked.`,
        ]),
        i.proof
            ? p("VC-P1", "Author-side proof", i.proof.result === "INCONCLUSIVE" ? "PARTIAL" : "COMPLETED", [
                `Proof ${i.proof.verification_id}: ${i.proof.result}, ${i.proof.executions.filter((e) => e.status === "PASS").length}/${i.proof.executions.length} command(s) passed at ${i.proof.exact_sha?.slice(0, 12) ?? "?"}.`,
            ])
            : p("VC-P1", "Author-side proof", "NOT_STARTED", ["No proof run (product-check proof --allow-exec)."]),
        i.review
            ? p("VC-P2", "Layered independent review", i.review.lanes.some((l) => l.status === "NOT_TESTED") ? "PARTIAL" : "COMPLETED", [
                `Review ${i.review.review_id}: ${i.review.findings.length} finding(s), ${i.review.disproven.length} disproven; lanes not run: ${i.review.lanes
                    .filter((l) => l.status === "NOT_TESTED")
                    .map((l) => l.lane)
                    .join(", ") || "none"}.`,
            ])
            : reg
                ? p("VC-P2", "Layered independent review", "PARTIAL", [
                    `Baseline findings independently verified in the register (${reg.entries.length}); no change review.`,
                ])
                : p("VC-P2", "Layered independent review", "NOT_STARTED", []),
        i.review
            ? p("VC-P3", "Risk-routed gate", i.review.gate.status === "NOT_EVALUATED" ? "PARTIAL" : "COMPLETED", [
                `Change risk ${i.review.risk.level}, gate ${i.review.gate.status}, ${i.review.approvals.filter((a) => a.status === "VALID").length}/${i.review.approvals_required.humans} valid approval(s).`,
            ])
            : p("VC-P3", "Risk-routed gate", "NOT_STARTED", ["No change review to route."]),
        i.packets.length > 0
            ? p("VC-P4", "Blueprint and repair", "COMPLETED", [
                `${i.packets.length} fix packet(s); blueprint from scan ${r.run.run_id}.`,
            ])
            : p("VC-P4", "Blueprint and repair", r.blueprint.remediations.length > 0 ? "PARTIAL" : "NOT_STARTED", [
                "No fix packets generated.",
            ]),
        runs.length > 0
            ? p("VC-P5", "Closure verification", runs.some((x) => x.result === "PASS") ? "COMPLETED" : "PARTIAL", [
                `${runs.length} verification run(s): ${runs.filter((x) => x.result === "PASS").length} PASS, ${runs.filter((x) => x.result === "FAIL").length} FAIL, ${runs.filter((x) => x.result === "INCONCLUSIVE").length} INCONCLUSIVE.`,
            ])
            : p("VC-P5", "Closure verification", "NOT_STARTED", []),
        p("VC-P6", "Merge and release", "PARTIAL", [
            "Release gate evaluated against the current commit with approval staleness. Merge-queue simulation, staged rollout and live canary watch are not executed by Product Check (declare a rollout plan; watch is NOT_SUPPORTED).",
        ]),
        (reg?.regression_corpus.length ?? 0) > 0 ||
            (reg?.entries.some((e) => e.state === "REJECTED_FALSE_POSITIVE" || e.regressions.length > 0) ?? false)
            ? p("VC-P7", "Learn and assure", "PARTIAL", [
                `${reg?.regression_corpus.length ?? 0} regression corpus case(s); ${reg?.entries.filter((e) => e.state === "REJECTED_FALSE_POSITIVE").length ?? 0} false positive(s); ${reg?.entries.filter((e) => e.regressions.length > 0).length ?? 0} regressed finding(s). Telemetry-driven incident import is not supported.`,
            ])
            : p("VC-P7", "Learn and assure", "NOT_STARTED", []),
    ];
}
/** Evaluates the release gate. */
export function evaluateGate(i) {
    const { results: r, register: reg, review, proof, policy, now } = i;
    const conditions = [];
    const c = (id, title, status, detail, refs = []) => {
        conditions.push({ id, title, status, detail, refs });
    };
    // Open findings: the register (with closure states) supersedes the raw results when present.
    const open = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const accepted = (reg?.risk_acceptances ?? []).map((a) => ({
        acceptance_id: a.acceptance_id,
        finding_id: a.finding_id,
        expires: a.expires,
        status: acceptanceStatus(a.expires, a.review_date, now),
    }));
    const blockingIds = [];
    const p1Unaccepted = [];
    const triageIds = [];
    if (reg) {
        for (const e of reg.entries) {
            if (RESOLVED.has(e.state))
                continue;
            if (e.source === "change-review" && !i.relevantReviewIds.includes(e.opened_in))
                continue;
            const acc = accepted.find((a) => a.finding_id === e.finding_id && e.state === "ACCEPTED_RISK");
            if (acc && acc.status !== "EXPIRED")
                continue;
            open[e.severity]++;
            // Unverified P1 claims never drive a block (they need triage); P0 fails closed per policy.
            const verified = ["CONFIRMED", "CORROBORATED", "REPRODUCED"].includes(e.verification.state);
            if (e.severity === "P0" &&
                (verified || (policy.review.fail_closed_unverified_p0 && e.verification.state !== "DISPROVEN")))
                blockingIds.push(e.finding_id);
            else if (e.severity === "P1" && verified) {
                blockingIds.push(e.finding_id);
                p1Unaccepted.push(e.finding_id);
            }
            else if (e.severity === "P0" || e.severity === "P1")
                triageIds.push(e.finding_id);
        }
    }
    else {
        for (const f of r.findings.filter(isOpen)) {
            open[f.severity]++;
            if (f.severity === "P0" || f.severity === "P1")
                blockingIds.push(f.id);
            if (f.severity === "P1")
                p1Unaccepted.push(f.id);
        }
    }
    const reviewBlock = review?.findings.filter((f) => f.blocking) ?? [];
    const scanSha = r.run.target_revision.repository?.commit ?? null;
    const staleScan = scanSha !== null && i.headSha !== null && scanSha !== i.headSha;
    c("RC-0", "Product scan describes the head commit", i.headSha === null || scanSha === null ? "NOT_EVALUATED" : staleScan ? "NOT_EVALUATED" : "PASS", staleScan
        ? `The product scan is for ${scanSha?.slice(0, 12)}, HEAD is ${i.headSha?.slice(0, 12)}: its verdict and gates describe an older commit. Re-run: product-check retest --baseline <results> --repo . --out-dir <workspace>, then product-check register.`
        : i.headSha === null || scanSha === null
            ? "Scan commit or HEAD unknown."
            : `Scan ${r.run.run_id} is at HEAD.`);
    const failedGates = staleScan
        ? []
        : r.scorecard.gates.filter((g) => g.status === "FAIL").map((g) => g.gate_id);
    c("RC-1", "No open P0 or failed hard gate", !blockingIds.some((id) => reg?.entries.find((e) => e.finding_id === id)?.severity === "P0" ||
        r.findings.find((f) => f.id === id)?.severity === "P0") &&
        failedGates.length === 0 &&
        !reviewBlock.some((f) => f.severity === "P0")
        ? "PASS"
        : "FAIL", `${open.P0} open P0; failed gates: ${failedGates.join(", ") || "none"}${staleScan ? " (scan is stale; gates not re-checked at HEAD)" : ""}; change-review P0 blockers: ${reviewBlock.filter((f) => f.severity === "P0").length}.`, blockingIds.filter((x) => x));
    const expired = accepted.filter((a) => a.status === "EXPIRED");
    c("RC-2", "P1 handled under the CT3 policy (fixed, or a valid unexpired acceptance)", p1Unaccepted.length === 0 && expired.length === 0 && !reviewBlock.some((f) => f.severity === "P1")
        ? "PASS"
        : "FAIL", `${p1Unaccepted.length} P1 without a valid acceptance; ${expired.length} expired acceptance(s); change-review P1 blockers: ${reviewBlock.filter((f) => f.severity === "P1").length}.`, p1Unaccepted);
    const proofAtHead = proof && i.headSha !== null && proof.exact_sha === i.headSha ? proof : null;
    c("RC-3", "Required checks executed and green at the head commit", policy.required_checks.length === 0
        ? "NOT_EVALUATED"
        : !proofAtHead
            ? "NOT_EVALUATED"
            : proofAtHead.result === "PASS"
                ? "PASS"
                : proofAtHead.result === "FAIL"
                    ? "FAIL"
                    : "NOT_EVALUATED", policy.required_checks.length === 0
        ? "The policy declares no required checks."
        : proofAtHead
            ? `Proof ${proofAtHead.verification_id}: ${proofAtHead.result}.`
            : `No proof run at ${i.headSha?.slice(0, 12) ?? "an unknown head"}.`, proofAtHead ? [proofAtHead.verification_id] : []);
    const allApprovals = [
        ...new Map([...(reg?.approvals ?? []), ...i.approvals].map((a) => [a.approval_id, a])).values(),
    ];
    const required = review ? review.approvals_required.humans : policy.risk.approvals.MEDIUM;
    const tally = i.headSha === null
        ? null
        : review
            ? tallyApprovals(allApprovals, policy, {
                scopeType: "change",
                ref: review.change_ref,
                sha: i.headSha,
                excluded: review.author.id ? [review.author.id] : [],
            }, required, review.approvals_required.domain_owners)
            : tallyApprovals(allApprovals, policy, { scopeType: "release", ref: r.contract.target.name, sha: i.headSha, excluded: [] }, required);
    const reviewStale = review !== null && i.headSha !== null && review.head_sha !== i.headSha;
    c("RC-4", "Human approvals valid for the head commit", tally === null ? "NOT_EVALUATED" : tally.satisfied && !reviewStale ? "PASS" : "FAIL", tally === null
        ? "Head commit unknown."
        : reviewStale
            ? `The change review covers ${review?.head_sha?.slice(0, 12) ?? "?"}, but HEAD is ${i.headSha?.slice(0, 12) ?? "?"}; re-review and re-approve.`
            : `${tally.validApprovers.length}/${required} valid signed approval(s) (scope ${review ? `change:${review.change_ref}` : `release:${r.contract.target.name}`})${tally.stale ? `, ${tally.stale} stale` : ""}${tally.missingOwners.length ? `; domain owner(s) missing: ${tally.missingOwners.join(", ")}` : ""}.`);
    const gaps = [
        ...r.pop_coverage.pops
            .filter((p) => p.relevant && (p.status === "BLOCKED" || p.status === "PARTIAL"))
            .map((p) => `${p.name}: ${p.status}${p.limitations[0] ? ` (${p.limitations[0]})` : ""}`),
        ...r.scorecard.not_tested_controls.map((x) => `${x} not tested`),
        ...r.scorecard.blocked_controls.map((x) => `${x} blocked`),
    ];
    c("RC-5", "Coverage gaps disclosed", "PASS", `${gaps.length} gap(s) disclosed below; overall coverage ${Math.round(r.scorecard.overall_coverage * 100)}%.`);
    const pending = reg?.entries.filter((e) => e.state === "RETEST_REQUIRED" || e.state === "FIX_PROPOSED") ?? [];
    c("RC-6", "Targeted fixes retested", !reg ? "NOT_EVALUATED" : pending.length === 0 ? "PASS" : "FAIL", !reg
        ? "No closure register."
        : pending.length === 0
            ? "No fix is waiting for verification."
            : `Awaiting verification: ${pending.map((e) => e.finding_id).join(", ")}.`, pending.map((e) => e.finding_id));
    const material = review?.risk.effective_level === "HIGH" ||
        accepted.length > 0 ||
        ["CT-T3", "CT-T4", "CT-T5", "CT-T6"].includes(r.run.tier);
    c("RC-7", "Rollback or containment available for material risk", policy.release.rollback_plan ? "PASS" : material ? "FAIL" : "NOT_EVALUATED", policy.release.rollback_plan
        ? `Rollback plan: ${policy.release.rollback_plan}${policy.release.staged_rollout ? `; staged rollout: ${policy.release.staged_rollout}` : ""}.`
        : material
            ? "Material risk (HIGH change, accepted risk or CT-T3+) and no rollback plan declared in the policy."
            : "No rollback plan declared; no material risk identified.");
    const regressedEntries = reg?.entries.filter((e) => e.state === "REGRESSED") ?? [];
    const regressedControls = r.comparison?.regressed_controls ?? [];
    c("RC-8", "No material regression", regressedEntries.length > 0 || regressedControls.length > 0
        ? "FAIL"
        : reg || r.comparison
            ? "PASS"
            : "NOT_EVALUATED", regressedEntries.length > 0 || regressedControls.length > 0
        ? `Regressed: ${[...regressedEntries.map((e) => e.finding_id), ...regressedControls].join(", ")}.`
        : reg || r.comparison
            ? "No regressed finding or control."
            : "No history to compare against.");
    // Executed evidence -------------------------------------------------------------------------------------------
    const executions = [
        ...(proof?.executions ?? []),
        ...(reg?.verification_runs.flatMap((v) => v.executions) ?? []),
    ];
    const executedTests = r.evidence.filter((e) => e.strength === "executed-test" || e.strength === "runtime").length;
    const executed = {
        count: executions.length,
        passed: executions.filter((e) => e.status === "PASS").length,
        failed: executions.filter((e) => e.status === "FAIL").length,
        not_run: executions.filter((e) => e.status === "NOT_TESTED" || e.status === "BLOCKED").length,
    };
    const anythingExecuted = executed.passed + executed.failed > 0 ||
        executedTests > 0 ||
        (reg?.verification_runs.some((v) => v.after_results !== null) ?? false);
    const reasons = [];
    // Substantiated blockers decide first; then missing evidence; then unmet release preconditions (approvals, rollback).
    const PRECONDITIONS = new Set(["RC-4", "RC-7"]);
    const hardFails = conditions.filter((x) => x.status === "FAIL" && !PRECONDITIONS.has(x.id));
    const preFails = conditions.filter((x) => x.status === "FAIL" && PRECONDITIONS.has(x.id));
    const productNotReady = !staleScan && r.verdict.verdict === "NOT_READY";
    const insufficient = staleScan ||
        !anythingExecuted ||
        r.verdict.verdict === "INCONCLUSIVE" ||
        r.scorecard.overall_coverage < r.contract.scoring.min_coverage ||
        conditions.some((x) => x.id === "RC-3" && x.status === "NOT_EVALUATED") ||
        conditions.some((x) => x.id === "RC-4" && x.status === "NOT_EVALUATED");
    let decision;
    if (hardFails.length > 0 || productNotReady || review?.gate.status === "BLOCK") {
        decision = "NO_GO";
        reasons.push(...hardFails.map((x) => `${x.id} ${x.title}: ${x.detail}`));
        if (productNotReady)
            reasons.push(`Product verdict NOT_READY: ${r.verdict.reasons.join(" ")}`);
        if (review?.gate.status === "BLOCK")
            reasons.push(`Change gate BLOCK: ${review.gate.reasons.join(" ")}`);
        reasons.push(...preFails.map((x) => `${x.id} ${x.title}: ${x.detail}`));
    }
    else if (insufficient) {
        decision = "UNKNOWN";
        if (!anythingExecuted)
            reasons.push("INSUFFICIENT EVIDENCE: no check was executed (no proof run, no executed tests, no verification). A clean static scan is not a pass.");
        if (staleScan)
            reasons.push(`Product scan is stale (scan ${scanSha?.slice(0, 12)}, HEAD ${i.headSha?.slice(0, 12)}); re-scan before a release decision.`);
        if (r.verdict.verdict === "INCONCLUSIVE")
            reasons.push(`Product verdict INCONCLUSIVE: ${r.verdict.reasons.join(" ")}`);
        if (r.scorecard.overall_coverage < r.contract.scoring.min_coverage)
            reasons.push(`Coverage ${Math.round(r.scorecard.overall_coverage * 100)}% is below the minimum ${Math.round(r.contract.scoring.min_coverage * 100)}%.`);
        for (const x of conditions.filter((y) => (y.id === "RC-3" || y.id === "RC-4") && y.status === "NOT_EVALUATED"))
            reasons.push(`${x.id} not evaluated: ${x.detail}`);
        reasons.push(...preFails.map((x) => `${x.id} ${x.title}: ${x.detail}`));
    }
    else if (preFails.length > 0) {
        decision = "NO_GO";
        reasons.push(...preFails.map((x) => `${x.id} ${x.title}: ${x.detail}`));
    }
    else {
        const conds = [];
        if (r.verdict.verdict === "READY_WITH_CONDITIONS")
            conds.push(`Product verdict READY_WITH_CONDITIONS: ${r.verdict.reasons.join(" ")}`);
        if (accepted.some((a) => a.status !== "EXPIRED"))
            conds.push(`${accepted.filter((a) => a.status !== "EXPIRED").length} accepted risk(s)${accepted.some((a) => a.status === "REVIEW_DUE") ? ", review due" : ""}.`);
        if (open.P2 > 0)
            conds.push(`${open.P2} open P2 finding(s).`);
        if (triageIds.length > 0)
            conds.push(`${triageIds.length} unverified P0/P1 claim(s) need human triage (not proven defects): ${triageIds.join(", ")}.`);
        if (review?.gate.status === "CONDITIONAL" || review?.gate.status === "NOT_EVALUATED")
            conds.push(`Change gate ${review.gate.status}: ${review.gate.reasons.join(" ")}`);
        for (const x of conditions.filter((y) => y.status === "NOT_EVALUATED"))
            conds.push(`${x.id} not evaluated: ${x.detail}`);
        decision = conds.length > 0 ? "CONDITIONAL_GO" : "GO";
        reasons.push(...(conds.length > 0
            ? conds
            : ["Every release condition passed with executed evidence at the head commit."]));
    }
    const registerDigest = reg ? digestOf(reg) : null;
    return {
        schema_version: ASSURANCE_SCHEMA_VERSION,
        kind: "release-gate",
        methodology_version: METHODOLOGY_VERSION,
        gate_id: stableId("RG", [
            i.resultsSha,
            registerDigest,
            review?.review_id ?? null,
            proof?.verification_id ?? null,
            i.headSha,
            now.toISOString(),
        ]),
        evaluated_at: now.toISOString(),
        target: { name: r.contract.target.name, repository: r.run.target_revision.repository?.label ?? null },
        head_sha: i.headSha,
        decision,
        product_verdict: r.verdict.verdict,
        change_gate: review?.gate.status ?? null,
        conditions,
        blocking_reasons: reasons,
        open,
        open_blocking_ids: blockingIds,
        accepted_risks: accepted,
        approvals: { required, valid: tally?.validApprovers.length ?? 0, stale: tally?.stale ?? 0 },
        executed_checks: executed,
        coverage: {
            customer: r.scorecard.pillars.customer.coverage,
            technology: r.scorecard.pillars.technology.coverage,
            trust: r.scorecard.pillars.trust.coverage,
            overall: r.scorecard.overall_coverage,
            gaps,
        },
        rollback: { declared: policy.release.rollback_plan !== null, ref: policy.release.rollback_plan },
        phases: phaseProgress(i),
        inputs: {
            results_sha256: i.resultsSha,
            register_digest: registerDigest,
            review_id: review?.review_id ?? null,
            proof_run_id: proof?.verification_id ?? null,
        },
    };
}
