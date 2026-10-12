# Changelog

All notable changes are documented here. The format follows Keep a Changelog; versions follow SemVer (pre-1.0: minor
versions may break the results schema, which carries its own `schema_version`, and the rubric, which carries
`rubric_version`).

## Unreleased

## 0.1.0-alpha.0 — not released

First alpha candidate.

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
