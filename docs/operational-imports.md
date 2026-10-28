# Operational imports (tier CT-T4 Launch Watch)

Status: specification for the next release. Rubric `pc-rubric-0.2`, which is still unreleased, so its catalog
grows from 48 to 51 controls. Results schema `0.1.0`, additive.

Before this, every CT-T4 control was `NOT_TESTED` because Product Check had no telemetry adapter. This increment
adds three **file** importers. There is still no network access and no live querying: you export the files, as you
already do for Outcome Check, and Product Check reads them offline.

| Flag (repeatable?)     | Contract key            | File                                                                                                   |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `--openslo` (yes)      | `imports.openslo`       | OpenSLO v1 YAML or JSON: `SLO`, `SLI`, `AlertPolicy` documents, several per file                       |
| `--alert-rules` (yes)  | `imports.alert_rules`   | Prometheus/Mimir rule files, Kubernetes `PrometheusRule` resources, or the `/api/v1/rules` JSON export |
| `--service-graph` (no) | `imports.service_graph` | Jaeger `/api/dependencies` JSON, or a Prometheus query result of `traces_service_graph_request_total`  |

All three contract keys are optional in the contract schema, with defaults `[]`, `[]` and `null`, so existing
contracts and the contracts embedded in 0.1.0 results stay valid.

## YAML

OpenSLO and rule files are YAML. Product Check therefore takes its **first runtime dependency**, `yaml` 2.9.1
(ISC), pinned exactly. This was approved by the user on 2026-10-28, and Architecture Check made the same choice
(D-082). It is used only through `src/parse/yaml.ts`:

- `parseAllDocuments` with the YAML 1.2 **core** schema, `uniqueKeys`, and `maxAliasCount: 100` (YAML bombs fail).
- Custom tags are never resolved; a tagged value is read as plain data.
- YAML input is capped at **10 MiB** per file, and any document error is an input error (exit 3).
- JSON is valid YAML 1.2, so the same reader takes JSON exports.

`src/` still has no network modules and no code execution.

## OpenSLO (`--openslo`)

The importer reads documents with `apiVersion: openslo/v1` and `kind` `SLO`, `SLI` or `AlertPolicy`. Other kinds
are counted but not read: `Service`, `DataSource`, `AlertCondition`, `AlertNotificationTarget`. Other
`apiVersion`s (`openslo/v1alpha`, `openslo/v2alpha`) are counted as unsupported. Each file must contain at
least one `openslo/v1` document, otherwise it is an input error (a wrong file passed by mistake). References (`indicatorRef`, `alertPolicyRef`) resolve across all
imported OpenSLO files by `metadata.name`.

Fields read:

- `SLO`: `metadata.name`, `spec.service`, `spec.timeWindow[].duration`, `spec.objectives[].target`,
  `.targetPercent`, `spec.indicator`, `spec.indicatorRef`, and `spec.alertPolicies[]` (inline `kind:
AlertPolicy`, or `alertPolicyRef`).
- `SLI` and `AlertPolicy`: `metadata.name` only.

An SLO is **complete** when all four hold:

1. It has a non-empty `service`.
2. It has exactly one `timeWindow` entry with a `duration`.
3. At least one objective sets `target` or `targetPercent`.
4. It has an `indicator`, or an `indicatorRef` that resolves to an imported `SLI`.

An SLO **has an alert policy** when `alertPolicies` is non-empty and every entry is inline or resolves to an
imported `AlertPolicy`. A dangling reference is reported by name.

## Alert rules (`--alert-rules`)

The importer accepts three shapes, in YAML or JSON:

1. A Prometheus/Mimir rule file: `groups[].rules[]`.
2. A Kubernetes `PrometheusRule` resource (`apiVersion: monitoring.coreos.com/v1`): `spec.groups[].rules[]`.
3. The Prometheus/Mimir `/api/v1/rules` export: `data.groups[].rules[]` with `type`, `name` and `query`.

Alerting rules (`alert` with `expr`, or `type: alerting` with `name` and `query`) keep their name, expression and
labels; recording rules are only counted. A file with no `groups` in any of these places is an input error. Rule
expressions and annotations are never written to the results, only rule names and counts.

**Matching a rule to an SLO** is name-based, so it is an inference. A rule matches an SLO when one of these holds:

- one of its label values equals the SLO name;
- its expression contains a label matcher whose value is the SLO name, for example `sloth_slo="checkout-availability"`
  or `slo="checkout-availability"`. That is the form Sloth and Pyrra generate.

## Service graph (`--service-graph`)

The importer accepts two shapes:

1. **Jaeger** `/api/dependencies` export: `data[]` of `{ parent, child, callCount }`.
2. **Prometheus query result** (`/api/v1/query` or `query_range`): `status: "success"` and `data.result[]` with
   `metric.client` and `metric.server`. If `metric.__name__` is present, it must end in
   `service_graph_request_total`; this covers the OpenTelemetry Collector `servicegraph` connector and Tempo's
   metrics generator. Counts are the last sample value.

Edges with a zero count are dropped, and series are summed per `client → server`. A peer that looks like a host
(it contains `:`, is an IPv4 address, or has a dot) is recorded only as an **external peer** count, never by name,
and is never matched.

A service graph is a **snapshot** of a time window. The evidence states that it shows calls happened in the
window, not that every path was exercised. Neither export format records the window it covers, so the evidence
says that too.

## Controls

The three new controls are all in the technology pillar, tier CT-T4, category `launch-watch`, weight 1, severity
P2, with no gate.

**PC-T-18 "SLOs define an objective, a time window and an indicator"** (point of presence `observability`).

| Input               | Status     | Detail                                                                             |
| ------------------- | ---------- | ---------------------------------------------------------------------------------- |
| no `--openslo`      | NOT_TESTED | reason names the flag                                                              |
| no SLO in the files | PARTIAL    | one finding `no-slo` (fact)                                                        |
| every SLO complete  | PASS       | evidence: SLO count, services                                                      |
| some SLO incomplete | PARTIAL    | one finding per SLO (`slo-incomplete:<name>`, fact, HIGH) naming the missing parts |

**PC-T-19 "Every SLO is alerted on"** (point of presence `observability`).

| Input                                                     | Status     | Detail                                                                          |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| no `--openslo`, or no SLO                                 | NOT_TESTED | reason                                                                          |
| every SLO has an alert policy or a matching alerting rule | PASS       | evidence: how many by policy (fact) and how many by rule-name match (inference) |
| some SLO has neither                                      | PARTIAL    | one finding per SLO (`slo-unalerted:<name>`, fact, HIGH); dangling refs named   |

**PC-T-20 "Declared dependencies are observed at runtime"** (points of presence `observability` and
`repository`). This control needs both a service graph and an Architecture Check report (`--architecture-check`).
Its candidates are the report's `relationship-unobserved` findings: declared relationships `from -> to` with no
static evidence, which static analysis can only call `unknown`. An edge **confirms** a candidate when the normalized
last segment of `from` equals the normalized `client`, and the same holds for `to` and `server`. Normalized means
lower case, letters and digits only.

| Input                                       | Status     | Detail                                                                                                                              |
| ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| no `--service-graph`                        | NOT_TESTED | reason names the flag                                                                                                               |
| service graph, no Architecture Check report | NOT_TESTED | reason: the declared relationships come from `--architecture-check`                                                                 |
| no candidates, or all confirmed             | PASS       | evidence: edges, confirmed candidates, external peers; "no candidates" says every declared relationship already has static evidence |
| some candidate unconfirmed                  | PARTIAL    | one finding per relationship (`relationship-not-observed:<from>-><to>`, inference, MEDIUM): not seen in this snapshot               |

Runtime edges with no declared counterpart are counted in the evidence but not judged. The report does not list
every declared relationship, so an "undeclared" verdict would be a guess.

**PC-T-14 "Production monitoring and alerting are live"** (existing, CT-T4, weight 2, P1). A contract
`control_mappings` outcome still wins. Otherwise:

| Input                                         | Status                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| alert configuration **and** runtime telemetry | PASS                                                                             |
| only one of them                              | PARTIAL, one finding `monitoring-incomplete` (inference) naming the missing half |
| neither                                       | NOT_TESTED (unchanged reason, now naming the flags)                              |

- **Alert configuration** means at least one alerting rule, or at least one SLO with an alert policy.
- **Runtime telemetry** means a service graph with at least one edge.

**PC-C-11** (real-user journey health) stays NOT_TESTED. None of these files shows whether users' journeys
succeed.

**Observability point of presence.** At CT-T4 and later it is AVAILABLE (provenance `imported`) when any of the
three imports is given. Otherwise it stays BLOCKED with the existing reason.

## Expected cases (tests are written first)

- **YAML reader:**
  - multiple documents;
  - an alias bomb is rejected;
  - a duplicate key is rejected;
  - `!!js/function` is read as plain data;
  - more than 10 MiB is rejected.
- **OpenSLO:**
  - a complete SLO with an inline indicator;
  - an SLO whose `indicatorRef` resolves in another file;
  - incomplete SLOs (missing time window, target or indicator);
  - `alertPolicyRef` resolved and dangling;
  - v2alpha documents counted as unsupported;
  - a file without `openslo/v1` rejected.
- **Alert rules:**
  - each of the three shapes;
  - recording rules counted;
  - Sloth `sloth_slo="…"` and `slo` label matches;
  - no `groups` rejected.
- **Service graph:**
  - Jaeger and Prometheus shapes;
  - zero counts dropped;
  - series summed;
  - host-like peers counted as external;
  - a wrong `__name__` rejected.
- **Controls** (CLI at `--stage JUST_LAUNCHED`):
  - PC-T-18 PASS and PARTIAL;
  - PC-T-19 PASS by policy, PASS by rule match, and PARTIAL;
  - PC-T-20 NOT_TESTED without a report, PASS, and PARTIAL;
  - PC-T-14 PASS, PARTIAL and NOT_TESTED;
  - the observability point of presence AVAILABLE.
- **Package:** the production license audit lists exactly one package (`yaml`, ISC).
