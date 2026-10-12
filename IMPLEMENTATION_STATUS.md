# Implementation status

_Product Check 0.1.0-alpha.0 · results schema 0.1.0 · rubric pc-rubric-0.1 · 2026-10-12_

**State: released alpha.** 0.1.0-alpha.0 published 2026-10-12: GitHub `EnWithAI/product-check` (CI green on Node
22/24/26), pre-release `v0.1.0-alpha.0`, npm `@enwithai/product-check` (`alpha` and `latest`).
License: **MIT** (decided by the product sponsor on 2026-10-12, same as the other Commons tools); `LICENSE`, `package.json`
and SPDX headers updated accordingly. Release decisions recorded in §5.

## 1. Design brief (as built)

**Question.** Does this software work for its intended users, can it be trusted, and what needs to improve?

**Features.** CLI (`run`, `retest`, `scan`, `init`, `validate`, `report`, `blueprint`, `dashboard`, `controls`,
`schema`); read-only source inspection; authorized passive HTTP probe and optional exposure probe; HAR and recorded
observation replay; importers for JUnit XML, Jest/Vitest JSON, `npm audit`, Spec Check 1.0, Impact Check 2.0,
Outcome Check 1.0; contract `control_mappings`; 47 controls in three pillars over tiers CT-T0…T6; three hard gates;
scoring with coverage/confidence/caps/withholding; verdict rules with risk acceptance; blueprint with work packets and
regression-test candidates; retest with stable IDs and preserved evidence; JSON Schemas for every artifact with a
built-in validator plus integrity/recompute checks; self-contained dashboard.

**Non-goals (this release).** Browser automation, credentialed or authenticated testing, active security scanning,
API conformance testing, telemetry ingestion, AI model evaluation, code modification, hosted service, GitHub Action,
composite scores, legal or compliance determinations.

**Module contracts.** See [docs/architecture.md](docs/architecture.md). Evaluators are `(EvalContext) => Outcome | null`;
returning `null` means "did not run", so no adapter can appear to have run when it has not. Scoring and verdict are
pure functions of validations and findings.

**Versions.** Package `0.1.0-alpha.0`; results schema `0.1.0` (`schemas/*.schema.json`, JSON Schema 2020-12);
rubric `pc-rubric-0.1`; methodology recorded separately as `CT3`, relationship `inspired`, reference "CLEAR CT v3.1
(unpublished; principles only)".

**Safety model.** [docs/safety-and-authorization.md](docs/safety-and-authorization.md): prohibited actions are
refused whatever the contract says; network needs scope + attestation + explicit flag; passive fixed GETs only; no
repository code executed; ignored files never read; refusals produce an ABORTED record (exit 4).

## 2. Acceptance checklist (brief §13) — all automated

| #   | Criterion                                                       | Where                                                                                             | Result |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| 1   | Every sample JSON matches its schema                            | `acceptance.test.ts` A1 (Ajv strict **and** built-in validator, plus `validate`)                  | pass   |
| 2   | Repo-only scan does not imply UI/production validation          | A2; `examples/repo-only`                                                                          | pass   |
| 3   | Blocked PoP reduces coverage, represented honestly              | A3                                                                                                | pass   |
| 4   | Critical trust gate blocks READY despite high C/T scores        | A4 (rules and end-to-end)                                                                         | pass   |
| 5   | Missing evidence prevents fabricated PASS                       | A5 (constructor guard, schema, integrity + recompute)                                             | pass   |
| 6   | Stable IDs and evidence linkage on retest                       | A6 (+ UNVERIFIED carry-over, CT-T6 regression test)                                               | pass   |
| 7   | Work packets reference valid findings and measurable criteria   | A7                                                                                                | pass   |
| 8   | Dashboard figures derived from results JSON                     | A8 (scores read from JSON; patched score flagged; committed dashboards equal fresh renders)       | pass   |
| 9   | Unsafe request rejected or needs explicit, scoped authorization | A9 (9 refusal cases, ABORTED record)                                                              | pass   |
| 10  | Demo works locally from a fresh clone with documented commands  | A10 (regenerates the app with git, reruns the documented commands, compares to committed outputs) | pass   |

## 3. Commands run and results (2026-10-12, macOS, Node v25.9.0, npm 11.12.1)

Node 25 is outside the declared `engines` range (22/24/≥26). CI on GitHub passed on Node 22, 24 and 26.

| Command                                                                                                                                  | Result                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install --ignore-scripts` (pinned dev dependencies, same versions as the sibling repos)                                             | 148 packages; EBADENGINE warning for Node 25 only                                                                                                                               |
| `npm run check:all`                                                                                                                      | exit 0: typecheck, ESLint, Prettier, build, **94 tests passed (5 files)**; coverage lines 93.67%, statements 91.48%, branches 78.27%, functions 96.19% (thresholds 80/70/80/80) |
| `node scripts/license-audit.mjs --all`                                                                                                   | 41 dev packages: MIT 39, BSD-3-Clause 1, Apache-2.0 1; disallowed 0; **no runtime dependencies**                                                                                |
| `npm pack --dry-run`                                                                                                                     | 103 files, 141.4 kB                                                                                                                                                             |
| clean install of the packed tarball in an empty directory, then `product-check --version`, `run --repo <copy of spec-check>`, `validate` | 1 package added; all three succeeded                                                                                                                                            |
| `npm run build && npm run demo`                                                                                                          | regenerates `examples/`; requires git; live part probes `127.0.0.1:4785` only                                                                                                   |
| `product-check validate examples/**/product-check-results.json examples/vibe-app-demo/inputs/*.json`                                     | all OK (schema, references, recompute)                                                                                                                                          |
| Dashboard in a browser (desktop and 375 px)                                                                                              | five views render; tabs/filters work under the hash-pinned CSP; no horizontal page scroll at 375 px                                                                             |

### Demo results (committed in `examples/`)

| Run                                                        | Verdict                      | Customer         | Technology        | Trust            | Open P0/P1/P2/P3 |
| ---------------------------------------------------------- | ---------------------------- | ---------------- | ----------------- | ---------------- | ---------------- |
| Vibe Notes baseline (HYBRID, CT-T2)                        | NOT_READY (G-SECRETS failed) | 40 (77%, MEDIUM) | 4 (80%, MEDIUM)   | 2 (67%, MEDIUM)  | 8 / 1 / 16 / 12  |
| Vibe Notes retest (after fix commit, 5 executed app tests) | READY_WITH_CONDITIONS        | 100 (92%, HIGH)  | 94 (100%, MEDIUM) | 97 (83%, HIGH)   | 0 / 0 / 2 / 0    |
| Same weak source, SOURCE mode only                         | NOT_READY                    | not scored (38%) | 4 (80%)           | not scored (42%) | —                |
| Unauthorized APPLICATION scan                              | ABORTED → INCONCLUSIVE       | —                | —                 | —                | —                |

Retest: 35 findings verified fixed (control re-checked with new evidence), 0 new, 0 reopened, 0 regressions.

### Dogfooding on real repositories (read-only, ALPHA stage, no network)

| Repository    | Verdict      | Technology | Trust | Notes                                                                           |
| ------------- | ------------ | ---------- | ----- | ------------------------------------------------------------------------------- |
| product-check | INCONCLUSIVE | 95         | 50    | P2 hypotheses for deliberate fakes in tests/examples; no imported test results  |
| impact-check  | INCONCLUSIVE | 100        | 72    | two fake tokens in `test/markdown.test.ts` reported as P2 hypotheses for review |
| spec-check    | INCONCLUSIVE | 100        | 89    | `.gitignore` does not cover `.env` (P3); acceptance results not imported (P3)   |
| outcome-check | INCONCLUSIVE | 100        | 89    | same as spec-check                                                              |

INCONCLUSIVE is the correct verdict for a repository-only scan of a CLI: Customer cannot be scored without a running
product, and the secrets gate cannot be verified without the deployed exposure check. (`product.has_user_accounts:
false` in a contract makes the authorization gate not applicable for such tools.)

The first dogfood run found **real false positives**, fixed with regression tests: CI test detection did not follow
`npm run check:all` script chains; the README check expected web-app run commands; deliberate fake credentials in
test/fixture/example paths were P0 facts (now P2 hypotheses that do not fail the gate); a JavaScript identifier named
`PUBLIC_SECRET` matched the SvelteKit prefix rule (now needs an env context); Product Check's own result files were
scanned; `test/acceptance/` was not recognized as end-to-end. Development also caught: a JUnit parser bug (Node's
reporter puts `<testcase>` directly under `<testsuites>`), a retest ordering bug (a resolved regression finding was
left UNVERIFIED), a malformed manifest being reported as "no manifest", and literal invisible characters in three
source files (caught by the Trojan-Source test).

## 4. Unsupported or incomplete (honest gaps)

| Area                                             | Status                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser journeys (onboarding, critical journeys) | Not implemented. PC-C-09 and journey evidence come only from imported executed tests (control mappings).                                                                               |
| Authorization and tenant-isolation testing       | Not performed by Product Check (never logs in). PC-S-13/14 need the user's executed tests.                                                                                             |
| Production telemetry (CT-T4/T5)                  | No adapter. PC-C-11 and PC-T-14 are always NOT_TESTED; the observability PoP is BLOCKED at T4+.                                                                                        |
| API definitions                                  | Inventoried as a PoP only; no API conformance controls.                                                                                                                                |
| AI behaviour                                     | Static checks only (client-side SDK use, eval suite presence); PC-AI-03 needs mapped executed evals.                                                                                   |
| Ecosystems                                       | Source checks are strongest for JavaScript/TypeScript (Next.js, Vite, CRA, Express…). Python manifests are read; unbounded-version checks are npm-only. No Go/Rust/Java/PHP specifics. |
| Remote repositories                              | A local checkout is required; there is no GitHub API fetch.                                                                                                                            |
| Secret detection                                 | Format/pattern based with redaction; can miss unusual formats; validity is never tested.                                                                                               |
| `.gitignore` semantics                           | Common syntax only; used for untracked files (labelled inference). Tracked state comes from the git index (v2–v4); SHA-256 object-format repositories are not handled.                 |
| Response timing (PC-C-07)                        | One sample from the scanning machine; low confidence by design.                                                                                                                        |
| GitHub Action, SARIF output, plugin loading      | Not implemented. Extension is by adding evaluators/importers in code.                                                                                                                  |
| Built-in schema validator                        | Supports the keyword subset the bundled schemas use; unsupported keywords are rejected at load. Ajv cross-checks in tests.                                                             |
| CI                                               | Workflow written, never executed (no remote).                                                                                                                                          |

## 5. Release checklist (stop: every item needs a human decision)

- [x] **License:** MIT (2026-10-12). `LICENSE` added, package.json `license: MIT`, `private` removed, SPDX identifiers on
      all first-party source files.
- [x] **CLEAR attribution wording** approved for publication by the product sponsor (2026-10-12), relationship
      `inspired`, including public use of the CT-T0…T6 tier labels and verdict aliases.
- [ ] TRACE relationship stays `not-assessed` until a specification exists (HR-5).
- [x] Copyright holder EnWithAI Technologies; maintainer and security contact Koushik Ramani, as for the other tools.
- [x] `@enwithai/product-check` free on npm and `EnWithAI/product-check` free on GitHub (checked 2026-10-12). No formal
      trademark search was done (as for the other tools; names are descriptive and not claimed as marks).
- [x] Repository creation (`EnWithAI/product-check`, public), first push with commits under the GitHub noreply
      address; CI green on Node 22/24/26; private vulnerability reporting enabled; topics.
- [x] Release tag `v0.1.0-alpha.0` with built `dist/` and a GitHub pre-release.
- [x] npm publication 2026-10-12 (`alpha` and `latest` → 0.1.0-alpha.0), tarball shasum
      `90669a43bb94ed82b4a8d32507de279501839231` identical to the tag build, verified by a clean registry install.
- [x] `0.0.0-stage` placeholder left by npm staged publishing deprecated by the user (2FA, 2026-10-12), as for the
      siblings.
- [ ] Not separately performed: an independent human review of control wording/severities and of the demo outputs.
      The release was approved on the basis of this status report.

## 6. Reproduce this report

```bash
npm ci --ignore-scripts
npm run check:all
node scripts/license-audit.mjs --all
npm pack --dry-run
npm run build && npm run demo && git status --short examples/   # no changes expected
```
