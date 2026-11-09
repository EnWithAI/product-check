# Implementation audit: CT3 v3.2 vibe-code review and verified closure

_Product Check 0.2.0 + unreleased changes on branch `feat/ct3-v3.2-vibe-code-closure` · results schema 0.1.0
(unchanged) · assurance schema 0.1.0 · methodology CT3 v3.2 · audited 2026-11-08 on macOS, Node v25.9.0 (outside the
declared engines 22/24/≥26; CI has not run on this branch because nothing was pushed)._

Inputs: the CT3 v3.2 canonical master (additive to v3.1: three new sections, `upgrade_lineage_v3_2`,
`vibe_code_review_and_closure_v3_2`, `closure_contract_v3_2`; no v3.1 key removed) and the Product Check v3.2 upgrade
brief. Design: [docs/vibe-code-assurance.md](docs/vibe-code-assurance.md).

## Verdict

**Ready for internal use and review; not ready to release.** The end-to-end path the brief defines as done works
and is tested: point Product Check at a controlled sample repo, get real findings with evidence, a prioritized
blueprint with fix packets, apply a patch, run targeted and regression validation at the exact commit, and get a
verifiable closure record with signed human approvals, offline and without EnWithAI credentials. Before a 0.3.0
release: a human review of the safety-model change (opt-in process execution), CI on Node 22/24/26 (and a first run
on Windows), a version bump, and the publication decisions listed at the end.

## Evidence

| Command                                     | Result                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check:all`                         | exit 0: typecheck, ESLint, Prettier, build, **143 tests passed (8 files)**; lines 92.84%, statements 90.56%, branches 77.73%, functions 92.84%                                                                                                                                                                                       |
| existing suite                              | the 121 pre-existing tests pass; one was deliberately changed (the security test now allows `node:child_process` in `src/exec/process.ts` only) and two security tests added (scan modules and the library entry Commons Check imports never reach it); the committed demo outputs and dashboards are still byte-identical (A8, A10) |
| `test/assurance.test.ts`                    | 20 tests: units, register invariants, M5 end-to-end fixtures, adapters, gate decisions                                                                                                                                                                                                                                               |
| `node scripts/license-audit.mjs`            | production: 1 package (`yaml`, ISC); no new dependency                                                                                                                                                                                                                                                                               |
| `npm pack --dry-run`                        | 171 files, 263.6 kB (new: `src/assurance`, `src/exec`, 10 schemas, 2 dashboard assets)                                                                                                                                                                                                                                               |
| `node examples/closure-demo/run-demo.mjs`   | exit 0; full workflow with real executions; transcript in `examples/closure-demo/demo-transcript.txt`                                                                                                                                                                                                                                |
| adapters on the siblings' real demo reports | Impact Check 2.0 (1 high, 8 modules), Spec Check 1.0 (6 requirements, 4 gaps), Outcome Check 1.0 (CI first-pass 0.8, revert 0.0135) parsed correctly                                                                                                                                                                                 |
| dashboard in a browser                      | renders from the demo JSON at desktop width and at 375 px (no horizontal scroll); tabs work under the hash-pinned CSP                                                                                                                                                                                                                |

Defects found and fixed while building (each now covered by a test): the object-authorization rule was disproven by
its own re-check (it used the line-rule path); a removed `import` of an auth helper was reported as a removed auth
check; the release gate used a stale scan's verdict against a newer HEAD; findings from an unmerged branch's review
blocked `main`; after-results were re-read relative to the process directory.

## Scenario coverage (brief M5)

| Fixture                                    | Expected                                                                                                  | Test                                  | Result |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| Insecure sample app                        | client-side live key is a CONFIRMED P0 with evidence                                                      | e2e "insecure app → …"                | pass   |
| Faulty patch that passes superficial tests | key moved to another file; repro test passes; verify FAIL, back to IN_PROGRESS                            | same                                  | pass   |
| Correctly fixed patch                      | verify PASS at the exact SHA; wrong HEAD refused; dirty tree INCONCLUSIVE; no `--allow-exec` INCONCLUSIVE | same                                  | pass   |
| Closure                                    | refused without approvals; bot, stale and implementer approvals rejected; closing actor must be a signer  | same                                  | pass   |
| Regression                                 | re-introduced key → REGRESSED with closure history kept                                                   | same                                  | pass   |
| Safe documentation-only PR                 | LOW risk, waiver applied by policy, gate PASS                                                             | e2e "change reviews …"                | pass   |
| Dangerous auth change                      | HIGH, 2 approvals, BLOCK; auth removal CONFIRMED; IDOR CORROBORATED                                       | same                                  | pass   |
| False positive / missing evidence          | AI claims on a missing file or line DISPROVEN; uncorroborated claim → triage, not blocking                | same                                  | pass   |
| Stale approval after a new commit          | both approvals STALE; gate CONDITIONAL                                                                    | same                                  | pass   |
| Missing access                             | blocked application PoP and zero executed checks → UNKNOWN / INSUFFICIENT EVIDENCE                        | e2e "missing access …"                | pass   |
| Cycle limit                                | escalated after the limit; human review packet; further fixes refused                                     | e2e "review loops stop …"             | pass   |
| Tampering                                  | edited register refused (exit 5); edited/removed evidence lines detected                                  | "register invariants", "evidence log" | pass   |

## Capability status

Legend: **Done** = implemented, exercised by tests or the demo · **Partial** = works with stated limits ·
**Unsupported** = not implemented (reported as such, never as PASS).

### Workflow and phases

| Capability                                               | Status      | Notes                                                                                                                              |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| VC-P0 baseline (REPO_BASELINE, DEPLOYED_APP, HYBRID_360) | Done        | existing `run`; unchanged                                                                                                          |
| VC-P1 author-side proof (PRE_PR_LOCAL)                   | Done        | `proof`; only policy-declared commands, `--allow-exec`; detected scripts are suggestions only                                      |
| VC-P2 layered independent review (PR_DIFF)               | Partial     | six lanes are deterministic pattern rules on changed code, JS/TS-centred; no semantic or data-flow analysis; no browser/API checks |
| VC-P2 independent verification of findings               | Done        | re-read at the exact commit, runtime evidence, second signal; states per the methodology                                           |
| VC-P3 risk routing and approvals                         | Done        | surface-based classifier, protected paths, domain owners, LOW waiver, Ed25519 approvals bound to commits                           |
| VC-P4 blueprint and fix packets                          | Done        | packets for verified P0–P2; Mermaid as-is/to-be; commands only when declared                                                       |
| VC-P5 closure verification (RETEST)                      | Done        | targeted + regression at the exact SHA; before/after evidence retained                                                             |
| VC-P6 merge and release (RELEASE_GATE)                   | Partial     | release gate with approval staleness and ancestry; **no** latest-base merge simulation, merge queue or staged rollout execution    |
| VC-P7 learn and assure                                   | Partial     | regression corpus run by every verify; false-positive and regression counts; no incident import format, no `human_minutes`         |
| POST_RELEASE_WATCH                                       | Unsupported | no telemetry, canary or incident feed; shown as NOT_SUPPORTED                                                                      |
| v3.2 scan-mode names as a CLI enum                       | Partial     | modes map to commands (`run`, `proof`, `review`, `verify`, `gate`); results keep the 0.1.0 `SOURCE/APPLICATION/HYBRID` modes       |

### Evidence and integrity

| Capability                                                                | Status      | Notes                                                                                            |
| ------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| Executed-command evidence (argv, exit, duration, env, digests, commit)    | Done        | full output never stored; redacted 400-character tail                                            |
| Append-only, hash-chained `review-evidence.jsonl`                         | Done        | tamper detection on load; appends refused when the chain is broken                               |
| Hash-chained closure transitions + invariant re-check                     | Done        | `checkRegister` on every load                                                                    |
| Referential integrity (finding → fix → verification → approval → closure) | Done        | checked in `checkRegister`; release gate records input digests                                   |
| Facts vs inferences vs hypotheses                                         | Done        | `epistemic` on every finding; hypotheses cannot block without corroboration                      |
| Absence findings (for example "no CI file")                               | Partial     | their evidence has no checksum to re-read, so they stay EVIDENCE_COLLECTED and get no fix packet |
| Concurrent CLI invocations on one workspace                               | Unsupported | no file locking; run assurance commands sequentially                                             |

### Human accountability

| Capability                              | Status      | Notes                                                                                          |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Bots and agents cannot fill human slots | Done        | NOT_HUMAN; agents record fixes as `--actor-type agent`                                         |
| A typed approver name is not proof      | Done        | `approve` requires a key; `close --approver` only selects among valid signed approvals         |
| Approvals invalidated by new commits    | Done        | STALE when `reviewed_sha` differs from the commit under review                                 |
| Identity of the human behind a key      | Partial     | proves key possession, not that a person used it; key custody is the operator's responsibility |
| Import of GitHub/GitLab PR approvals    | Unsupported | approvals must be signed with `product-check approve`                                          |
| Fix-packet owner assignment             | Partial     | `owner.id` is null until assigned outside Product Check; accountable human is required         |

### Dashboard (`dashboard/index.html`)

| Panel (brief §9)                                               | Status                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C/T/T scores each with coverage and confidence                 | Done                                                                          |
| Inspected vs blocked by PoP and lifecycle tier; phases         | Done                                                                          |
| Baseline product verdict vs current change gate                | Done                                                                          |
| Findings by severity, verification, owner, age; filters        | Done                                                                          |
| Awaiting corroboration, disproven claims, false-positive trend | Done (counts; no time series)                                                 |
| Closure funnel, cycles to verified fix, escalations            | Done                                                                          |
| Risk/approval gate, stale approvals, accepted-risk expiry      | Done                                                                          |
| Test execution, verification runs, regression corpus           | Done                                                                          |
| Merge verification and rollout watch                           | Unsupported (shown as NOT SUPPORTED)                                          |
| As-is/to-be Mermaid and backlog                                | Partial (Mermaid source shown, not rendered: the page loads nothing external) |
| Agent export without sensitive evidence                        | Done (IDs only; no excerpts or output)                                        |
| UNKNOWN / INSUFFICIENT EVIDENCE when nothing ran               | Done (tested)                                                                 |
| Integrity banner on tampered inputs                            | Done                                                                          |

### Integrations

| Repository    | Status                  | Notes                                                                                                                 |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Impact Check  | Done                    | adapter for 2.0; raises risk; no dependency, no engine copied; sibling repo untouched                                 |
| Spec Check    | Partial                 | adapter for 1.0; gaps on changed spec files; requirement-to-diff traceability not done                                |
| Outcome Check | Partial                 | adapter for 1.0; delivery signals as notes only (by design not a score)                                               |
| CrewPE        | Unsupported (by design) | fix packets and agent export are consumable; no integration exists                                                    |
| Commons Check | Compatible, not changed | its 14 tests pass against a packed build of this branch; integration deferred until 0.3.0 is on npm (workspace D-114) |

### Safety

| Rule                                                                                   | Status                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Scan pipeline never executes code                                                      | Done (test: scan modules never import the process module)                                        |
| Processes only in `src/exec/process.ts`                                                | Done (security test + ESLint)                                                                    |
| Execution only with `--allow-exec`, only declared commands, argv without a shell       | Done                                                                                             |
| Hardened read-only git (no hooks, fsmonitor, ext-diff, textconv, pager, system config) | Done                                                                                             |
| Sandboxing of executed commands                                                        | Unsupported: commands run with the operator's permissions; use a container/CI for untrusted code |
| Windows                                                                                | Not tested                                                                                       |

## Compatibility

- `product-check-results.json` schema 0.1.0, rubric `pc-rubric-0.2`, scan contract, all existing commands, flags,
  exit codes and outputs are unchanged. Results from 0.1.0/0.2.0 load as the baseline of the new workflow.
- `scan` keeps its discovery meaning; the brief's `scan --mode hybrid --out` maps to `run`. `blueprint`,
  `dashboard` and `gate` accept `--from`. Positional forms behave as before.
- New artifacts are versioned separately (assurance schema 0.1.0, `methodology_version: "CT3 v3.2"`).

## Decisions for the product sponsor (before any publication)

1. **Approve the safety-model change** (opt-in process execution in `proof`/`verify`), now documented in README,
   SECURITY-related docs and CLAUDE.md. Until approved, keep it on this branch.
2. **Public wording of the methodology**: the docs name "CT3 v3.2" and describe its concepts in our own words; the
   canonical master is not copied. Confirm this is publishable, as was done for v3.1 on 2026-10-12.
3. **The article reference** in REFERENCES.md (inspiration only, no endorsement implied): keep or remove.
4. Version (0.3.0 suggested; additive) and whether `examples/closure-demo/output` (non-deterministic) should be
   committed or generated on demand.
