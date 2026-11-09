/** The parsed documents of one input file. */
export interface InputDocs {
    source: string;
    docs: unknown[];
}
/** One OpenSLO SLO. */
export interface SloInfo {
    name: string;
    service: string | null;
    /** Missing parts: "service", "time window", "objective target", "indicator". Empty when complete. */
    missing: string[];
    has_alert_policy: boolean;
    dangling_policy_refs: string[];
}
/** Summary of the imported OpenSLO files. */
export interface OpenSloSummary {
    slos: SloInfo[];
    slis: number;
    alert_policies: number;
    /** Documents with another OpenSLO apiVersion (v1alpha, v2alpha). */
    unsupported: number;
    /** openslo/v1 documents of kinds that are not read (Service, DataSource, AlertCondition, …). */
    other: number;
}
/** Parses OpenSLO v1 files; references resolve across all of them by metadata.name. */
export declare function parseOpenSlo(files: InputDocs[]): OpenSloSummary;
/** An alerting rule. `expr` is used for matching only and never written to results. */
export interface AlertRule {
    name: string;
    expr: string;
    labels: Record<string, string>;
}
/** Summary of the imported alert rules. */
export interface AlertRulesSummary {
    alerting: AlertRule[];
    recording: number;
}
/** Parses Prometheus/Mimir rule files, PrometheusRule resources and /api/v1/rules exports. */
export declare function parseAlertRules(files: InputDocs[]): AlertRulesSummary;
/** A rule matches an SLO by a label value or a label matcher in its expression (name-based: an inference). */
export declare function sloMatchesRule(slo: string, rule: AlertRule): boolean;
/** One runtime edge. */
export interface ServiceEdge {
    client: string;
    server: string;
    count: number;
}
/** Summary of a service-graph export. */
export interface ServiceGraphSummary {
    format: "jaeger" | "prometheus";
    edges: ServiceEdge[];
    /** Distinct peers that look like hosts (not named in results, never matched). */
    external_peers: number;
}
/** Parses a Jaeger /api/dependencies export or a service-graph metrics query result. */
export declare function parseServiceGraph(data: unknown, source: string): ServiceGraphSummary;
