# Changelog

All notable changes are documented here. The format follows Keep a Changelog; versions follow SemVer (pre-1.0: minor
versions may break the results schema, which carries its own `schema_version`, and the rubric, which carries
`rubric_version`).

## Unreleased

## 0.2.0 — 2026-10-28

Commons integration and the first CT-T4 controls. Rubric `pc-rubric-0.2` (51 controls; scoring rules unchanged);
results schema `0.1.0`, additive. Results and baselines written by 0.1.0 still validate and load.

- CT-T4 operational imports ([docs/operational-imports.md](docs/operational-imports.md)): `--openslo` (OpenSLO v1
  YAML/JSON, repeatable), `--alert-rules` (Prometheus/Mimir rule files, `PrometheusRule`, `/api/v1/rules` JSON,
  repeatable) and `--service-graph` (Jaeger `/api/dependencies`, `traces_service_graph_request_total` query result).
  New controls PC-T-18 (SLOs complete), PC-T-19 (every SLO alerted on), PC-T-20 (declared dependencies observed at
  runtime, with `--architecture-check`); PC-T-14 is now evaluated from these files; the observability PoP is
  AVAILABLE when they are given.
- First runtime dependency: `yaml` 2.9.1 (ISC, pinned), used only through `src/parse/yaml.ts` (core schema, unique
  keys, at most 100 aliases, 10 MiB per file).
- `--architecture-check <report.json>` (contract `imports.architecture_check`) imports an Architecture Check report
  (schema 1.0 or 1.1, `analyze`/`check` output). New control **PC-T-17 "Architecture model matches the code"**
  (technology, CT-T3, weight 1, P2): PASS with no verified drift of medium severity or above, PARTIAL with one
  `architecture-drift` finding otherwise, NOT_TESTED without a report. Hypotheses and unknowns never count. Rules in
  `docs/interoperability.md`.
- Rubric `pc-rubric-0.2` (48 controls; scoring rules unchanged). The scorecard schema accepts `pc-rubric-0.1` and
  `pc-rubric-0.2`, and integrity recomputation keeps the stored version, so 0.1.0 results still validate and load as
  retest baselines. Results schema stays `0.1.0`; `imports.architecture_check` is optional in the contract schema.
- `product-check spec`: reverse-engineers an as-built specification from a repository (pages, endpoints, data
  entities, integrations, configuration names, auth boundaries, test titles) with evidence for every item. It writes
  `as-built-spec.json` (new schema `as-built-spec.schema.json`) and a Spec Kit `specs/000-as-built/spec.md` that Spec
  Check can lint. Intent that code cannot show is left as `[NEEDS CLARIFICATION]`. Source only; nothing executed.
- `run`/`retest` derive the as-built spec from the same snapshot. The blueprint embeds it as the new optional field
  `as_is.as_built`, and `as-built-spec.json` plus `specs/000-as-built/spec.md` are written next to the report
  (`blueprint --out-dir` re-renders them). Traceability now names the as-built requirement a finding touches
  (`As-built FR-002; requirement PC-…`): pages, endpoints and entities match by file, integrations and configuration
  only by exact line, and application URLs by path. Scores, verdicts and findings are unchanged.
- Schema: additive, still `0.1.0`. Existing contracts, observations and baselines remain valid. Results that carry
  `as_is.as_built` do not validate with the schemas bundled in 0.1.0 and earlier.
- Dashboard: a sixth view, **As-built spec**, shows the discovered surface, the questions only a person can answer,
  user stories, and every FR/NFR/SC/EC item with its certainty, source, evidence and linked findings (open or fixed),
  with type, certainty and text filters. It is rendered from the results JSON like every other view.
- Demo: the baseline, retest and repository-only examples include the as-built spec, and
  `examples/vibe-app-demo/output/as-built/` holds the standalone `spec` output. Both are checked against a fresh run.

## 0.1.0 — 2026-10-12

First release without a pre-release suffix, so `npm install @enwithai/product-check` and `npx @enwithai/product-check` work without a
tag. No functional changes from 0.1.0-alpha.0. Still pre-1.0: the report schema and command options may change in minor
versions.

## 0.1.0-alpha.0 — 2026-10-12 (published to npm)

First alpha. MIT licensed.

- `product-check run|retest|scan|init|validate|report|blueprint|dashboard|controls|schema`.
- Scan → Test → Validate → Blueprint → Dashboard → (advisory) Remediate → Retest, recorded per run.
- 47 controls across Customer, Technology and Trust, lifecycle tiers CT-T0…CT-T6 with carry-forward, three hard gates.
- Source inspection (read-only; git metadata parsed without running git; ignored files never read), passive HTTP
  probe (authorized origin only; optional exposure probe), HAR and recorded-observation replay.
- Importers: JUnit XML, Jest/Vitest JSON, `npm audit --json`, Spec Check 1.0, Impact Check 2.0, Outcome Check 1.0;
  contract `control_mappings` link executed tests to any control.
- Scoring with coverage, confidence, caps and withheld scores; verdict rules; risk acceptances (never for P0).
- Blueprint with as-is/to-be, remediations, work packets, regression-test candidates, test architecture, traceability.
- Retest with stable finding IDs, preserved baseline evidence, RESOLVED only with new evidence, PC-T-16 regressions.
- JSON Schemas (2020-12) for every artifact; built-in validator plus integrity/recomputation checks.
- Self-contained dashboard (five views, light/dark, accessible, hash-pinned script).
- Synthetic Vibe Notes demo with baseline, retest, repository-only and aborted examples.
