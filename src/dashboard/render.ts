// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Renders the local dashboard: one self-contained HTML file generated entirely from a results document. Every
 * number is read from (or recomputed from) the JSON; the integrity check runs first and a failure is shown as a
 * banner. Views: Executive Readiness, Scan Explorer, Validation Workbench, Blueprint & Remediation, Assurance
 * History. A small inline script (allowed by a hash-based CSP) adds tabs, filters and a theme toggle; without it
 * every view is still readable. No external requests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pillar, Results, RunSummary, Validation, ValidationStatus } from "../types.js";
import { PILLARS } from "../types.js";
import { CONTROL_BY_ID } from "../validation/catalog.js";
import { checkResults } from "../validation/integrity.js";
import { TIER_INFO } from "../validation/tiers.js";
import { html } from "../reporting/escape.js";

const ASSETS = new URL("../../dashboard/", import.meta.url);
const LABEL: Record<Pillar, string> = { customer: "Customer", technology: "Technology", trust: "Trust" };
const QUESTION: Record<Pillar, string> = {
  customer: "Can intended users understand it, use it and get value?",
  technology: "Is it built, tested and operated soundly?",
  trust: "Can users and operators trust it with their data and actions?",
};
const pct = (n: number): string => `${Math.round(n * 100)}%`;

type Tone = "good" | "warning" | "serious" | "critical" | "unknown" | "neutral";

/** A status chip: color is never the only signal (dot + text). */
function chip(text: string, tone: Tone): string {
  return `<span class="chip ${tone}"><span class="dot" aria-hidden="true"></span>${html(text)}</span>`;
}

const VERDICT_TONE: Record<string, Tone> = {
  READY: "good",
  READY_WITH_CONDITIONS: "warning",
  NOT_READY: "critical",
  INCONCLUSIVE: "unknown",
};
const STATUS_TONE: Record<string, Tone> = {
  PASS: "good",
  PARTIAL: "warning",
  FAIL: "critical",
  BLOCKED: "unknown",
  NOT_TESTED: "unknown",
  NOT_APPLICABLE: "neutral",
  AVAILABLE: "good",
  UNVERIFIED: "unknown",
  VERIFIED: "good",
  PROPOSED: "neutral",
  FAILED_VERIFICATION: "critical",
};
const SEV_TONE: Record<string, Tone> = { P0: "critical", P1: "serious", P2: "warning", P3: "neutral" };

/** Semicircular dial for one pillar; an unscored pillar shows a hatched track and "Not scored". */
function dial(r: Results, p: Pillar): string {
  const s = r.scorecard.pillars[p];
  const cx = 110;
  const cy = 108;
  const rad = 86;
  const point = (fraction: number): [number, number] => {
    const angle = Math.PI - Math.PI * fraction;
    return [cx + rad * Math.cos(angle), cy - rad * Math.sin(angle)];
  };
  const arc = (fraction: number): string => {
    const [x, y] = point(fraction);
    return `M ${cx - rad} ${cy} A ${rad} ${rad} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  const threshold = r.scorecard.parameters.pillar_threshold / 100;
  const [tx, ty] = point(threshold);
  const [ix, iy] = [cx + (tx - cx) * 0.82, cy + (ty - cy) * 0.82];
  const scored = s.score !== null;
  const label = scored
    ? `${LABEL[p]} score ${s.score} of 100`
    : `${LABEL[p]} not scored: insufficient evidence`;
  const svg = `<svg viewBox="0 0 220 128" role="img" aria-label="${html(label)}">
<path class="track${scored ? "" : " unknown"}" d="${arc(1)}" stroke-width="14"/>
${scored ? `<path class="fill" d="${arc((s.score ?? 0) / 100)}" stroke="var(--s-${p})" stroke-width="14"/>` : ""}
<line class="tick" x1="${ix.toFixed(2)}" y1="${iy.toFixed(2)}" x2="${tx.toFixed(2)}" y2="${ty.toFixed(2)}"><title>Readiness threshold ${r.scorecard.parameters.pillar_threshold}</title></line>
<text class="dial-value" x="${cx}" y="${cy - 14}" text-anchor="middle">${scored ? String(s.score) : "—"}</text>
<text class="dial-caption" x="${cx}" y="${cy + 12}" text-anchor="middle">${scored ? "of 100" : "not scored"}</text>
</svg>`;
  const trend =
    s.trend && s.trend.delta !== null ? ` · trend ${s.trend.delta >= 0 ? "+" : ""}${s.trend.delta}` : "";
  return `<div class="card dial">
<div class="name"><span class="swatch" style="background:var(--s-${p})" aria-hidden="true"></span>${LABEL[p]}</div>
<div class="sub">${html(QUESTION[p])}</div>
${svg}
<div>${scored ? chip(s.score !== null && s.score >= r.scorecard.parameters.pillar_threshold ? "At or above threshold" : "Below threshold", s.score !== null && s.score >= r.scorecard.parameters.pillar_threshold ? "good" : "warning") : chip("Insufficient evidence", "unknown")}${s.cap.applied ? ` ${chip(`Capped at ${s.cap.limit ?? ""}: ${s.cap.reason ?? ""}`, "critical")}` : ""}</div>
<div class="sub" style="margin-top:8px">Coverage ${pct(s.coverage)} · Confidence ${html(s.confidence)}${trend}</div>
<div class="meter" role="img" aria-label="Coverage ${pct(s.coverage)}"><span style="width:${(s.coverage * 100).toFixed(1)}%"></span></div>
<div class="sub small">${s.counts.PASS} pass · ${s.counts.PARTIAL} partial · ${s.counts.FAIL} fail · ${s.counts.BLOCKED + s.counts.NOT_TESTED} unchecked</div>
</div>`;
}

/** Horizontal stacked bar of validation statuses for one pillar (unchecked statuses are hatched). */
function statusStack(r: Results, p: Pillar): string {
  const c = r.scorecard.pillars[p].counts;
  const order: ValidationStatus[] = ["PASS", "PARTIAL", "FAIL", "BLOCKED", "NOT_TESTED"];
  const total = order.reduce((n, k) => n + c[k], 0);
  if (total === 0) return `<div class="muted small">No applicable controls.</div>`;
  const segs = order
    .filter((k) => c[k] > 0)
    .map(
      (k) =>
        `<span class="seg-${k}" style="flex:${c[k]}" title="${LABEL[p]}: ${c[k]} ${k.replace("_", " ").toLowerCase()}"></span>`
    )
    .join("");
  return `<div class="stack" role="img" aria-label="${html(`${LABEL[p]}: ${order.map((k) => `${c[k]} ${k}`).join(", ")}`)}">${segs}</div>`;
}

/** Score-trend line chart over runs (one series per pillar; gaps where a pillar was not scored). */
function trendChart(history: RunSummary[]): string {
  const runs = history.slice(-12);
  if (runs.length < 2)
    return `<p class="muted">One run so far. Run <code>product-check retest --baseline &lt;results&gt;</code> after changes to see trends.</p>`;
  const w = 640;
  const h = 240;
  const left = 36;
  const right = 110;
  const top = 12;
  const bottom = 28;
  const x = (i: number): number => left + (i * (w - left - right)) / (runs.length - 1);
  const y = (v: number): number => top + (1 - v / 100) * (h - top - bottom);
  const grid = [0, 25, 50, 75, 100]
    .map(
      (v) =>
        `<line class="gridline" x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`
    )
    .join("");
  const xs = runs
    .map(
      (run, i) =>
        `<text class="axis-label" x="${x(i)}" y="${h - 8}" text-anchor="middle">run ${history.length - runs.length + i + 1}</text>`
    )
    .join("");
  const labels: { p: Pillar; x: number; y: number; text: string }[] = [];
  const series = PILLARS.map((p) => {
    const segments: string[] = [];
    let current: string[] = [];
    runs.forEach((run, i) => {
      const v = run.scores[p];
      if (v === null) {
        if (current.length > 1) segments.push(current.join(" "));
        current = [];
      } else current.push(`${current.length === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
    });
    if (current.length > 0) segments.push(current.join(" "));
    const dots = runs
      .map((run, i) =>
        run.scores[p] === null
          ? ""
          : `<circle cx="${x(i).toFixed(1)}" cy="${y(run.scores[p] ?? 0).toFixed(1)}" r="4" fill="var(--s-${p})" stroke="var(--surface)" stroke-width="2"><title>${LABEL[p]} ${run.scores[p] ?? ""} (${html(run.run_id)})</title></circle>`
      )
      .join("");
    let lastIdx = -1;
    runs.forEach((run, i) => {
      if (run.scores[p] !== null) lastIdx = i;
    });
    const last = lastIdx >= 0 ? (runs[lastIdx]?.scores[p] ?? null) : null;
    if (last !== null) labels.push({ p, x: x(lastIdx) + 8, y: y(last) + 4, text: `${LABEL[p]} ${last}` });
    return segments.map((d) => `<path class="series" d="${d}" stroke="var(--s-${p})"/>`).join("") + dots;
  }).join("");
  // De-overlap end labels vertically (13px minimum spacing), keeping their order.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1] as (typeof labels)[number];
    const cur = labels[i] as (typeof labels)[number];
    if (cur.y - prev.y < 13) cur.y = prev.y + 13;
  }
  const endLabels = labels
    .map((l) => `<text class="end-label" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}">${l.text}</text>`)
    .join("");
  return `<div class="chart card"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Pillar scores across runs">${grid}${xs}${series}${endLabels}</svg>
<div class="legend">${PILLARS.map((p) => `<span><i style="background:var(--s-${p})"></i>${LABEL[p]}</span>`).join("")}<span class="muted">Gaps: pillar not scored in that run.</span></div></div>`;
}

/** Evidence details for a list of IDs. */
function evidenceList(r: Results, ids: string[]): string {
  if (ids.length === 0) return `<span class="muted">No evidence.</span>`;
  const byId = new Map(r.evidence.map((e) => [e.id, e]));
  return `<details><summary>${ids.length} evidence item(s)</summary><ul class="small">${ids
    .map((id) => {
      const e = byId.get(id);
      if (!e) return `<li><code>${html(id)}</code> (missing)</li>`;
      return `<li><code>${html(e.id)}</code> ${html(e.kind)} · ${html(e.strength)} · <code>${html(e.source.locator)}${e.source.line_start ? `:${e.source.line_start}` : ""}</code><br>${html(e.summary)}${e.excerpt ? `<br><code>${html(e.excerpt)}</code>` : ""}${e.checksum ? `<br><span class="muted">sha256 ${html(e.checksum.value.slice(0, 16))}…${e.run_id !== r.run.run_id ? ` · preserved from ${html(e.run_id)}` : ""}</span>` : ""}</li>`;
    })
    .join("")}</ul></details>`;
}

/** Validation table row. */
function validationRow(r: Results, v: Validation): string {
  return `<tr data-pillar="${v.pillar}" data-status="${v.status}">
<td><code>${html(v.control_id)}</code>${v.hard_gate ? `<br>${chip(v.hard_gate, "neutral")}` : ""}</td>
<td>${html(v.title)}<br><span class="muted small">${html(v.tier)} · ${LABEL[v.pillar]} · weight ${v.weight}</span></td>
<td>${chip(v.status.replace("_", " "), STATUS_TONE[v.status] ?? "neutral")}${v.strength ? `<br><span class="small muted">${html(v.strength)}</span>` : ""}</td>
<td class="small"><strong>Expected:</strong> ${html(v.expected)}<br><strong>${v.reason ? "Reason" : "Actual"}:</strong> ${html(v.reason ?? v.actual)}${v.reproduction.length ? `<br><strong>Reproduce:</strong> ${v.reproduction.map((x) => `<code>${html(x)}</code>`).join(" ")}` : ""}</td>
<td class="small">${evidenceList(r, v.evidence_ids)}</td>
</tr>`;
}

/** Renders the dashboard HTML. */
export function renderDashboard(r: Results, options: { branding: boolean }): string {
  const integrity = checkResults(r);
  const css = readFileSync(new URL("dashboard.css", ASSETS), "utf8");
  const js = readFileSync(new URL("dashboard.js", ASSETS), "utf8");
  const scriptHash = createHash("sha256").update(js).digest("base64");
  const v = r.verdict;
  const o = r.scorecard.open_findings;
  const open = r.findings.filter((f) => f.status === "OPEN" || f.status === "UNVERIFIED");
  const banners = [
    r.run.demo
      ? `<div class="banner demo" role="note"><strong>Demo data.</strong> This dashboard shows an assessment of a synthetic example application. The figures are real outputs of Product Check on that example, not of any real product.</div>`
      : "",
    integrity.errors.length > 0
      ? `<div class="banner error" role="alert"><strong>Integrity check failed.</strong> These figures do not match the evidence in the results file and must not be trusted:<ul>${integrity.errors
          .slice(0, 8)
          .map((e) => `<li>${html(e)}</li>`)
          .join("")}</ul></div>`
      : "",
    r.run.status !== "COMPLETED"
      ? `<div class="banner error" role="note"><strong>Run ${html(r.run.status)}.</strong> ${
          r.run.errors
            .slice(0, 5)
            .map((e) => html(e))
            .join(" · ") || "Some points of presence could not be inspected."
        }</div>`
      : "",
  ].join("");

  const exec = `<section class="view" id="readiness" aria-labelledby="h-readiness"><h2 id="h-readiness">Executive readiness</h2>
<div class="card"><div class="hero"><div><div class="verdict">${html(v.verdict.replace(/_/g, " "))}</div><div class="alias">${html(v.tier)} ${html(TIER_INFO[v.tier].name)} · "${html(v.tier_alias)}"</div></div>${chip(v.verdict === "INCONCLUSIVE" ? "Evidence insufficient" : v.verdict === "READY" ? "Evidence supports readiness" : v.verdict === "NOT_READY" ? "Blocking issues substantiated" : "Ready with conditions", VERDICT_TONE[v.verdict] ?? "neutral")}</div>
<ul class="reasons">${v.reasons.map((x) => `<li>${html(x)}</li>`).join("")}</ul><div class="bounded">${html(v.bounded_by)}</div></div>
<h3>Customer × Technology × Trust</h3><p class="muted small">Three independent pillars, never averaged. The black tick marks the readiness threshold (${r.scorecard.parameters.pillar_threshold}). A hatched dial means the pillar could not be scored; that is unknown, not passed.</p>
<div class="grid three">${PILLARS.map((p) => dial(r, p)).join("")}</div>
<h3>Key figures</h3><div class="grid kpis">${[
    ["Open P0", o.P0],
    ["Open P1", o.P1],
    ["Open P2", o.P2],
    ["Open P3", o.P3],
    ["Accepted risks", r.scorecard.accepted_risks],
    ["Overall coverage", pct(r.scorecard.overall_coverage)],
  ]
    .map(
      ([k, val]) =>
        `<div class="card kpi"><div class="label">${html(String(k))}</div><div class="value">${html(String(val))}</div></div>`
    )
    .join("")}</div>
<h3>Hard gates</h3><div class="scroll"><table><thead><tr><th>Gate</th><th>Status</th><th>Controls</th></tr></thead><tbody>${r.scorecard.gates
    .map(
      (g) =>
        `<tr><td>${html(g.gate_id)}: ${html(g.title)}</td><td>${chip(g.status.replace("_", " "), STATUS_TONE[g.status] ?? (g.status === "FAIL" ? "critical" : "neutral"))}</td><td><code>${html(g.control_ids.join(", "))}</code></td></tr>`
    )
    .join("")}</tbody></table></div>
<h3>Top open findings</h3>${
    open.length === 0
      ? `<p class="muted">No open findings in the checked controls.</p>`
      : `<div class="scroll"><table><thead><tr><th>Severity</th><th>Finding</th><th>Pillar</th><th>Location</th></tr></thead><tbody>${open
          .slice(0, 8)
          .map(
            (f) =>
              `<tr><td>${chip(f.severity, SEV_TONE[f.severity] ?? "neutral")}</td><td>${html(f.title)}<br><span class="muted small">${html(f.epistemic)}, ${html(f.confidence.toLowerCase())} confidence</span></td><td>${LABEL[f.pillar]}</td><td><code>${html(f.location)}</code></td></tr>`
          )
          .join("")}</tbody></table></div>`
  }
</section>`;

  const scan = `<section class="view" id="scan" aria-labelledby="h-scan"><h2 id="h-scan">Scan explorer</h2>
<div class="grid kpis">${(["available", "partial", "blocked", "not_applicable"] as const).map((k) => `<div class="card kpi"><div class="label">PoPs ${k.replace("_", " ")}</div><div class="value">${r.pop_coverage.summary[k]}</div></div>`).join("")}</div>
<h3>Points of presence</h3><div class="scroll"><table><thead><tr><th>Point of presence</th><th>Status</th><th>Authorization</th><th>Scope</th><th>Observed</th><th>Limitations</th><th class="num">Evidence</th></tr></thead><tbody>${r.pop_coverage.pops
    .map(
      (p) =>
        `<tr><td>${html(p.name)}<br><span class="muted small">${html(p.category)}</span></td><td>${chip(p.status.replace("_", " "), p.status === "PARTIAL" ? "warning" : (STATUS_TONE[p.status] ?? "neutral"))}</td><td class="small">${html(p.authorization)} · ${html(p.access)}</td><td class="small">${html(p.scope ?? "—")}</td><td class="small">${html(p.observed_at ?? "—")}</td><td class="small">${p.limitations.map((l) => html(l)).join("<br>") || "—"}</td><td class="num">${p.evidence_ids.length}</td></tr>`
    )
    .join("")}</tbody></table></div>
<h3>Run</h3><div class="card small"><div>Run <code>${html(r.run.run_id)}</code> · ${html(r.run.status)} · ${html(r.run.started_at)} · ${r.run.duration_ms} ms</div>
<div>Mode ${html(r.run.mode_effective ?? "none")} (requested ${html(r.run.mode_requested)}) · tier ${html(r.run.tier)} · tiers applied ${html(r.run.tiers_applied.join(", "))}</div>
<div>Repository: ${r.run.target_revision.repository ? `${html(r.run.target_revision.repository.label)} @ <code>${html(r.run.target_revision.repository.commit ?? "unknown")}</code>` : "not inspected"} · Application: ${r.run.target_revision.application ? `${html(r.run.target_revision.application.origin)} (status ${html(String(r.run.target_revision.application.final_status ?? "none"))})` : "not inspected"}</div>
<div>Network: ${r.run.network.used ? `${r.run.network.requests} passive request(s) to ${html(r.run.network.origins.join(", "))}` : "no requests made"} · Product Check ${html(r.run.tool_version)} · rubric ${html(r.scorecard.rubric_version)} · methodology CT3 (${html(r.run.methodology.relationship)})</div></div>
<h3>Workflow phases</h3><div class="scroll"><table><thead><tr><th>Phase</th><th>Status</th><th>Notes</th></tr></thead><tbody>${r.run.phases.map((p) => `<tr><td>${html(p.phase)}</td><td>${chip(p.status, p.status === "COMPLETED" ? "good" : p.status === "FAILED" ? "critical" : p.status === "PARTIAL" ? "warning" : "neutral")}</td><td class="small">${p.notes.map((n) => html(n)).join("<br>")}</td></tr>`).join("")}</tbody></table></div>
${r.limitations.length ? `<h3>Limitations</h3><ul class="small">${r.limitations.map((l) => `<li><code>${html(l.code)}</code> (${l.count}): ${html(l.message)}</li>`).join("")}</ul>` : ""}
</section>`;

  const work = `<section class="view" id="workbench" aria-labelledby="h-workbench"><h2 id="h-workbench">Validation workbench</h2>
${PILLARS.map((p) => `<div><strong>${LABEL[p]}</strong>${statusStack(r, p)}</div>`).join("")}
<div class="legend"><span><i class="seg-PASS"></i>Pass</span><span><i class="seg-PARTIAL"></i>Partial</span><span><i class="seg-FAIL"></i>Fail</span><span><i class="seg-NOT_TESTED"></i>Blocked or not tested (unknown)</span></div>
<div class="filters" data-filter-table="validations-table"><label>Pillar<select data-key="pillar"><option value="">All</option>${PILLARS.map((p) => `<option value="${p}">${LABEL[p]}</option>`).join("")}</select></label>
<label>Status<select data-key="status"><option value="">All</option>${["PASS", "PARTIAL", "FAIL", "BLOCKED", "NOT_TESTED", "NOT_APPLICABLE"].map((s) => `<option value="${s}">${s.replace("_", " ")}</option>`).join("")}</select></label>
<label>Search<input type="search" data-key="text" placeholder="control, text, path"></label><span class="small muted" data-count style="align-self:end"></span></div>
<div class="scroll"><table id="validations-table"><thead><tr><th>Control</th><th>Requirement</th><th>Status</th><th>Expected / actual</th><th>Evidence</th></tr></thead><tbody>${r.validations.map((x) => validationRow(r, x)).join("")}</tbody></table></div>
<h3>Findings</h3>
<div class="filters" data-filter-table="findings-table"><label>Severity<select data-key="severity"><option value="">All</option>${["P0", "P1", "P2", "P3"].map((s) => `<option>${s}</option>`).join("")}</select></label>
<label>Status<select data-key="fstatus"><option value="">All</option>${["OPEN", "UNVERIFIED", "ACCEPTED_RISK", "RESOLVED"].map((s) => `<option>${s}</option>`).join("")}</select></label><span class="small muted" data-count style="align-self:end"></span></div>
<div class="scroll"><table id="findings-table"><thead><tr><th>ID</th><th>Severity</th><th>Finding</th><th>Status</th><th>Reproduction</th><th>Evidence</th></tr></thead><tbody>${r.findings
    .map(
      (f) =>
        `<tr data-severity="${f.severity}" data-fstatus="${f.status}"><td><code>${html(f.id)}</code><br><span class="small muted">${html(f.control_id)}</span></td><td>${chip(f.severity, SEV_TONE[f.severity] ?? "neutral")}${f.ux_severity ? `<br><span class="small muted">${html(f.ux_severity)}</span>` : ""}</td><td>${html(f.title)}<br><span class="small">${html(f.actual)}</span><br><span class="small muted">${html(f.epistemic)} · ${html(f.confidence.toLowerCase())} confidence · root cause (${html(f.root_cause.certainty)}): ${html(f.root_cause.statement)}</span></td><td>${chip(f.status.replace("_", " "), f.status === "RESOLVED" ? "good" : f.status === "OPEN" ? "critical" : f.status === "UNVERIFIED" ? "unknown" : "warning")}<br><span class="small muted">${html(f.lifecycle)}</span></td><td class="small">${f.reproduction.map((x) => `<code>${html(x)}</code>`).join("<br>") || "—"}<br>${html(f.reproducibility)}</td><td class="small">${evidenceList(r, f.evidence_ids)}</td></tr>`
    )
    .join("")}</tbody></table></div>
</section>`;

  const b = r.blueprint;
  const bp = `<section class="view" id="blueprint" aria-labelledby="h-blueprint"><h2 id="h-blueprint">Blueprint &amp; remediation</h2>
<p class="muted small">Advisory: Product Check never changes code. A work packet is VERIFIED only when a retest observes the control passing.</p>
<div class="scroll"><table><thead><tr><th>#</th><th>Remediation</th><th>Priority</th><th>Horizon</th><th>Effort</th><th>Depends on</th><th>Verification</th></tr></thead><tbody>${b.remediations
    .map(
      (x, i) =>
        `<tr><td class="num">${i + 1}</td><td><code>${html(x.id)}</code> ${html(CONTROL_BY_ID.get(x.control_id)?.title ?? x.control_id)}${x.human_review_required ? `<br>${chip("Human review", "warning")}` : ""}</td><td>${chip(x.priority, SEV_TONE[x.priority] ?? "neutral")}</td><td>${html(x.horizon)}</td><td>${html(x.effort ?? "—")}</td><td class="small">${html(x.depends_on.join(", ") || "—")}</td><td>${chip(x.verification.status.replace("_", " "), STATUS_TONE[x.verification.status] ?? "neutral")}</td></tr>`
    )
    .join("")}</tbody></table></div>
<h3>Work packets</h3>${
    b.work_packets
      .map((p) => {
        const rem = b.remediations.find((x) => x.id === p.remediation_id);
        return `<details class="card" style="margin-bottom:8px"><summary><code>${html(p.id)}</code> ${html(p.title)} ${chip(p.status.replace("_", " "), STATUS_TONE[p.status] ?? "neutral")}</summary>
<p><strong>Objective.</strong> ${html(p.objective)}</p><p><strong>Findings:</strong> <code>${html(p.finding_ids.join(", "))}</code></p>
<p><strong>Where:</strong> ${p.context.locations.map((l) => `<code>${html(l)}</code>`).join(", ") || "—"}</p>
<p><strong>Acceptance criteria</strong></p><ul>${p.acceptance_criteria.map((a) => `<li>${html(a)}</li>`).join("")}</ul>
<p><strong>Constraints</strong></p><ul class="small">${p.constraints.map((c) => `<li>${html(c)}</li>`).join("")}</ul>
${
  rem?.regression_test.candidate
    ? `<p><strong>Regression test candidate</strong> (${html(rem.regression_test.candidate.language)})</p><pre>${rem.regression_test.candidate.code
        .split("\n")
        .map((line) => html(line))
        .join("\n")}</pre>`
    : rem
      ? `<p><strong>Regression protection.</strong> ${html(rem.regression_test.description)}</p>`
      : ""
}
<p class="small"><strong>Verify:</strong> <code>${html(p.verification_command)}</code></p></details>`;
      })
      .join("") || `<p class="muted">No work packets.</p>`
  }
<h3>To-be architecture</h3><ul>${b.to_be.changes.map((c) => `<li><strong>${html(c.statement)}</strong> <span class="muted small">${html(c.rationale)}${c.alternatives.length ? ` Alternatives: ${c.alternatives.map((a) => html(a)).join("; ")}` : ""}</span></li>`).join("") || `<li class="muted">No target changes.</li>`}</ul>
<h3>As-is architecture</h3><div class="scroll"><table><thead><tr><th>Component</th><th>Category</th><th>Certainty</th></tr></thead><tbody>${b.as_is.components.map((c) => `<tr><td><code>${html(c.name)}</code></td><td>${html(c.category)}</td><td>${html(c.certainty)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nothing discovered.</td></tr>`}</tbody></table></div>
<h3>Uncertainties</h3><ul class="small">${b.as_is.uncertainties.map((u) => `<li>${html(u)}</li>`).join("")}</ul>
<h3>Target test architecture</h3><div class="scroll"><table><thead><tr><th>Layer</th><th>Current</th><th>Target</th></tr></thead><tbody>${b.test_architecture.layers.map((l) => `<tr><td>${html(l.layer)}</td><td>${chip(l.current, l.current === "present" ? "good" : l.current === "absent" ? "warning" : "unknown")}</td><td class="small">${html(l.target)}</td></tr>`).join("")}</tbody></table></div>
</section>`;

  const c = r.comparison;
  const historyRows = r.history
    .map(
      (h, i) =>
        `<tr><td class="num">${i + 1}</td><td><code>${html(h.run_id)}</code></td><td>${html(h.finished_at)}</td><td><code>${html(h.revision?.slice(0, 12) ?? "—")}</code></td><td>${chip(h.verdict.replace(/_/g, " "), VERDICT_TONE[h.verdict] ?? "neutral")}</td>${PILLARS.map((p) => `<td class="num">${h.scores[p] ?? "—"} <span class="muted small">(${pct(h.coverage[p])})</span></td>`).join("")}<td class="num">${h.open_findings}</td></tr>`
    )
    .join("");
  const hist = `<section class="view" id="history" aria-labelledby="h-history"><h2 id="h-history">Assurance history</h2>
${trendChart(r.history)}
<h3>Runs</h3><div class="scroll"><table><thead><tr><th class="num">#</th><th>Run</th><th>Finished</th><th>Revision</th><th>Verdict</th>${PILLARS.map((p) => `<th class="num">${LABEL[p]} (coverage)</th>`).join("")}<th class="num">Open findings</th></tr></thead><tbody>${historyRows}</tbody></table></div>
${
  c
    ? `<h3>Latest retest</h3><div class="grid kpis">${[
        ["New", c.findings_new.length],
        ["Verified fixed", c.findings_resolved.length],
        ["Reopened", c.findings_reopened.length],
        ["Still open", c.findings_persisting.length],
        ["Not re-checked", c.findings_unverified.length],
        ["Regressed controls", c.regressed_controls.length],
      ]
        .map(
          ([k, val]) =>
            `<div class="card kpi"><div class="label">${html(String(k))}</div><div class="value">${html(String(val))}</div></div>`
        )
        .join("")}</div>
<p class="small">Compared with <code>${html(c.baseline_run_id)}</code>. Improved: ${html(c.improved_controls.join(", ") || "none")}. Regressed: ${html(c.regressed_controls.join(", ") || "none")}.</p>`
    : `<p class="muted">No baseline comparison in this run.</p>`
}
</section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; img-src data:">
<title>Product Check: ${html(r.contract.target.name)}</title>
<style>${css}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern></defs></svg>
<div class="wrap">
<header class="top"><div><h1>Product Check: ${html(r.contract.target.name)}</h1><div class="meta">Run ${html(r.run.run_id)} · ${html(r.run.finished_at)} · ${html(r.run.status)}</div></div><button class="theme-toggle" type="button" hidden>Theme: auto</button></header>
${banners}
<nav class="tabs" aria-label="Dashboard views"><a href="#readiness" aria-current="page">Executive readiness</a><a href="#scan">Scan explorer</a><a href="#workbench">Validation workbench</a><a href="#blueprint">Blueprint &amp; remediation</a><a href="#history">Assurance history</a></nav>
<main>
${exec}
${scan}
${work}
${bp}
${hist}
</main>
<footer>Generated from <code>product-check-results.json</code> (schema ${html(r.schema_version)}); every figure is derived from that file${integrity.errors.length === 0 ? " and its scorecard and verdict recompute from the validations" : ""}. Evidence-bounded readiness, not a penetration test, certification or guarantee.${options.branding ? " Product Check is an EnWithAI Engineering Commons tool." : ""}</footer>
</div>
<script>${js}</script>
</body>
</html>
`;
}
