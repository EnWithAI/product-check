// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Change review (VC-P2 layered review + VC-P3 risk-routed gate) for PR_DIFF and PRE_PR_LOCAL modes.
 *
 * diff → risk classification → six independent lanes → independent verification of every hit and external
 * claim → de-duplication (rule, component, root-cause signature, impact scope) → repeat detection against the
 * previous cycle → approval routing → change gate (PASS / CONDITIONAL / BLOCK / NOT_EVALUATED).
 *
 * A change PASS never implies whole-product readiness: that is the baseline scan's and the release gate's job.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { sha256, stableId } from "../util/hash.js";
import { redact } from "../util/redact.js";
import { TOOL_VERSION } from "../version.js";
import { tallyApprovals } from "./approvals.js";
import { changeHits, fileHits, lineHits } from "./lanes.js";
import { approvalsRequired, classifyRisk } from "./risk.js";
import { ASSURANCE_SCHEMA_VERSION, METHODOLOGY_VERSION, } from "./types.js";
import { isBlocking, recheckHit, verifyClaim, verifyHit } from "./verification.js";
const LANES = [
    { lane: "spec-outcome", reviewer: "spec-outcome-lane" },
    { lane: "correctness", reviewer: "correctness-lane" },
    { lane: "impact", reviewer: "impact-lane" },
    { lane: "trust-security", reviewer: "trust-security-lane" },
    { lane: "experience", reviewer: "experience-lane" },
    { lane: "operations", reviewer: "operations-lane" },
];
const component = (path) => path.split("/").slice(0, 2).join("/");
/** Dedupe key from rule, component, root-cause signature and impact scope (the signature itself is not stored). */
export const dedupeKey = (h) => sha256([h.rule_id, component(h.path), h.signature, h.lane].join("\u001f")).slice(0, 20);
/** Runs a change review. */
export function reviewChange(input) {
    const { policy, files } = input;
    const limitations = [];
    const author = {
        ...input.author,
        trusted: input.author.id !== null && policy.risk.trusted_authors.includes(input.author.id),
    };
    const { changed, risk, owners } = classifyRisk(files, policy, input.impact);
    const required = approvalsRequired(risk, owners, policy, author);
    // Lanes -------------------------------------------------------------------------------------------------------
    const heads = new Map();
    const head = (p) => {
        if (!heads.has(p))
            heads.set(p, input.headText(p));
        return heads.get(p) ?? null;
    };
    const hits = [];
    for (const f of files) {
        if (f.status === "binary" || f.status === "deleted") {
            if (f.status === "deleted")
                hits.push(...fileHits(f, null));
            continue;
        }
        hits.push(...lineHits(f.path, f.lines.filter((l) => l.kind === "add")));
        hits.push(...fileHits(f, head(f.path)));
    }
    hits.push(...changeHits(files));
    // Verification and de-duplication -----------------------------------------------------------------------------
    const verifiedClaims = input.claims.map((c) => ({ claim: c, v: verifyClaim(c, head(c.path), hits) }));
    const signals = [
        ...hits.map((h) => ({ path: h.path, line: h.line, source: `${h.rule_id}` })),
        ...verifiedClaims
            .filter((c) => c.v.state !== "DISPROVEN")
            .map((c) => ({
            path: c.claim.path,
            line: c.claim.line,
            source: `${c.claim.reviewer} (${c.claim.type})`,
        })),
    ];
    const byKey = new Map();
    const disproven = [];
    const prevKeys = new Set(input.previous?.findings.map((f) => f.dedupe_key) ?? []);
    const failClosed = policy.review.fail_closed_unverified_p0;
    for (const h of hits) {
        const key = dedupeKey(h);
        const existing = byKey.get(key);
        if (existing) {
            existing.occurrences++;
            continue;
        }
        const file = files.find((f) => f.path === h.path);
        const recheck = recheckHit(h, head(h.path), file);
        const others = signals.filter((s) => s.source !== h.rule_id);
        const v = verifyHit(h, recheck, others);
        const evidenceId = input.log.append({
            type: "diff-hunk",
            subject: key,
            commit_sha: input.headSha,
            environment_id: null,
            summary: `${h.rule_id} at ${h.path}${h.line !== null ? `:${h.line}` : ""}`,
            locator: h.path,
            line: h.line,
            payload: { rule_id: h.rule_id, excerpt: redact(h.excerpt), checks: v.checks },
        });
        const finding = {
            id: stableId("RF", [key]),
            rule_id: h.rule_id,
            lane: h.lane,
            reviewer: { id: `${h.lane}-lane`, type: "deterministic", version: TOOL_VERSION },
            title: h.title,
            severity: h.severity,
            pillars: h.pillars,
            location: { path: h.path, line: h.line, runtime: null },
            expected: h.expected,
            actual: redact(h.actual),
            steps_or_command: [
                input.baseSha && input.headSha
                    ? `git diff ${input.baseSha.slice(0, 12)}...${input.headSha.slice(0, 12)} -- ${h.path}`
                    : `inspect ${h.path}${h.line !== null ? `:${h.line}` : ""}`,
            ],
            evidence_ids: [evidenceId],
            confidence: h.confidence,
            epistemic: h.epistemic,
            impact: h.impact,
            affected_scope: `${component(h.path)} (${h.pillars.join(", ")})`,
            baseline_sha: input.baseSha,
            head_sha: input.headSha,
            uncertainty: h.epistemic === "hypothesis"
                ? "Pattern heuristic; needs a second signal or human triage before it can block."
                : null,
            verification: v,
            dedupe_key: key,
            occurrences: 1,
            repeat_of_review: prevKeys.has(key) ? (input.previous?.review_id ?? null) : null,
            blocking: isBlocking(h.severity, v.state, failClosed),
        };
        if (v.state === "DISPROVEN")
            disproven.push({ ...finding, blocking: false });
        else
            byKey.set(key, finding);
    }
    for (const { claim, v } of verifiedClaims) {
        const key = sha256(["claim", claim.reviewer, claim.path, String(claim.line), claim.title].join("\u001f")).slice(0, 20);
        const evidenceId = input.log.append({
            type: "reviewer-claim",
            subject: key,
            commit_sha: input.headSha,
            environment_id: null,
            summary: `${claim.reviewer} (${claim.type}): ${claim.title}`,
            locator: claim.path,
            line: claim.line,
            payload: {
                title: claim.title,
                body: claim.body.slice(0, 500),
                severity: claim.severity,
                checks: v.checks,
            },
        });
        const f = {
            id: stableId("RF", [key]),
            rule_id: "VC-EXT-CLAIM",
            lane: "correctness",
            reviewer: { id: claim.reviewer, type: claim.type, version: "external" },
            title: claim.title,
            severity: claim.severity,
            pillars: ["technology"],
            location: { path: claim.path, line: claim.line, runtime: null },
            expected: "(as stated by the reviewer)",
            actual: redact(claim.body).slice(0, 500),
            steps_or_command: [`inspect ${claim.path}${claim.line !== null ? `:${claim.line}` : ""}`],
            evidence_ids: [evidenceId],
            confidence: "LOW",
            epistemic: "hypothesis",
            impact: "As claimed; not machine-checked.",
            affected_scope: component(claim.path),
            baseline_sha: input.baseSha,
            head_sha: input.headSha,
            uncertainty: "External reviewer claim; treated as a proposal, never as a human approval or proven defect.",
            verification: v,
            dedupe_key: key,
            occurrences: 1,
            repeat_of_review: prevKeys.has(key) ? (input.previous?.review_id ?? null) : null,
            blocking: isBlocking(claim.severity, v.state, false),
        };
        if (v.state === "DISPROVEN")
            disproven.push(f);
        else if (!byKey.has(key))
            byKey.set(key, f);
    }
    // Spec Check gaps that touch changed files (imported facts from a separate tool; advisory).
    if (input.spec) {
        for (const g of input.spec.gaps.filter((x) => x.path !== null && changed.some((c) => c.path === x.path))) {
            const key = sha256(["spec", g.id].join("\u001f")).slice(0, 20);
            byKey.set(key, {
                id: stableId("RF", [key]),
                rule_id: "VC-SP-SPEC-GAP",
                lane: "spec-outcome",
                reviewer: { id: "spec-check", type: "imported", version: "1.0" },
                title: `Changed spec has an unresolved gap: ${g.summary}`,
                severity: "P2",
                pillars: ["customer"],
                location: { path: g.path, line: null, runtime: null },
                expected: "Changed requirements are clear and verifiable before the change ships.",
                actual: `Spec Check ${g.severity}: ${g.summary}`,
                steps_or_command: ["spec-check check --format json"],
                evidence_ids: [],
                confidence: "MEDIUM",
                epistemic: "fact",
                impact: "Acceptance cannot be verified against an unclear requirement.",
                affected_scope: g.path,
                baseline_sha: input.baseSha,
                head_sha: input.headSha,
                uncertainty: null,
                verification: {
                    state: "EVIDENCE_COLLECTED",
                    checks: [{ check: "evidence-present", result: "pass", detail: `Spec Check finding ${g.id}.` }],
                },
                dedupe_key: key,
                occurrences: 1,
                repeat_of_review: prevKeys.has(key) ? (input.previous?.review_id ?? null) : null,
                blocking: false,
            });
        }
    }
    const findings = [...byKey.values()].sort((a, b) => a.severity === b.severity ? (a.id < b.id ? -1 : 1) : a.severity < b.severity ? -1 : 1);
    // Lane summaries -----------------------------------------------------------------------------------------------
    const prodFiles = changed.filter((c) => !c.surfaces.includes("docs"));
    const ui = changed.filter((c) => /\.(jsx|tsx|html|vue|svelte)$/.test(c.path));
    const lanes = LANES.map(({ lane, reviewer }) => {
        const mine = findings.filter((f) => f.lane === lane);
        const notes = [];
        let applicable = prodFiles.length > 0;
        if (lane === "experience")
            applicable = ui.length > 0;
        if (lane === "spec-outcome") {
            if (!input.spec && !input.outcome)
                return {
                    lane,
                    reviewer,
                    status: "NOT_TESTED",
                    findings: 0,
                    notes: [
                        "No Spec Check or Outcome Check report supplied (--spec-check, --outcome-check); intent vs outcome not reviewed.",
                    ],
                };
            if (input.spec)
                notes.push(`Spec Check: ${input.spec.requirements.length} requirement(s), ${input.spec.gaps.length} open gap(s).`);
            if (input.outcome)
                notes.push(`Outcome Check: CI first-pass rate ${input.outcome.ci_first_pass_rate ?? "n/a"}, revert rate ${input.outcome.revert_rate ?? "n/a"} (delivery signal, not a product score).`);
            applicable = true;
        }
        if (lane === "impact") {
            notes.push(input.impact
                ? `Impact Check 2.0: ${input.impact.affected_modules} affected module(s), ${input.impact.high} high-severity impact(s).`
                : `Blast radius from paths only (no Impact Check report): ${changed.length} file(s), surfaces ${risk.surfaces.join(", ")}.`);
            return {
                lane,
                reviewer,
                status: changed.length === 0
                    ? "NOT_TESTED"
                    : input.impact
                        ? input.impact.high > 0
                            ? "PARTIAL"
                            : "PASS"
                        : "PARTIAL",
                findings: 0,
                notes,
            };
        }
        if (!applicable)
            return {
                lane,
                reviewer,
                status: "NOT_APPLICABLE",
                findings: 0,
                notes: ["No files in this lane's scope changed."],
            };
        notes.push(`Ran over ${lane === "experience" ? ui.length : prodFiles.length} changed file(s).`);
        const status = mine.some((f) => f.blocking) ? "FAIL" : mine.length > 0 ? "PARTIAL" : "PASS";
        return { lane, reviewer, status, findings: mine.length, notes };
    });
    // Checks, approvals, cycles, gate ---------------------------------------------------------------------------------
    let checks;
    const proof = input.proofRun;
    if (policy.required_checks.length === 0)
        checks = {
            proof_run_id: null,
            status: "NOT_TESTED",
            detail: "The policy declares no required checks; none can be claimed as green.",
        };
    else if (!proof)
        checks = {
            proof_run_id: null,
            status: "NOT_TESTED",
            detail: "No author-side proof run (product-check proof) for this change.",
        };
    else if (proof.exact_sha !== input.headSha || input.headSha === null)
        checks = {
            proof_run_id: proof.verification_id,
            status: "NOT_TESTED",
            detail: `The proof run is for ${proof.exact_sha?.slice(0, 12) ?? "an unknown commit"}, not the head ${input.headSha?.slice(0, 12) ?? "(worktree)"}.`,
        };
    else
        checks = {
            proof_run_id: proof.verification_id,
            status: proof.result === "PASS" ? "PASS" : proof.result === "FAIL" ? "FAIL" : "NOT_TESTED",
            detail: `Proof run ${proof.verification_id}: ${proof.result} (${proof.executions.filter((e) => e.status === "PASS").length}/${proof.executions.length} commands passed).`,
        };
    const tally = tallyApprovals(input.approvals, policy, {
        scopeType: "change",
        ref: input.changeRef,
        sha: input.headSha,
        excluded: input.author.id ? [input.author.id] : [],
    }, required.humans, owners);
    const cycleNo = (input.previous?.cycle.number ?? 0) + 1;
    const repeated = findings.filter((f) => f.repeat_of_review !== null).map((f) => f.id);
    const escalated = cycleNo > policy.review.max_cycles && findings.some((f) => f.blocking || f.repeat_of_review !== null);
    const blockingIds = findings.filter((f) => f.blocking).map((f) => f.id);
    const reasons = [];
    let status;
    if (blockingIds.length > 0)
        reasons.push(`${blockingIds.length} verified (or fail-closed P0) blocking finding(s).`);
    if (checks.status === "FAIL")
        reasons.push("Required checks failed.");
    if (escalated)
        reasons.push(`Review cycle ${cycleNo} exceeds the limit of ${policy.review.max_cycles}; stopped and escalated for a human design/root-cause decision.`);
    if (tally.evaluations.some((e) => e.status === "REJECTED"))
        reasons.push("A required reviewer rejected the change.");
    if (reasons.length > 0)
        status = "BLOCK";
    else if (checks.status !== "PASS") {
        status = "NOT_EVALUATED";
        reasons.push(`Mandatory checks not evidenced: ${checks.detail}`);
    }
    else {
        if (!tally.satisfied)
            reasons.push(`Approvals: ${tally.validApprovers.length}/${required.humans} valid human approval(s)${tally.stale ? `, ${tally.stale} stale` : ""}${tally.missingOwners.length ? `; domain owner(s) missing: ${tally.missingOwners.join(", ")}` : ""}.`);
        const triage = findings.filter((f) => f.verification.state === "NEEDS_HUMAN_TRIAGE");
        if (triage.length > 0)
            reasons.push(`${triage.length} reviewer finding(s) need human triage (not proven defects).`);
        status = reasons.length > 0 ? "CONDITIONAL" : "PASS";
        if (status === "PASS")
            reasons.push("Checks green, no verified blocking finding, approvals valid for the head commit.");
    }
    if (input.diffSource === "file")
        limitations.push("Diff supplied as a file: head content could not be re-read, so line rules stay EVIDENCE_COLLECTED and approvals cannot be bound to a verified commit.");
    if (files.length >= 2000)
        limitations.push("Diff truncated at 2000 files.");
    limitations.push("Deterministic lanes match patterns in changed code; they do not execute the application. Executable verification comes from proof and verify runs.");
    const diffDigest = sha256(input.diffText);
    const review = {
        schema_version: ASSURANCE_SCHEMA_VERSION,
        kind: "change-review",
        methodology_version: METHODOLOGY_VERSION,
        review_id: stableId("CR", [input.baseSha, input.headSha, diffDigest, cycleNo]),
        mode: input.mode,
        change_ref: input.changeRef,
        created_at: input.now.toISOString(),
        target: { name: input.targetName, repository: input.repositoryLabel },
        base_sha: input.baseSha,
        head_sha: input.headSha,
        author,
        diff: { source: input.diffSource, digest: diffDigest, files: changed, truncated: files.length >= 2000 },
        risk,
        approvals_required: required,
        approvals: tally.evaluations,
        lanes,
        findings,
        disproven,
        checks,
        baseline: input.baseline
            ? {
                run_id: input.baseline.results.run.run_id,
                verdict: input.baseline.results.verdict.verdict,
                results_sha256: input.baseline.sha256,
            }
            : null,
        cycle: {
            number: cycleNo,
            max: policy.review.max_cycles,
            previous_review_id: input.previous?.review_id ?? null,
            repeated_unchanged: repeated,
            new_findings: findings.filter((f) => f.repeat_of_review === null).map((f) => f.id),
            escalated,
        },
        gate: { status, reasons, blocking_finding_ids: blockingIds },
        product_vs_change: input.baseline
            ? `The whole product was last assessed as ${input.baseline.results.verdict.verdict} (run ${input.baseline.results.run.run_id}). This change gate is a separate view; a change PASS never implies product readiness.`
            : "No baseline whole-product scan was supplied. This change gate says nothing about product readiness.",
        limitations,
        evidence_ids: findings.flatMap((f) => f.evidence_ids),
        provenance: {
            tool: "product-check",
            tool_version: TOOL_VERSION,
            policy_id: input.policyDigest ? policy.policy_id : null,
            policy_digest: input.policyDigest,
        },
    };
    return review;
}
/** Reads a file from the working tree (PRE_PR_LOCAL); null when missing. */
export function worktreeText(repo) {
    const root = resolve(repo);
    return (p) => {
        const abs = resolve(join(root, p));
        if (!abs.startsWith(root + sep))
            return null;
        try {
            return existsSync(abs) ? readFileSync(abs, "utf8") : null;
        }
        catch {
            return null;
        }
    };
}
