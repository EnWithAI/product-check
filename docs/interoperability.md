# Interoperability

Product Check has no runtime dependency on any other tool or service. Integration is through files.

## Inputs Product Check reads

| Artifact                                                                                      | Flag              | Used for                                                                                 |
| --------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| JUnit XML (Vitest, Jest via jest-junit, Playwright, pytest, Go, Node `--test-reporter=junit`) | `--test-results`  | PC-T-03, PC-C-08 (end-to-end detection by path/name), any control via `control_mappings` |
| Jest/Vitest JSON reporter output                                                              | `--test-results`  | same                                                                                     |
| `npm audit --json` (npm 7+)                                                                   | `--npm-audit`     | PC-S-15                                                                                  |
| HAR (browser DevTools export)                                                                 | `--har`           | application controls, offline                                                            |
| Product Check observations                                                                    | `--observations`  | application controls, offline replay                                                     |
| Spec Check report, schema 1.0 (`spec-check check --format json`)                              | `--spec-check`    | PC-C-10 (requirements testable)                                                          |
| Impact Check report, schema 2.0 (`impact-check --format json`)                                | `--impact-check`  | PC-T-12 (release-candidate change impact)                                                |
| Outcome Check report, schema 1.0 (`outcome-check report --format json`)                       | `--outcome-check` | PC-T-15 (delivery stability: CI first-pass rate, revert rate)                            |

The sibling-report importers read only documented fields (`schema_version`, `findings[].severity`,
`requirements`, `affected_modules`, `test_candidates`, `repo_revision.commit`, `metrics[id].segments.all`) and
reject other schema versions instead of guessing. They were checked against the sibling repositories' own schemas
and example outputs at the time of writing.

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
