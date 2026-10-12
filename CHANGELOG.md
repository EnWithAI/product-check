# Changelog

All notable changes are documented here. The format follows Keep a Changelog; versions follow SemVer (pre-1.0: minor
versions may break the results schema, which carries its own `schema_version`, and the rubric, which carries
`rubric_version`).

## Unreleased

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
