# Architecture

TypeScript (strict, ESM), Node.js 22/24/≥26, **no runtime dependencies**. The same conventions as the other
Engineering Commons tools (Impact Check, Spec Check, Outcome Check): `run(argv, io)` CLI seam, documented exit codes,
deterministic output, escaping and redaction modules, SPDX headers, a single `check:all` gate.

```text
CLI (src/cli)                       parse flags → contract → safety gate → pipeline → write renderings
 │
 ├─ contract/         scan contract defaults, loading, flag overrides; safety.ts decides permissions (exit 4)
 ├─ run.ts            the pipeline below; returns one Results document
 │
 │  SCAN      discovery/repo.ts      read-only snapshot: no symlinks, size/depth/file caps, ignored files not read
 │            discovery/git.ts       HEAD, refs, packed-refs and index parsed from .git (no git process)
 │            discovery/gitignore.ts .gitignore semantics (inference for untracked files)
 │            inspectors/source/     facts: manifests, tests, CI, frameworks, data, auth, AI, hosting, pages
 │            inspectors/http/       observe.ts (pure parsing) · fetch.ts (the ONLY network module)
 │            importers/har.ts       HAR → observations (offline app evidence)
 │            discovery/pops.ts      point-of-presence inventory
 │  TEST      importers/tests.ts     JUnit XML, Jest/Vitest JSON (executed elsewhere)
 │            importers/reports.ts   npm audit; Spec/Impact/Outcome Check reports
 │  VALIDATE  validation/catalog.ts  47 controls (rubric pc-rubric-0.1), gates, remediation knowledge
 │            validation/*-evaluators.ts   source / application / import evaluators
 │            validation/engine.ts   merge outcomes → validations + findings (stable IDs)
 │            scoring/score.ts       pillar scores, coverage, confidence, caps, gates (pure)
 │            scoring/verdict.ts     release verdict rules (pure)
 │  RETEST    validation/retest.ts   lifecycle across runs, baseline evidence preserved, PC-T-16 regressions
 │  BLUEPRINT blueprint/build.ts     as-is/to-be, remediations, work packets, test architecture, traceability
 │
 ├─ reporting/markdown.ts            report.md, blueprint.md, work-packets/*.md
 ├─ dashboard/render.ts (+ /dashboard assets)   self-contained dashboard.html
 ├─ validation/integrity.ts          schema + references + recomputation (used by validate and the dashboard)
 └─ schema/validator.ts              built-in JSON Schema 2020-12 subset validator (cross-checked with Ajv in tests)
```

## Data flow and contracts

- **Input:** a scan contract (`schemas/scan-contract.schema.json`), built from flags or a file.
- **Output:** `product-check-results.json` (`schemas/product-check-results.schema.json`), which embeds the contract,
  PoP coverage, evidence, validations, findings, scorecard, blueprint, verdict, comparison and history. Each embedded
  part also validates against its own schema.
- **Determinism:** IDs are hashes of stable content (control + fingerprint for findings; kind + locator + checksum
  for evidence). Paths are made relative to the working directory before hashing. With `SOURCE_DATE_EPOCH` the
  clock is fixed, so outputs are byte-reproducible (the demo test relies on this).

## Extension points (stable interfaces, no plugins loaded at runtime)

- **Evaluators** are functions `(EvalContext) => Outcome | null` keyed by control ID. A new adapter (browser journeys,
  API conformance, AI evals, telemetry) adds facts to the context and evaluators for the controls it can check. It
  must return `null` when it did not run, so no adapter can appear to have run when it has not.
- **Importers** turn artifacts produced elsewhere into typed summaries plus evidence.
- **Control mappings** in the contract link any executed test to any control without code changes.

## Directory layout and deviations from the brief

The brief proposed `src/product-check/<module>/` and `tests/`. The sibling repositories use `src/<module>/` and `test/`,
so Product Check follows them (the brief asked to follow established conventions). Dashboard assets live in
`dashboard/` as the brief proposed; the renderer is `src/dashboard/render.ts`.
