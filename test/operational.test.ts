// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Operational imports for CT-T4 (docs/operational-imports.md): the YAML reader, OpenSLO, alert rules and service
 * graph importers, and controls PC-T-14, PC-T-18, PC-T-19 and PC-T-20. Written before the code.
 */
import { describe, expect, it } from "vitest";
import {
  parseAlertRules,
  parseOpenSlo,
  parseServiceGraph,
  sloMatchesRule,
} from "../src/importers/operational.js";
import { readYaml } from "../src/parse/yaml.js";
import { cleanRepo, commitAll, runJson, statusOf, tempFiles } from "./helpers.js";

const slo = (name: string, spec: Record<string, unknown>): string =>
  [
    "apiVersion: openslo/v1",
    "kind: SLO",
    "metadata:",
    `  name: ${name}`,
    "spec:",
    ...JSON.stringify(spec)
      .split("\n")
      .map((l) => `  ${l}`),
  ].join("\n");

const COMPLETE = {
  service: "checkout",
  budgetingMethod: "Occurrences",
  timeWindow: [{ duration: "28d", isRolling: true }],
  objectives: [{ target: 0.99 }],
  indicator: { metadata: { name: "ok-ratio" }, spec: {} },
};

const docs = (text: string, source = "f.yaml"): { source: string; docs: unknown[] } => ({
  source,
  docs: readYaml(text, source),
});

describe("YAML reader", () => {
  it("reads several documents and JSON", () => {
    expect(readYaml("a: 1\n---\nb: 2\n", "y")).toEqual([{ a: 1 }, { b: 2 }]);
    expect(readYaml('{"a": [1, 2]}', "j")).toEqual([{ a: [1, 2] }]);
  });

  it("rejects alias bombs, duplicate keys and oversized input; custom tags are plain data", () => {
    const bomb = [
      "a: &a [x, x, x, x, x, x, x, x, x, x]",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
      "d: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]",
    ].join("\n");
    expect(() => readYaml(bomb, "bomb.yaml")).toThrow(/bomb\.yaml/);
    expect(() => readYaml("a: 1\na: 2\n", "dup.yaml")).toThrow(/dup\.yaml/);
    expect(() => readYaml(`x: "${"a".repeat(10 * 1024 * 1024)}"\n`, "big.yaml")).toThrow(/10 MiB/);
    expect(readYaml("f: !!js/function 'return 1'\n", "t.yaml")).toEqual([{ f: "return 1" }]);
  });
});

describe("OpenSLO importer", () => {
  it("checks completeness and resolves references across files", () => {
    const a = docs(
      [
        slo("checkout-availability", { ...COMPLETE, alertPolicies: [{ alertPolicyRef: "page-oncall" }] }),
        "---",
        slo("search-latency", {
          service: "search",
          timeWindow: [{ duration: "7d", isRolling: true }],
          objectives: [{ targetPercent: 99 }],
          indicatorRef: "search-p99",
          alertPolicies: [{ alertPolicyRef: "missing-policy" }],
        }),
        "---",
        slo("broken", { service: "", objectives: [{ displayName: "no target" }], indicatorRef: "nope" }),
        "---",
        "apiVersion: openslo/v2alpha\nkind: SLO\nmetadata:\n  name: future\n",
        "---",
        "apiVersion: openslo/v1\nkind: Service\nmetadata:\n  name: checkout\n",
      ].join("\n"),
      "slos.yaml"
    );
    const b = docs(
      [
        "apiVersion: openslo/v1\nkind: SLI\nmetadata:\n  name: search-p99\nspec: {}",
        "---",
        "apiVersion: openslo/v1\nkind: AlertPolicy\nmetadata:\n  name: page-oncall\nspec: {}",
      ].join("\n"),
      "refs.yaml"
    );
    const s = parseOpenSlo([a, b]);
    expect(s.unsupported).toBe(1);
    expect(s.other).toBe(1);
    expect(s.slis).toBe(1);
    expect(s.alert_policies).toBe(1);
    expect(s.slos).toEqual([
      {
        name: "broken",
        service: null,
        missing: ["service", "time window", "objective target", "indicator"],
        has_alert_policy: false,
        dangling_policy_refs: [],
      },
      {
        name: "checkout-availability",
        service: "checkout",
        missing: [],
        has_alert_policy: true,
        dangling_policy_refs: [],
      },
      {
        name: "search-latency",
        service: "search",
        missing: [],
        has_alert_policy: false,
        dangling_policy_refs: ["missing-policy"],
      },
    ]);
  });

  it("rejects files without openslo/v1 documents", () => {
    expect(() => parseOpenSlo([docs("apiVersion: openslo/v1alpha\nkind: SLO\n", "old.yaml")])).toThrow(
      /OpenSLO v1/
    );
    expect(() => parseOpenSlo([docs("a: 1\n", "x.yaml")])).toThrow(/x\.yaml/);
  });
});

describe("alert rules importer", () => {
  const ruleFile = [
    "groups:",
    "  - name: slo",
    "    rules:",
    "      - record: slo:sli_error:ratio_rate5m",
    "        expr: sum(rate(errors[5m]))",
    "      - alert: CheckoutHighErrorBudgetBurn",
    '        expr: slo:sli_error:ratio_rate5m{sloth_slo="checkout-availability"} > 14.4 * 0.01',
    "        labels:",
    "          severity: page",
  ].join("\n");

  it("reads rule files, PrometheusRule resources and the /api/v1/rules export", () => {
    const crd = [
      "apiVersion: monitoring.coreos.com/v1",
      "kind: PrometheusRule",
      "metadata:\n  name: search",
      "spec:",
      "  groups:",
      "    - name: search",
      "      rules:",
      "        - alert: SearchSlow",
      "          expr: histogram_quantile(0.99, x) > 1",
      "          labels:",
      "            slo: search-latency",
    ].join("\n");
    const api = JSON.stringify({
      status: "success",
      data: {
        groups: [
          {
            name: "g",
            rules: [
              { type: "alerting", name: "Down", query: "up == 0", labels: {} },
              { type: "recording", name: "r", query: "x" },
            ],
          },
        ],
      },
    });
    const s = parseAlertRules([docs(ruleFile, "rules.yaml"), docs(crd, "crd.yaml"), docs(api, "api.json")]);
    expect(s.recording).toBe(2);
    expect(s.alerting.map((r) => r.name)).toEqual(["CheckoutHighErrorBudgetBurn", "Down", "SearchSlow"]);
    const byName = (n: string) => s.alerting.find((r) => r.name === n)!;
    expect(sloMatchesRule("checkout-availability", byName("CheckoutHighErrorBudgetBurn"))).toBe(true);
    expect(sloMatchesRule("search-latency", byName("SearchSlow"))).toBe(true);
    expect(sloMatchesRule("checkout", byName("CheckoutHighErrorBudgetBurn"))).toBe(false);
    expect(sloMatchesRule("search-latency", byName("Down"))).toBe(false);
  });

  it("rejects files without rule groups", () => {
    expect(() => parseAlertRules([docs("kind: Deployment\n", "d.yaml")])).toThrow(/d\.yaml/);
  });
});

describe("service graph importer", () => {
  it("reads Jaeger dependencies, sums Prometheus series and hides host-like peers", () => {
    expect(
      parseServiceGraph(
        {
          data: [
            { parent: "web", child: "api", callCount: 10 },
            { parent: "api", child: "db.internal:5432", callCount: 3 },
            { parent: "api", child: "idle", callCount: 0 },
          ],
        },
        "j.json"
      )
    ).toEqual({ format: "jaeger", edges: [{ client: "web", server: "api", count: 10 }], external_peers: 1 });
    const series = (client: string, server: string, v: string, extra: Record<string, string> = {}) => ({
      metric: { __name__: "traces_service_graph_request_total", client, server, ...extra },
      value: [1761638400, v],
    });
    expect(
      parseServiceGraph(
        {
          status: "success",
          data: {
            resultType: "vector",
            result: [
              series("api", "payments", "4", { connection_type: "" }),
              series("api", "payments", "6", { connection_type: "messaging_system" }),
              series("api", "10.0.0.7", "2"),
            ],
          },
        },
        "p.json"
      )
    ).toEqual({
      format: "prometheus",
      edges: [{ client: "api", server: "payments", count: 10 }],
      external_peers: 1,
    });
    expect(() =>
      parseServiceGraph(
        {
          status: "success",
          data: { result: [{ metric: { __name__: "up", client: "a", server: "b" }, value: [0, "1"] }] },
        },
        "w.json"
      )
    ).toThrow(/service graph/);
    expect(() => parseServiceGraph({ nope: 1 }, "n.json")).toThrow(/n\.json/);
  });
});

describe("CT-T4 controls", () => {
  const arch = (unobserved: string[]) => ({
    kind: "architecture-check-report",
    schema_version: "1.1",
    declared_model: { path: "architecture/workspace.dsl", format: "dsl", usable: true },
    complete_mapping: true,
    findings: unobserved.map((subject) => ({
      rule_id: "relationship-unobserved",
      severity: "info",
      status: "unknown",
      subject,
    })),
  });
  const jaeger = (edges: [string, string][]) => ({
    data: edges.map(([parent, child]) => ({ parent, child, callCount: 5 })),
  });

  it("evaluate SLOs, alerting, runtime dependencies and monitoring from imported files", async () => {
    const dir = tempFiles({
      ...cleanRepo(),
      "ops/slos.yaml": [
        slo("checkout-availability", { ...COMPLETE, alertPolicies: [{ alertPolicyRef: "page-oncall" }] }),
        "---",
        slo("search-latency", { ...COMPLETE, service: "search" }),
        "---",
        "apiVersion: openslo/v1\nkind: AlertPolicy\nmetadata:\n  name: page-oncall\nspec: {}",
      ].join("\n"),
      "ops/incomplete.yaml": slo("broken", { service: "x" }),
      "ops/rules.yaml": [
        "groups:",
        "  - name: g",
        "    rules:",
        "      - alert: SearchSlow",
        '        expr: x{slo="search-latency"} > 1',
      ].join("\n"),
      "ops/graph.json": jaeger([
        ["web", "api"],
        ["api", "payments"],
      ]),
      "ops/arch.json": arch(["shop.web -> shop.api", "shop.api -> payments"]),
      "ops/arch-gap.json": arch(["shop.web -> shop.api", "shop.api -> shop.mailer"]),
    });
    commitAll(dir);
    const base = ["--repo", ".", "--stage", "JUST_LAUNCHED"];

    const none = await runJson(dir, base);
    for (const id of ["PC-T-18", "PC-T-19", "PC-T-20", "PC-T-14"])
      expect(statusOf(none, id), id).toBe("NOT_TESTED");
    expect(none.pop_coverage.pops.find((p) => p.id === "observability")?.status).toBe("BLOCKED");

    const full = await runJson(dir, [
      ...base,
      "--openslo",
      "ops/slos.yaml",
      "--alert-rules",
      "ops/rules.yaml",
      "--service-graph",
      "ops/graph.json",
      "--architecture-check",
      "ops/arch.json",
    ]);
    expect(statusOf(full, "PC-T-18")).toBe("PASS");
    expect(statusOf(full, "PC-T-19")).toBe("PASS");
    expect(statusOf(full, "PC-T-20")).toBe("PASS");
    expect(statusOf(full, "PC-T-14")).toBe("PASS");
    expect(full.pop_coverage.pops.find((p) => p.id === "observability")?.status).toBe("AVAILABLE");
    const t19 = full.validations.find((v) => v.control_id === "PC-T-19")!;
    expect(full.evidence.find((e) => t19.evidence_ids.includes(e.id))?.summary).toMatch(
      /1 by alert policy, 1 by alert-rule name match/
    );

    const gaps = await runJson(dir, [
      ...base,
      "--openslo",
      "ops/slos.yaml",
      "--openslo",
      "ops/incomplete.yaml",
      "--service-graph",
      "ops/graph.json",
      "--architecture-check",
      "ops/arch-gap.json",
    ]);
    expect(statusOf(gaps, "PC-T-18")).toBe("PARTIAL");
    expect(gaps.findings.filter((f) => f.control_id === "PC-T-18")).toHaveLength(1);
    expect(statusOf(gaps, "PC-T-19")).toBe("PARTIAL");
    expect(
      gaps.findings
        .filter((f) => f.control_id === "PC-T-19")
        .map((f) => f.location)
        .sort()
    ).toEqual(["broken", "search-latency"]);
    expect(statusOf(gaps, "PC-T-20")).toBe("PARTIAL");
    const t20 = gaps.findings.filter((f) => f.control_id === "PC-T-20");
    expect(t20).toHaveLength(1);
    expect(t20[0]?.epistemic).toBe("inference");
    expect(statusOf(gaps, "PC-T-14")).toBe("PASS");

    const graphOnly = await runJson(dir, [...base, "--service-graph", "ops/graph.json"]);
    expect(statusOf(graphOnly, "PC-T-20")).toBe("NOT_TESTED");
    expect(statusOf(graphOnly, "PC-T-14")).toBe("PARTIAL");
    expect(graphOnly.findings.find((f) => f.control_id === "PC-T-14")?.epistemic).toBe("inference");
  });
});
