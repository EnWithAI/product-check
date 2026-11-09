import { code, md } from "./escape.js";
const TAG = {
    observed: "observed",
    inferred: "inferred",
    hypothesis: "needs confirmation",
};
/** Renders the as-built spec. */
export function renderAsBuiltSpec(spec) {
    const byId = new Map(spec.surface.map((s) => [s.id, s]));
    const loc = (s) => code(`${s.location.path}${s.location.line ? `:${s.location.line}` : ""}`);
    const sources = (r) => {
        const items = r.surface_ids.map((id) => byId.get(id)).filter((s) => s !== undefined);
        if (items.length === 0)
            return r.evidence_ids.length ? ` Evidence: ${r.evidence_ids.join(", ")}.` : "";
        const shown = items.slice(0, 3).map(loc).join(", ");
        return ` Source: ${shown}${items.length > 3 ? ` and ${items.length - 3} more` : ""}.`;
    };
    // Statements are escaped where they are built (src/spec/build.ts), so they are printed as they are.
    const text = (r) => r.statement;
    const line = (r) => `- **${r.id}**: ${text(r)} _(${TAG[r.certainty]})_${sources(r)}`;
    const date = spec.generated_at.slice(0, 10);
    const out = [
        `# Feature Specification: ${md(spec.target.name)} (as built)`,
        "",
        "**Feature Branch**: `000-as-built`",
        "",
        `**Created**: ${date}`,
        "",
        "**Status**: Draft (reverse-engineered)",
        "",
        `**Input**: Repository ${code(spec.target.repository)}${spec.target.commit ? ` at commit ${code(spec.target.commit.slice(0, 12))}` : " (no git commit recorded)"}, read by Product Check ${code(spec.tool.version)}`,
        "",
        "> **Reverse-engineered, not authored.** Product Check derived this specification from the repository's structure",
        "> without running it. _observed_ statements point at a file and line; _inferred_ ones interpret what was found;",
        "> anything the code cannot tell us is marked `NEEDS CLARIFICATION`. Confirm or correct each statement before",
        "> treating this as the product's specification.",
        "",
        "## User Scenarios & Testing _(mandatory)_",
        "",
    ];
    if (spec.stories.length === 0)
        out.push("No pages or endpoints were recognised, so no user stories could be derived.", "");
    for (const s of spec.stories) {
        out.push(`### User Story ${s.id.slice(3)} - ${md(s.title)} (Priority: ${s.critical_journey ? "P1" : "P2"})`, "", `**Purpose**: [NEEDS CLARIFICATION: who uses the ${md(s.title)} area, and what outcome must it deliver?]`, "");
        if (s.critical_journey)
            out.push(`Declared critical journey: ${md(s.critical_journey)}.`, "");
        out.push(`Covers ${s.requirement_ids.join(", ")}.`, "");
        if (s.test_behaviours.length > 0) {
            out.push("**Behaviour described by tests** _(inferred; convert to Given/When/Then once confirmed)_:", "");
            for (const t of s.test_behaviours.slice(0, 15))
                out.push(`- ${md(t)}`);
            if (s.test_behaviours.length > 15)
                out.push(`- … and ${s.test_behaviours.length - 15} more`);
            out.push("");
        }
    }
    const storyTests = new Set(spec.stories.flatMap((s) => s.surface_ids));
    const loose = spec.surface.filter((x) => x.kind === "test" && !storyTests.has(x.id));
    if (loose.length > 0) {
        out.push("### Other behaviour described by tests _(inferred)_", "");
        for (const t of loose.slice(0, 40))
            out.push(`- ${md(t.name)} (${loc(t)})`);
        if (loose.length > 40)
            out.push(`- … and ${loose.length - 40} more`);
        out.push("");
    }
    out.push("### Edge Cases", "");
    if (spec.edge_cases.length === 0)
        out.push("- [NEEDS CLARIFICATION: no edge or error cases could be found in the repository]");
    for (const e of spec.edge_cases)
        out.push(`- ${text(e)} _(${TAG[e.certainty]})_`);
    out.push("", "## Requirements _(mandatory)_", "", "### Functional Requirements", "");
    if (spec.requirements.length === 0)
        out.push("- [NEEDS CLARIFICATION: no functional surface was recognised]");
    for (const r of spec.requirements)
        out.push(line(r));
    out.push("", "### Non-Functional Requirements", "");
    for (const r of spec.non_functional)
        out.push(line(r));
    const entities = new Map();
    for (const e of spec.surface.filter((s) => s.kind === "entity"))
        entities.set(e.name.toLowerCase(), [...(entities.get(e.name.toLowerCase()) ?? []), e]);
    if (entities.size > 0) {
        out.push("", "### Key Entities", "");
        for (const group of entities.values()) {
            const best = group.find((g) => g.detail.startsWith("fields:")) ?? group[0];
            out.push(`- **${md(best.name)}**: ${md(best.detail)} (${group.map(loc).join(", ")})`);
        }
    }
    out.push("", "## Success Criteria _(mandatory)_", "");
    for (const r of spec.success_criteria)
        out.push(line(r));
    out.push("", "## Clarifications needed", "");
    for (const c of spec.clarifications)
        out.push(`- ${md(c)}`);
    out.push("", "## Uncertainties", "");
    for (const u of spec.uncertainties)
        out.push(`- ${md(u)}`);
    out.push("", "## Appendix: as-built surface", "");
    const table = (title, kind, cols, head) => {
        const rows = spec.surface.filter((s) => s.kind === kind);
        if (rows.length === 0)
            return;
        out.push(`### ${title}`, "", `| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
        for (const r of rows)
            out.push(`| ${cols(r).join(" | ")} |`);
        out.push("");
    };
    table("Pages", "page", (s) => [code(s.name), md(s.detail), loc(s), s.auth_hint ? "yes (inferred)" : "—"], [
        "Route",
        "Kind",
        "Source",
        "Auth helper",
    ]);
    table("Endpoints", "endpoint", (s) => [
        code(s.method ?? "ANY"),
        code(s.name),
        md(s.detail),
        loc(s),
        s.auth_hint ? "yes (inferred)" : "—",
    ], ["Method", "Path", "Kind", "Source", "Auth helper"]);
    table("Data entities", "entity", (s) => [code(s.name), md(s.detail), loc(s)], [
        "Entity",
        "Detail",
        "Source",
    ]);
    table("Integrations", "integration", (s) => [code(s.name), md(s.detail), loc(s)], [
        "Package",
        "Category",
        "Declared in",
    ]);
    table("Configuration (names only)", "config", (s) => [code(s.name), md(s.detail), loc(s)], [
        "Variable",
        "Use",
        "First reference",
    ]);
    table("Authentication boundaries", "auth-boundary", (s) => [code(s.name), md(s.detail), loc(s)], [
        "Boundary",
        "Detail",
        "Source",
    ]);
    out.push(`Generated ${spec.generated_at} · ${spec.surface.length} surface item(s) · ${spec.evidence.length} evidence item(s) in as-built-spec.json`, "");
    return out.join("\n");
}
