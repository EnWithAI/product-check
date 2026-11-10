// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Markdown renderings of the assurance artifacts: PRODUCT_CHECK_REVIEW.md, PRODUCT_CHECK_BLUEPRINT.md (as-is/to-be
 * Mermaid diagrams, gaps, ordered work packets, tests, gates), PRODUCT_CHECK_RELEASE_GATE.md and human review
 * packets for escalated findings. Every figure comes from the JSON artifacts; untrusted text is escaped.
 */
import { code, md } from "../reporting/escape.js";
import { BRANDING } from "../reporting/markdown.js";
/** Appends the Engineering Commons footer used by every Product Check rendering (omitted with --no-branding). */
export const withFooter = (text, branding) => branding ? `${text.trimEnd()}\n\n<sub>${BRANDING}</sub>\n` : `${text.trimEnd()}\n`;
const row = (cells) => `| ${cells.join(" | ")} |`;
const table = (head, rows) => rows.length === 0
    ? "_None._\n"
    : [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n") + "\n";
const header = (title, sub) => `# ${title}\n\n${sub}\n`;
const note = "_Evidence-bounded: untested areas are unknown, not passed. Not a penetration test, certification or guarantee._\n";
/** PRODUCT_CHECK_REVIEW.md */
export function renderReviewMd(review, reg, results) {
    const out = [
        header("Product Check review", `Target ${md(results.contract.target.name)} · methodology CT3 v3.2 · ${note}`),
    ];
    out.push("## Whole product (baseline)\n");
    const s = results.scorecard.pillars;
    out.push(table(["Pillar", "Score", "Coverage", "Confidence"], ["customer", "technology", "trust"].map((p) => [
        p,
        s[p].score === null ? "not scored" : String(s[p].score),
        `${Math.round(s[p].coverage * 100)}%`,
        s[p].confidence,
    ])));
    out.push(`Verdict **${results.verdict.verdict}** at ${results.verdict.tier} (run ${code(results.run.run_id)}). ${md(results.verdict.bounded_by)}\n`);
    if (review) {
        out.push(`## Change review ${code(review.review_id)} (${review.mode})\n`);
        out.push(`Base ${code(review.base_sha?.slice(0, 12) ?? "?")} → head ${code(review.head_sha?.slice(0, 12) ?? "worktree")} · author ${code(review.author.id ?? "unknown")}${review.author.trusted ? " (trusted)" : ""} · cycle ${review.cycle.number}/${review.cycle.max}${review.cycle.escalated ? " · **ESCALATED**" : ""}\n`);
        out.push(`**Gate: ${review.gate.status}.** ${review.gate.reasons.map((r) => md(r)).join(" ")}\n`);
        out.push(`**Risk: ${review.risk.level}** (treated as ${review.risk.effective_level}). ${review.risk.reasons.map((r) => md(r)).join(" ")}\n`);
        out.push(`Approvals required: ${review.approvals_required.humans} human(s)${review.approvals_required.domain_owners.length ? `, domain owners ${review.approvals_required.domain_owners.map((o) => code(o)).join(", ")}` : ""}. Waiver: ${md(review.approvals_required.waiver.reason)}\n`);
        out.push(table(["Approval", "Approver", "Status", "Reason"], review.approvals.map((a) => [code(a.approval_id), code(a.approver_id), a.status, md(a.reason)])));
        out.push(`Checks: **${review.checks.status}** — ${md(review.checks.detail)}\n`);
        out.push("### Lanes\n");
        out.push(table(["Lane", "Status", "Findings", "Notes"], review.lanes.map((l) => [l.lane, l.status, String(l.findings), md(l.notes.join(" "))])));
        out.push("### Findings\n");
        out.push(table(["ID", "Sev", "Verification", "Blocking", "Rule", "Where", "Title"], review.findings.map((f) => [
            code(f.id),
            f.severity,
            f.verification.state,
            f.blocking ? "yes" : "no",
            code(f.rule_id),
            code(`${f.location.path}${f.location.line !== null ? `:${f.location.line}` : ""}`),
            md(f.title),
        ])));
        if (review.disproven.length > 0) {
            out.push("### Disproven (not reported as defects)\n");
            out.push(table(["ID", "Reviewer", "Claim", "Why"], review.disproven.map((f) => [
                code(f.id),
                code(f.reviewer.id),
                md(f.title),
                md(f.verification.checks.map((c) => c.detail).join(" ")),
            ])));
        }
        out.push(`${md(review.product_vs_change)}\n`);
        out.push(`Limitations: ${review.limitations.map((l) => md(l)).join(" ")}\n`);
    }
    else
        out.push("## Change review\n\n_No change review was run (product-check review)._\n");
    if (reg) {
        out.push("## Closure register\n");
        out.push(registerTable(reg.entries));
    }
    return out.join("\n");
}
function registerTable(entries) {
    return table(["Finding", "Sev", "State", "Verification", "Cycles", "Control/rule", "Where", "Title"], entries.map((e) => [
        code(e.finding_id),
        e.severity,
        `${e.state}${e.escalated ? " (escalated)" : ""}`,
        e.verification.state,
        String(e.cycles),
        code(e.rule_or_control),
        code(e.location),
        md(e.title),
    ]));
}
const mid = (s) => s.replace(/[^A-Za-z0-9_]/g, "_");
const mlabel = (s) => s
    .replace(/["<>`]/g, "'")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 60);
/** As-is and to-be Mermaid diagrams. */
export function mermaidViews(results, packets, reg) {
    const comps = results.blueprint.as_is.components;
    const cats = [...new Set(comps.map((c) => c.category))].sort();
    const lines = (withFixes) => {
        const l = ["flowchart LR"];
        for (const cat of cats) {
            l.push(`  subgraph ${mid(`cat_${cat}`)}["${mlabel(cat)}"]`);
            for (const c of comps.filter((x) => x.category === cat))
                l.push(`    ${mid(c.id)}["${mlabel(c.name)}${c.certainty === "inferred" ? " (inferred)" : ""}"]`);
            l.push("  end");
        }
        const active = (reg?.entries ?? []).filter((e) => (e.severity === "P0" || e.severity === "P1") && e.state !== "REJECTED_FALSE_POSITIVE");
        for (const e of active.slice(0, 25)) {
            const target = comps.find((c) => e.location.includes(c.name) || c.name.includes(e.location.split(":")[0] ?? "\u0000"));
            const fixed = e.state === "VERIFIED_FIXED" || e.state === "CLOSED";
            if (!withFixes) {
                l.push(`  ${mid(`gap_${e.finding_id}`)}{{"${e.finding_id} ${e.severity}: ${mlabel(e.title)}"}}`);
                l.push(`  class ${mid(`gap_${e.finding_id}`)} gap`);
                if (target)
                    l.push(`  ${mid(`gap_${e.finding_id}`)} -.-> ${mid(target.id)}`);
            }
            else {
                const p = packets.find((x) => x.finding_ids.includes(e.finding_id));
                const node = mid(`fix_${e.finding_id}`);
                l.push(`  ${node}["${fixed ? "verified: " : "planned: "}${mlabel(p?.proposed_change ?? e.title)}"]`);
                l.push(`  class ${node} ${fixed ? "done" : "todo"}`);
                if (target)
                    l.push(`  ${node} --> ${mid(target.id)}`);
            }
        }
        if (withFixes)
            for (const ch of results.blueprint.to_be.changes.slice(0, 10))
                l.push(`  ${mid(ch.id)}(["${mlabel(ch.statement)}"])`);
        l.push("  classDef gap fill:#fde6e6,stroke:#d03b3b", "  classDef todo fill:#fff4d6,stroke:#b07d00", "  classDef done fill:#e3f6e3,stroke:#0c7a0c");
        return l;
    };
    return { asIs: lines(false).join("\n"), toBe: lines(true).join("\n") };
}
/** PRODUCT_CHECK_BLUEPRINT.md */
export function renderBlueprintMd(results, packets, reg, gate) {
    const v = mermaidViews(results, packets, reg);
    const out = [
        header("Product Check blueprint", `Target ${md(results.contract.target.name)} · scan ${code(results.run.run_id)} · ${note}`),
    ];
    out.push("Blueprint = as-is architecture + gaps + to-be architecture + ordered work packets + tests + release gates. Components marked (inferred) and anything in the uncertainty list are not certain.\n");
    out.push("## As-is architecture and gaps\n", "```mermaid", v.asIs, "```\n");
    out.push("Uncertainties:\n", ...results.blueprint.as_is.uncertainties.map((u) => `- ${md(u)}`), "");
    out.push("## To-be architecture\n", "```mermaid", v.toBe, "```\n");
    out.push(...results.blueprint.to_be.changes.map((c) => `- **${md(c.statement)}** — ${md(c.rationale)}`), "");
    out.push("## Ordered work packets\n");
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const sorted = [...packets].sort((a, b) => order[a.severity] - order[b.severity] || (a.fix_id < b.fix_id ? -1 : 1));
    out.push(table(["#", "Packet", "Sev", "Risk", "Status", "Proposed change"], sorted.map((p, i) => [
        String(i + 1),
        code(p.fix_id),
        p.severity,
        p.risk_class,
        p.status,
        md(p.proposed_change, 240),
    ])));
    for (const p of sorted) {
        out.push(`### ${code(p.fix_id)} ${md(p.title)}\n`);
        out.push(`- Findings: ${p.finding_ids.map((x) => code(x)).join(", ")} (source ${p.source_finding_ids.map((x) => code(x)).join(", ")})`);
        out.push(`- Where: ${p.traceability.locations.map((x) => code(x)).join(", ") || "—"}`);
        out.push(`- Root cause (${p.root_cause.certainty}, ${p.root_cause.confidence}): ${md(p.root_cause.hypothesis)}`);
        out.push(`- User impact: ${md(p.user_impact)}`);
        out.push(`- Tests: ${p.tests_required.map((t) => `${t.kind} ${code(t.id)}${t.argv ? ` → ${code(t.argv.join(" "))}` : " (command to be declared)"}`).join("; ")}`);
        out.push(`- Negative cases: ${p.negative_cases.map((x) => md(x)).join(" ") || "—"}`);
        out.push(`- Acceptance: ${p.acceptance_conditions.map((x) => md(x)).join(" ")}`);
        out.push(`- Rollback: ${md(p.rollback_plan)}`);
        out.push(`- Scope guard: ${p.scope_guard.allowed_paths.map((x) => code(x)).join(", ")}\n`);
    }
    out.push("## Test strategy\n");
    out.push(table(["Layer", "Current", "Target"], results.blueprint.test_architecture.layers.map((l) => [md(l.layer), l.current, md(l.target)])));
    if (gate) {
        out.push("## Release gates\n");
        out.push(`Decision **${gate.decision}**.\n`);
        out.push(table(["Condition", "Status", "Detail"], gate.conditions.map((c) => [`${c.id} ${md(c.title)}`, c.status, md(c.detail)])));
    }
    return out.join("\n");
}
/** PRODUCT_CHECK_RELEASE_GATE.md */
export function renderGateMd(gate) {
    const out = [
        header(`Release gate: ${gate.decision}`, `Target ${md(gate.target.name)} · head ${code(gate.head_sha?.slice(0, 12) ?? "unknown")} · evaluated ${gate.evaluated_at} · ${note}`),
    ];
    out.push(`Product verdict ${gate.product_verdict} · change gate ${gate.change_gate ?? "no change review"} · open P0 ${gate.open.P0}, P1 ${gate.open.P1}, P2 ${gate.open.P2}, P3 ${gate.open.P3}\n`);
    out.push("## Why\n", ...gate.blocking_reasons.map((r) => `- ${md(r)}`), "");
    out.push("## Release conditions\n");
    out.push(table(["Condition", "Status", "Detail"], gate.conditions.map((c) => [`${c.id} ${md(c.title)}`, c.status, md(c.detail)])));
    out.push("## Executed checks\n");
    out.push(`${gate.executed_checks.count} command execution(s): ${gate.executed_checks.passed} passed, ${gate.executed_checks.failed} failed, ${gate.executed_checks.not_run} not run.\n`);
    out.push("## Accepted risks\n");
    out.push(table(["Acceptance", "Finding", "Expires", "Status"], gate.accepted_risks.map((a) => [code(a.acceptance_id), code(a.finding_id), a.expires, a.status])));
    out.push("## Coverage gaps (disclosed, not passed)\n");
    out.push(...(gate.coverage.gaps.length ? gate.coverage.gaps.map((g) => `- ${md(g)}`) : ["_None recorded._"]), "");
    out.push("## Execution phases (VC-P0…P7; separate from CT-T0…T6 lifecycle tiers)\n");
    out.push(table(["Phase", "Name", "Status", "Evidence"], gate.phases.map((p) => [p.phase, md(p.name), p.status, md(p.evidence.join(" "))])));
    return out.join("\n");
}
/** Human review packet for an escalated finding (cycle limit reached). */
export function renderHumanPacket(e, reg) {
    const runs = reg.verification_runs.filter((r) => e.verification_ids.includes(r.verification_id));
    return [
        header(`Human review needed: ${e.finding_id}`, `${md(e.title)} (${e.severity}, ${code(e.rule_or_control)} at ${code(e.location)})`),
        `Autonomous fix attempts stopped after ${e.cycles} failed verification cycle(s) (limit ${reg.settings.max_cycles}). A person must decide the root cause or design change, then sign \`approve --scope continue:${e.finding_id}\` before another fix attempt, or accept the risk with an owner and expiry.\n`,
        "## Verification history\n",
        table(["Run", "Result", "Commit", "Reasons"], runs.map((r) => [
            code(r.verification_id),
            r.result,
            code(r.exact_sha?.slice(0, 12) ?? "?"),
            md(r.reasons.join(" "), 600),
        ])),
        "## Transitions\n",
        table(["#", "From", "To", "Actor", "Reason"], e.transitions.map((t) => [
            String(t.seq),
            t.from ?? "—",
            t.to,
            `${code(t.actor.id)} (${t.actor.type})`,
            md(t.reason, 300),
        ])),
    ].join("\n");
}
