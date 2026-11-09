// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The assurance dashboard (dashboard/index.html): one self-contained page rendered from the real JSON artifacts of
 * a workspace (results, closure register, change review, proof run, fix packets, release gate). Integrity checks
 * run first and failures are shown as a banner. No figure is invented: absent artifacts show as "not run", and a
 * gate without executed evidence shows UNKNOWN / INSUFFICIENT EVIDENCE, never green.
 * Views: Release gate, Coverage & phases, Findings, Closure, Risk & approvals, Tests & verification, Blueprint,
 * Agent export. Inline scripts are allowed only by hash (CSP); no external requests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { html } from "../reporting/escape.js";
import { PILLARS } from "../types.js";
import { checkResults } from "../validation/integrity.js";
import { verifyLog } from "./evidence-log.js";
import { checkRegister } from "./register.js";
import { mermaidViews } from "./render-md.js";
import { daysUntil } from "./util.js";
const ASSETS = new URL("../../dashboard/", import.meta.url);
const chip = (text, tone) => `<span class="chip ${tone}"><span class="dot" aria-hidden="true"></span>${html(text)}</span>`;
const TONE = {
    GO: "good",
    CONDITIONAL_GO: "warning",
    NO_GO: "critical",
    UNKNOWN: "unknown",
    PASS: "good",
    CONDITIONAL: "warning",
    BLOCK: "critical",
    NOT_EVALUATED: "unknown",
    FAIL: "critical",
    PARTIAL: "warning",
    NOT_TESTED: "unknown",
    BLOCKED: "unknown",
    NOT_APPLICABLE: "neutral",
    INCONCLUSIVE: "unknown",
    COMPLETED: "good",
    NOT_STARTED: "unknown",
    NOT_SUPPORTED: "neutral",
    CONFIRMED: "critical",
    CORROBORATED: "serious",
    REPRODUCED: "critical",
    EVIDENCE_COLLECTED: "warning",
    SUSPECTED: "unknown",
    NEEDS_HUMAN_TRIAGE: "unknown",
    DISPROVEN: "neutral",
    OPEN: "serious",
    ACKNOWLEDGED: "serious",
    IN_PROGRESS: "warning",
    FIX_PROPOSED: "warning",
    RETEST_REQUIRED: "warning",
    VERIFIED_FIXED: "good",
    CLOSED: "good",
    REJECTED_FALSE_POSITIVE: "neutral",
    ACCEPTED_RISK: "warning",
    DEFERRED: "neutral",
    REGRESSED: "critical",
    VALID: "good",
    STALE: "warning",
    ACTIVE: "warning",
    REVIEW_DUE: "serious",
    EXPIRED: "critical",
    READY: "good",
    READY_WITH_CONDITIONS: "warning",
    NOT_READY: "critical",
    LOW: "good",
    MEDIUM: "warning",
    HIGH: "critical",
    UNDETERMINED: "unknown",
    P0: "critical",
    P1: "serious",
    P2: "warning",
    P3: "neutral",
    AVAILABLE: "good",
};
const st = (s) => chip(s.replace(/_/g, " "), TONE[s] ?? "neutral");
const pct = (n) => `${Math.round(n * 100)}%`;
const LABEL = { customer: "Customer", technology: "Technology", trust: "Trust" };
const tbl = (head, rows, id) => `<div class="scroll"><table${id ? ` id="${id}"` : ""}><thead><tr>${head.map((h) => `<th>${html(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${head.length}" class="muted">None.</td></tr>`}</tbody></table></div>`;
const kpi = (label, value) => `<div class="card kpi"><div class="label">${html(label)}</div><div class="value">${html(value)}</div></div>`;
/** Agent export: fix packets with references, never evidence excerpts. */
export function agentExport(b) {
    return {
        kind: "product-check-agent-export",
        note: "Proposals only. Apply with permission; a fix is not verified until product-check verify passes at the exact fix commit; closure needs signed human approval.",
        target: b.gate.target,
        head_sha: b.gate.head_sha,
        release_decision: b.gate.decision,
        packets: b.packets.map((p) => ({
            fix_id: p.fix_id,
            finding_ids: p.finding_ids,
            severity: p.severity,
            risk_class: p.risk_class,
            title: p.title,
            locations: p.traceability.locations,
            root_cause: p.root_cause,
            proposed_change: p.proposed_change,
            constraints: p.constraints,
            tests_required: p.tests_required,
            negative_cases: p.negative_cases,
            acceptance_conditions: p.acceptance_conditions,
            scope_guard: p.scope_guard,
            rollback_plan: p.rollback_plan,
            evidence_refs: p.evidence_refs,
        })),
    };
}
/** Renders the dashboard. */
export function renderAssuranceDashboard(b, options) {
    const { results: r, register: reg, review, gate } = b;
    const css = readFileSync(new URL("dashboard.css", ASSETS), "utf8") +
        readFileSync(new URL("assurance.css", ASSETS), "utf8");
    const js = `${readFileSync(new URL("dashboard.js", ASSETS), "utf8")}\n${readFileSync(new URL("assurance.js", ASSETS), "utf8")}`;
    const hash = createHash("sha256").update(js).digest("base64");
    const problems = [
        ...checkResults(r).errors.map((e) => `results: ${e}`),
        ...(reg ? checkRegister(reg).map((e) => `closure register: ${e}`) : []),
        ...verifyLog(b.log).map((e) => `evidence log: ${e}`),
    ];
    const banners = problems.length
        ? `<div class="banner error" role="alert"><strong>Integrity check failed.</strong> These artifacts were modified or are inconsistent; figures below cannot be trusted.<ul class="small">${problems
            .slice(0, 20)
            .map((p) => `<li>${html(p)}</li>`)
            .join("")}</ul></div>`
        : "";
    const demo = r.run.demo
        ? `<div class="banner demo"><strong>DEMO DATA.</strong> Synthetic target.</div>`
        : "";
    // Release gate view ---------------------------------------------------------------------------------------------
    const insufficient = gate.decision === "UNKNOWN"
        ? `<div class="insufficient"><strong>UNKNOWN / INSUFFICIENT EVIDENCE.</strong> ${html(gate.blocking_reasons[0] ?? "")}</div>`
        : "";
    const pillars = PILLARS.map((p) => {
        const s = r.scorecard.pillars[p];
        return `<div class="card"><h3>${LABEL[p]}</h3><div class="dial-value">${s.score === null ? "Not scored" : `${s.score}/100`}</div><div class="small">Coverage ${pct(s.coverage)} · confidence ${html(s.confidence)}</div><div class="meter" aria-hidden="true"><span style="width:${Math.round(s.coverage * 100)}%"></span></div>${s.state === "INSUFFICIENT_EVIDENCE" ? chip("Insufficient evidence", "unknown") : ""}</div>`;
    }).join("");
    const exec = `<section class="view" id="gate" aria-labelledby="h-gate"><h2 id="h-gate">Release gate</h2>
<div class="hero"><div><div class="small muted">Release decision</div><div class="decision tone-${TONE[gate.decision] ?? "neutral"}">${html(gate.decision.replace(/_/g, " "))}</div><div class="small muted">Head ${html(gate.head_sha?.slice(0, 12) ?? "unknown")} · evaluated ${html(gate.evaluated_at)}</div></div>
<div><div>Baseline product verdict: ${st(gate.product_verdict)}</div><div>Current change gate: ${gate.change_gate ? st(gate.change_gate) : chip("no change review", "neutral")}</div></div></div>
${insufficient}
<ul class="reasons">${gate.blocking_reasons.map((x) => `<li>${html(x)}</li>`).join("")}</ul>
<div class="grid three">${pillars}</div>
<div class="grid kpis">${kpi("Open P0", String(gate.open.P0))}${kpi("Open P1", String(gate.open.P1))}${kpi("Open P2", String(gate.open.P2))}${kpi("Executed checks", `${gate.executed_checks.passed}/${gate.executed_checks.count} passed`)}${kpi("Valid approvals", `${gate.approvals.valid}/${gate.approvals.required}`)}${kpi("Accepted risks", String(gate.accepted_risks.length))}</div>
<h3>Release conditions</h3>${tbl(["Condition", "Status", "Detail"], gate.conditions.map((c) => `<tr><td>${html(c.id)} ${html(c.title)}</td><td>${st(c.status)}</td><td class="small">${html(c.detail)}</td></tr>`))}
<p class="bounded">${html(r.verdict.bounded_by)}</p></section>`;
    // Coverage & phases -----------------------------------------------------------------------------------------------
    const cov = `<section class="view" id="coverage" aria-labelledby="h-cov"><h2 id="h-cov">Coverage &amp; phases</h2>
<p>Lifecycle tier <strong>${html(r.run.tier)}</strong> (applied ${html(r.run.tiers_applied.join(", "))}). Execution phases VC-P0…P7 describe what was actually run and are separate from lifecycle tiers.</p>
<div class="phases">${gate.phases.map((p) => `<div class="card"><h4>${html(p.phase)} ${html(p.name)}</h4>${st(p.status)}<p class="small">${html(p.evidence.join(" "))}</p></div>`).join("")}</div>
<h3>Points of presence: inspected vs blocked</h3>${tbl(["PoP", "Category", "Status", "Relevant", "Limitations"], r.pop_coverage.pops.map((p) => `<tr><td>${html(p.name)}</td><td>${html(p.category)}</td><td>${st(p.status)}</td><td>${p.relevant ? "yes" : "no"}</td><td class="small">${html(p.limitations.join(" "))}</td></tr>`))}
<h3>Disclosed gaps</h3><ul class="small">${gate.coverage.gaps.map((g) => `<li>${html(g)}</li>`).join("") || "<li>None recorded.</li>"}</ul></section>`;
    // Findings ------------------------------------------------------------------------------------------------------
    const entries = reg?.entries ?? [];
    const opened = (e) => e.transitions[0]?.at ?? reg?.created_at ?? b.now.toISOString();
    const owner = (e) => {
        const acc = reg?.risk_acceptances.find((a) => a.acceptance_id === e.acceptance_id);
        const fix = reg?.fixes.find((f) => f.fix_id === e.fix_ids.at(-1));
        return (acc?.owner ??
            fix?.implemented_by.id ??
            e.transitions.filter((t) => t.actor.type !== "system").at(-1)?.actor.id ??
            "unassigned");
    };
    const findingRows = entries.map((e) => `<tr data-sev="${e.severity}" data-ver="${e.verification.state}" data-state="${e.state}"><td><code>${html(e.finding_id)}</code></td><td>${st(e.severity)}</td><td>${st(e.verification.state)}</td><td>${st(e.state)}</td><td>${html(e.source)}</td><td><code>${html(e.rule_or_control)}</code></td><td class="small"><code>${html(e.location)}</code></td><td>${html(owner(e))}</td><td class="num">${Math.max(0, -daysUntil(opened(e).slice(0, 10), b.now) - 1)}d</td><td>${html(e.title)}</td></tr>`);
    const opts = (key, values) => `<label>${html(key)} <select data-key="${key}"><option value="">all</option>${values.map((v) => `<option value="${html(v.toLowerCase())}">${html(v)}</option>`).join("")}</select></label>`;
    const triage = entries.filter((e) => e.verification.state === "NEEDS_HUMAN_TRIAGE" || e.verification.state === "SUSPECTED");
    const fp = new Map();
    for (const e of entries.filter((x) => x.state === "REJECTED_FALSE_POSITIVE"))
        fp.set(e.rule_or_control, (fp.get(e.rule_or_control) ?? 0) + 1);
    const findings = `<section class="view" id="findings" aria-labelledby="h-f"><h2 id="h-f">Findings</h2>
${reg ? "" : `<p class="muted">No closure register yet (product-check register). Showing nothing rather than guessing.</p>`}
<div class="filters" data-filter-table="tbl-findings">${opts("sev", ["P0", "P1", "P2", "P3"])}${opts("ver", ["CONFIRMED", "CORROBORATED", "REPRODUCED", "EVIDENCE_COLLECTED", "NEEDS_HUMAN_TRIAGE", "SUSPECTED"])}${opts("state", ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RETEST_REQUIRED", "VERIFIED_FIXED", "CLOSED", "ACCEPTED_RISK", "REGRESSED", "REJECTED_FALSE_POSITIVE"])}<label>Search <input data-key="text" type="search"></label> <span class="small muted" data-count></span></div>
${tbl(["Finding", "Sev", "Verification", "State", "Source", "Control/rule", "Where", "Owner", "Age", "Title"], findingRows, "tbl-findings")}
<h3>Awaiting corroboration (not proven defects)</h3>${tbl(["Finding", "Sev", "Title", "Checks"], triage.map((e) => `<tr><td><code>${html(e.finding_id)}</code></td><td>${st(e.severity)}</td><td>${html(e.title)}</td><td class="small">${html(e.verification.checks.map((c) => `${c.check}: ${c.result}`).join("; "))}</td></tr>`))}
<h3>False-positive trend by rule</h3>${tbl(["Rule/control", "Rejected as false positive"], [...fp.entries()].map(([k, n]) => `<tr><td><code>${html(k)}</code></td><td class="num">${n}</td></tr>`))}
${review && review.disproven.length
        ? `<h3>Disproven reviewer claims (${review.disproven.length})</h3>${tbl(["ID", "Reviewer", "Claim", "Why"], review.disproven.map((f) => `<tr><td><code>${html(f.id)}</code></td><td>${html(f.reviewer.id)} (${html(f.reviewer.type)})</td><td>${html(f.title)}</td><td class="small">${html(f.verification.checks.map((c) => c.detail).join(" "))}</td></tr>`))}`
        : ""}</section>`;
    // Closure funnel ----------------------------------------------------------------------------------------------------
    const count = (states) => entries.filter((e) => states.includes(e.state)).length;
    const steps = [
        ["Open / acknowledged", count(["OPEN", "ACKNOWLEDGED"]), ""],
        ["Remediation", count(["IN_PROGRESS", "FIX_PROPOSED"]), ""],
        ["Retest required", count(["RETEST_REQUIRED"]), ""],
        ["Verified fixed", count(["VERIFIED_FIXED"]), "done"],
        ["Closed", count(["CLOSED"]), "done"],
        ["Accepted risk", count(["ACCEPTED_RISK"]), "side"],
        ["Deferred", count(["DEFERRED"]), "side"],
        ["Regressed", count(["REGRESSED"]), "side"],
        ["Rejected (false positive)", count(["REJECTED_FALSE_POSITIVE"]), "side"],
    ];
    const max = Math.max(1, ...steps.map((s) => s[1]));
    const verifiedCycles = entries
        .filter((e) => e.state === "VERIFIED_FIXED" || e.state === "CLOSED")
        .map((e) => e.cycles + 1);
    const closure = `<section class="view" id="closure" aria-labelledby="h-c"><h2 id="h-c">Closure</h2>
<p class="small">A proposed fix is not a fix: findings move to VERIFIED_FIXED only through a passing verification at the exact fix commit, and to CLOSED only with signed human approval.</p>
<div class="funnel">${steps.map(([label, n, cls]) => `<div class="step ${cls}"><span>${html(label)}</span><div class="bar" role="img" aria-label="${html(label)}: ${n}"><span style="width:${Math.round((n / max) * 100)}%"></span></div><span class="num">${n}</span></div>`).join("")}</div>
<div class="grid kpis">${kpi("Verification runs", String(reg?.verification_runs.length ?? 0))}${kpi("Avg cycles to verified fix", verifiedCycles.length ? (verifiedCycles.reduce((a, c) => a + c, 0) / verifiedCycles.length).toFixed(1) : "—")}${kpi("Escalated", String(entries.filter((e) => e.escalated).length))}${kpi("Repeated unchanged (review)", String(review?.cycle.repeated_unchanged.length ?? 0))}${kpi("Disproven claims", String(review?.disproven.length ?? 0))}${kpi("Chain length", String(reg?.chain.length ?? 0))}</div>
<h3>Closures</h3>${tbl(["Closure", "Finding", "Actor", "At", "Verification", "Approvals"], entries
        .filter((e) => e.closure)
        .map((e) => `<tr><td><code>${html(e.closure?.closure_id ?? "")}</code></td><td><code>${html(e.finding_id)}</code></td><td>${html(e.closure?.actor.id ?? "")}</td><td>${html(e.closure?.at ?? "")}</td><td><code>${html(e.closure?.verification_id ?? "")}</code></td><td class="small">${html(e.closure?.approval_ids.join(", ") ?? "")}</td></tr>`))}</section>`;
    // Risk & approvals ------------------------------------------------------------------------------------------------
    const risk = `<section class="view" id="risk" aria-labelledby="h-r"><h2 id="h-r">Risk &amp; approvals</h2>
${review
        ? `<p>Change ${html(review.change_ref)} ${html(review.base_sha?.slice(0, 12) ?? "?")} → ${html(review.head_sha?.slice(0, 12) ?? "worktree")}: risk ${st(review.risk.level)} (treated as ${html(review.risk.effective_level)}), gate ${st(review.gate.status)}, cycle ${review.cycle.number}/${review.cycle.max}${review.cycle.escalated ? ` ${chip("escalated", "critical")}` : ""}.</p><ul class="small">${review.risk.reasons.map((x) => `<li>${html(x)}</li>`).join("")}</ul>
<p>Required: ${review.approvals_required.humans} human approval(s)${review.approvals_required.domain_owners.length ? `, domain owners ${html(review.approvals_required.domain_owners.join(", "))}` : ""}. Waiver: ${html(review.approvals_required.waiver.reason)}</p>
${tbl(["Approval", "Approver", "Status", "Reason"], review.approvals.map((a) => `<tr><td><code>${html(a.approval_id)}</code></td><td>${html(a.approver_id)}</td><td>${st(a.status)}</td><td class="small">${html(a.reason)}</td></tr>`))}
<h3>Lanes</h3>${tbl(["Lane", "Status", "Findings", "Notes"], review.lanes.map((l) => `<tr><td>${html(l.lane)}</td><td>${st(l.status)}</td><td class="num">${l.findings}</td><td class="small">${html(l.notes.join(" "))}</td></tr>`))}`
        : `<p class="muted">No change review (product-check review).</p>`}
<h3>Accepted risks and expiry</h3>${tbl(["Acceptance", "Finding", "Owner", "Scope", "Review", "Expires", "Status"], (reg?.risk_acceptances ?? []).map((a) => {
        const g = gate.accepted_risks.find((x) => x.acceptance_id === a.acceptance_id);
        return `<tr><td><code>${html(a.acceptance_id)}</code></td><td><code>${html(a.finding_id)}</code></td><td>${html(a.owner)}</td><td class="small">${html(a.scope)}</td><td>${html(a.review_date)}</td><td>${html(a.expires)}</td><td>${st(g?.status ?? "ACTIVE")}</td></tr>`;
    }))}
<h3>Signed approvals on record</h3>${tbl(["Approval", "Approver", "Scope", "Reviewed commit", "Decision", "Signed"], (reg?.approvals ?? []).map((a) => `<tr><td><code>${html(a.approval_id)}</code></td><td>${html(a.approver.id)} (${html(a.approver.type)})</td><td>${html(`${a.scope.type}:${a.scope.ref}`)}</td><td><code>${html(a.reviewed_sha.slice(0, 12))}</code></td><td>${html(a.decision)}</td><td>${a.signature ? "Ed25519" : chip("unsigned", "critical")}</td></tr>`))}</section>`;
    // Tests & verification -----------------------------------------------------------------------------------------
    const execs = [
        ...(b.proof?.executions ?? []).map((e) => ({ run: b.proof?.verification_id ?? "", e })),
        ...(reg?.verification_runs ?? []).flatMap((v) => v.executions.map((e) => ({ run: v.verification_id, e }))),
    ];
    const tests = `<section class="view" id="tests" aria-labelledby="h-t"><h2 id="h-t">Tests &amp; verification</h2>
<h3>Author-side proof</h3>${b.proof ? `<p>${st(b.proof.result)} at <code>${html(b.proof.exact_sha?.slice(0, 12) ?? "?")}</code>${b.proof.worktree_clean === false ? " (dirty worktree)" : ""}. ${html(b.proof.reasons.join(" "))}</p>` : `<p class="muted">Not run.</p>`}
<h3>Command executions</h3>${tbl(["Run", "Command", "Purpose", "Status", "Exit", "Duration", "Commit", "Environment", "Output digest"], execs.map(({ run, e }) => `<tr><td><code>${html(run)}</code></td><td><code>${html(e.argv.join(" "))}</code></td><td>${html(e.purpose)}</td><td>${st(e.status)}</td><td class="num">${e.exit_code ?? "—"}</td><td class="num">${e.duration_ms} ms</td><td><code>${html(e.commit_sha?.slice(0, 12) ?? "—")}</code></td><td><code>${html(e.environment_id)}</code></td><td class="small"><code>${html(e.stdout_digest?.slice(0, 12) ?? "—")}</code>${e.reason ? ` ${html(e.reason)}` : ""}</td></tr>`))}
<h3>Verification runs</h3>${tbl(["Run", "Findings", "Fix", "Commit", "Result", "Checks", "Reasons"], (reg?.verification_runs ?? []).map((v) => `<tr><td><code>${html(v.verification_id)}</code></td><td>${html(v.finding_ids.join(", "))}</td><td>${html(v.fix_id ?? "—")}</td><td><code>${html(v.exact_sha?.slice(0, 12) ?? "—")}</code></td><td>${st(v.result)}</td><td class="small">${v.checks.map((c) => `${html(c.check_id)} ${st(c.status)}`).join("<br>")}</td><td class="small">${html(v.reasons.join(" "))}</td></tr>`))}
<h3>Regression corpus (incident-derived)</h3>${tbl(["Case", "Finding", "Origin", "Command", "Added"], (reg?.regression_corpus ?? []).map((c) => `<tr><td><code>${html(c.case_id)}</code></td><td><code>${html(c.finding_id)}</code></td><td>${html(c.origin)}</td><td><code>${html(c.command.argv.join(" "))}</code></td><td>${html(c.added_at)} by ${html(c.added_by.id)}</td></tr>`))}
<h3>Merge &amp; rollout watch</h3><p>${chip("NOT SUPPORTED", "neutral")} Product Check does not simulate merge queues, run canaries or read live telemetry. Rollback plan: ${gate.rollback.declared ? html(gate.rollback.ref ?? "") : chip("not declared", "warning")}.</p></section>`;
    // Blueprint ---------------------------------------------------------------------------------------------------------
    const v = mermaidViews(r, b.packets, reg);
    const bp = `<section class="view" id="blueprint" aria-labelledby="h-b"><h2 id="h-b">Blueprint</h2>
<p class="small">Mermaid sources (paste into any Mermaid viewer; this page loads nothing external). Inferred components are labelled.</p>
<h3>As-is architecture and gaps</h3><button class="copy" type="button" data-copy="mm-asis" hidden>Copy</button><pre id="mm-asis">${html(v.asIs)}</pre>
<h3>To-be architecture</h3><button class="copy" type="button" data-copy="mm-tobe" hidden>Copy</button><pre id="mm-tobe">${html(v.toBe)}</pre>
<h3>Improvement backlog (fix packets)</h3>${tbl(["Packet", "Sev", "Risk", "Status", "Where", "Proposed change", "Acceptance"], b.packets.map((p) => `<tr><td><code>${html(p.fix_id)}</code></td><td>${st(p.severity)}</td><td>${st(p.risk_class)}</td><td>${html(p.status)}</td><td class="small">${p.traceability.locations.map((l) => `<code>${html(l)}</code>`).join(" ")}</td><td class="small">${html(p.proposed_change)}</td><td class="small">${html(p.acceptance_conditions.slice(0, 3).join(" · "))}</td></tr>`))}</section>`;
    const exportJson = JSON.stringify(agentExport(b), null, 2);
    const exp = `<section class="view" id="export" aria-labelledby="h-x"><h2 id="h-x">Agent export</h2>
<p class="small">Fix packets for an engineering agent (for example CrewPE as an optional executor). Evidence is referenced by ID; excerpts, command output and credentials are not included.</p>
<button class="copy" type="button" data-copy="agent-export" hidden>Copy JSON</button><pre class="export" id="agent-export">${html(exportJson)}</pre></section>`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; img-src data:">
<title>Product Check assurance: ${html(r.contract.target.name)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
<header class="top"><div><h1>Product Check assurance: ${html(r.contract.target.name)}</h1><div class="meta">Release gate ${html(gate.gate_id)} · scan ${html(r.run.run_id)} · CT3 v3.2</div></div><button class="theme-toggle" type="button" hidden>Theme: auto</button></header>
${banners}${demo}
<nav class="tabs" aria-label="Dashboard views"><a href="#gate" aria-current="page">Release gate</a><a href="#coverage">Coverage &amp; phases</a><a href="#findings">Findings</a><a href="#closure">Closure</a><a href="#risk">Risk &amp; approvals</a><a href="#tests">Tests &amp; verification</a><a href="#blueprint">Blueprint</a><a href="#export">Agent export</a></nav>
<main>
${exec}
${cov}
${findings}
${closure}
${risk}
${tests}
${bp}
${exp}
</main>
<footer>Generated from the workspace JSON (product-check-results.json, closure-register.json, change review, proof run, fix-packets/, release-gate.json and review-evidence.jsonl); every figure is derived from those files. Evidence-bounded assurance, not a penetration test, certification or guarantee.${options.branding ? " Product Check is an EnWithAI Engineering Commons tool." : ""}</footer>
</div>
<script>${js}</script>
</body>
</html>
`;
}
