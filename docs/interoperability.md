# Interoperability

Product Check has no runtime dependency on any other tool or service. Integration is through files.

## Inputs Product Check reads

| Artifact                                                                                      | Flag                   | Used for                                                                                                 |
| --------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| JUnit XML (Vitest, Jest via jest-junit, Playwright, pytest, Go, Node `--test-reporter=junit`) | `--test-results`       | PC-T-03, PC-C-08 (end-to-end detection by path/name), any control via `control_mappings`                 |
| Jest/Vitest JSON reporter output                                                              | `--test-results`       | same                                                                                                     |
| `npm audit --json` (npm 7+)                                                                   | `--npm-audit`          | PC-S-15                                                                                                  |
| HAR (browser DevTools export)                                                                 | `--har`                | application controls, offline                                                                            |
| Product Check observations                                                                    | `--observations`       | application controls, offline replay                                                                     |
| Spec Check report, schema 1.0 (`spec-check check --format json`)                              | `--spec-check`         | PC-C-10 (requirements testable)                                                                          |
| Impact Check report, schema 2.0 (`impact-check --format json`)                                | `--impact-check`       | PC-T-12 (release-candidate change impact)                                                                |
| Outcome Check report, schema 1.0 (`outcome-check report --format json`)                       | `--outcome-check`      | PC-T-15 (delivery stability: CI first-pass rate, revert rate)                                            |
| Architecture Check report, schema 1.0 or 1.1 (`architecture-check check --format json`)       | `--architecture-check` | PC-T-17 (architecture model matches the code)                                                            |
| OpenSLO v1 (YAML/JSON: SLO, SLI, AlertPolicy)                                                 | `--openslo`            | PC-T-18 (SLOs complete), PC-T-19 (SLOs alerted), PC-T-14 ([operational imports](operational-imports.md)) |
| Prometheus/Mimir alert rules (rule files, `PrometheusRule`, `/api/v1/rules` JSON)             | `--alert-rules`        | PC-T-19, PC-T-14                                                                                         |
| Service graph (Jaeger `/api/dependencies`, `traces_service_graph_request_total` query result) | `--service-graph`      | PC-T-20 (declared dependencies observed at runtime, with `--architecture-check`), PC-T-14                |

The sibling-report importers read only documented fields (`schema_version`, `findings[].severity`,
`requirements`, `affected_modules`, `test_candidates`, `repo_revision.commit`, `metrics[id].segments.all`, and for
Architecture Check the fields listed below) and
reject other schema versions instead of guessing. They were checked against the sibling repositories' own schemas
and example outputs at the time of writing.

## Architecture Check import (PC-T-17)

`--architecture-check <report.json>` (contract: `imports.architecture_check`) reads a report from
[Architecture Check](https://github.com/EnWithAI/architecture-check) `analyze` or `check` (`--format json`). It
answers one question: does the architecture model committed in the repository still describe the code beside it?

**Accepted input.** An object with `kind` `"architecture-check-report"`, `schema_version` `"1.0"` or `"1.1"` (1.1
only adds enum values, Architecture Check D-102), an array `findings`, and a `declared_model` object. Anything else
is an input error (exit 3) naming the expected producer command. A `derive` report has `declared_model: null`. It
describes only the as-built model, not drift, so it is rejected as well.

**Fields read.** `schema_version`; `declared_model.path`, `.format`, `.usable`; `complete_mapping`;
`findings[].rule_id`, `.severity`, `.status`. No other field is read. The report carries no commit, so the evidence
has no revision.

**Drift that counts.** A finding counts as verified drift when its `status` is `verified_static_fact` and its
`severity` is `high` or `medium`. Hypotheses and unknowns never count, following the Commons status vocabulary: a
`relationship-unobserved` finding is always `unknown`, and runtime calls are invisible to static analysis. They
appear in the evidence summary only.

**Control PC-T-17 "Architecture model matches the code"** (technology pillar, tier CT-T3 Launch Decision, category
`architecture`, weight 1, severity P2, no gate, point of presence `repository`):

| Input                         | Status     | Detail                                                                                                                           |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| no report                     | NOT_TESTED | reason names `--architecture-check`                                                                                              |
| report with no verified drift | PASS       | evidence: one `imported-report` item with counts                                                                                 |
| report with verified drift    | PARTIAL    | one finding (`architecture-drift`, epistemic `fact`, confidence HIGH) listing the counts and rule IDs; the model is the location |

It is PARTIAL, never FAIL, like the other sibling-report controls (PC-T-12, PC-T-15): the report shows drift but
not its consequence. A model that Architecture Check cannot use is reported as a verified high `model-invalid`
finding, so it lands here as PARTIAL too. The evidence summary reads
`Architecture Check <schema>: <model path> (<format>), <n> finding(s); <v> verified drift (<rules>), <h> hypotheses, <u> unknown`.

**Rubric.** Adding the control moves the catalog to 48 controls and the rubric to `pc-rubric-0.2` (51 with the [operational controls](operational-imports.md), same unreleased rubric). Scoring rules
are unchanged. The scorecard schema accepts `pc-rubric-0.1` and `pc-rubric-0.2`, and integrity recomputation keeps the
stored rubric version. Results and retest baselines written by 0.1.0 therefore still load, validate and recompute.
The results `schema_version` stays `0.1.0`. The new contract key `imports.architecture_check` defaults to `null`,
so existing contracts are unchanged.

**Expected cases (tests).** Parser: accepts 1.0 and 1.1; rejects 2.0, a missing `kind`, a `derive` report and
non-objects. Counts: hypotheses, unknowns and low-severity verified findings excluded; rule IDs sorted and unique.
CLI: no flag → NOT_TESTED; the Architecture Check demo report (verified `boundary-violation` high and
`relationship-undeclared` medium) → PARTIAL with one finding; a report with only hypotheses → PASS. A 0.1.0-era
results file (rubric 0.1) still passes `validate`.

## Outputs others can read

`product-check-results.json` and its JSON Schemas (`schemas/`, also `product-check schema <name>`). The results embed
standalone sub-documents (`scan-contract`, `pop-coverage`, `scorecard`, `blueprint`, `release-verdict`) that validate
on their own, and work packets are plain JSON objects (also rendered as Markdown) that any coding agent can consume.
Stable IDs (`PCF-…` findings, `WP-PC-…` packets, `PC-…` controls) let another system track items across runs.

`product-check spec` writes `as-built-spec.json` (schema `as-built-spec.schema.json`; stable `SRF-…` surface IDs)
and a Spec Kit `specs/000-as-built/spec.md`. Spec Check reads the Markdown, and its report comes back in through
`--spec-check`, which closes the loop from code to spec to PC-C-10.

## CrewPE (optional)

CrewPE is EnWithAI's commercial engineering-lifecycle product. It could orchestrate Product Check runs and consume the
results and work packets in governed workflows. **No such integration exists today**, and Product Check does not
need CrewPE for anything.

## CI usage

```bash
npx product-check run --repo . --test-results junit.xml --npm-audit npm-audit.json --fail-on NOT_READY
```

Upload `.product-check/` as a build artifact. A GitHub Action is not part of this release.
