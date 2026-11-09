# Vibe-code review and verified closure (CT3 v3.2)

Product Check answers: _does this vibe-coded application achieve what it is for, does it behave correctly, can
people trust it, what exactly should change, and can we prove closure?_ This layer adds the mechanics of review and
closure on top of the whole-product scan. Its rule: **a generated fix is not a resolved finding, a proposed fix is
not a verified fix, a passed PR is not a production-ready product, and a high score never overrides a hard gate.**

Status of every part: [IMPLEMENTATION_AUDIT_v3.2.md](../IMPLEMENTATION_AUDIT_v3.2.md).

**Attribution.** The phase model, verification states, closure state machine and release conditions were
_inspired by_ NetworkGain Consulting's CLEAR CT method, v3.2 (internal and unpublished). Relationship `inspired`
under the Engineering Commons attribution standard: no text, catalog or prompt is reproduced, and there is no
structural relationship. "CT3 v3.2" in artifact fields (`methodology_version`) names the reference version only.

## Two separate axes

| Axis                    | Values        | Meaning                                                            |
| ----------------------- | ------------- | ------------------------------------------------------------------ |
| Lifecycle tiers (CT3)   | CT-T0 … CT-T6 | Which controls a product at this maturity must meet (unchanged).   |
| Execution phases (v3.2) | VC-P0 … VC-P7 | What was actually executed for review and closure. Never inferred. |

| Phase | Name                       | Command(s)                            | Output                                                     |
| ----- | -------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| VC-P0 | Intake and baseline        | `run` (unchanged)                     | `product-check-results.json`, PoP coverage, commit         |
| VC-P1 | Author-side proof          | `proof --allow-exec`                  | `proof-run.json` (executed commands, digests, environment) |
| VC-P2 | Layered independent review | `review`, `register`                  | `change-review.json`, verified findings in the register    |
| VC-P3 | Risk-routed gate           | `review`, `approve`                   | change gate, required/valid human approvals                |
| VC-P4 | Blueprint and repair       | `fix-packets`, `blueprint --from`     | `fix-packets/F-*.json`, `PRODUCT_CHECK_BLUEPRINT.md`       |
| VC-P5 | Closure verification       | `fix`, `verify --allow-exec`, `close` | verification runs, `VERIFIED_FIXED` / `CLOSED`             |
| VC-P6 | Merge and release          | `gate`, `assure`                      | `release-gate.json`, `PRODUCT_CHECK_RELEASE_GATE.md`       |
| VC-P7 | Learn and assure           | `learn`, `reject`, register history   | regression corpus, false-positive and regression trends    |

The release gate reports each phase as COMPLETED, PARTIAL, NOT_STARTED or NOT_SUPPORTED from the artifacts that
exist; VC-P6 is always PARTIAL (merge-queue simulation, canaries and live watch are not executed).

## Workflow

```bash
product-check run --repo . --out-dir .product-check                 # VC-P0 baseline (never executes code)
product-check register --repo .                                     # closure register; independent verification
product-check proof --repo . --policy ops/policy.json --allow-exec  # VC-P1 required checks at HEAD
product-check fix-packets --policy ops/policy.json                  # VC-P4 agent-ready packets
product-check transition --finding F-001 --to ACKNOWLEDGED --reason "…" --actor agent-1
product-check transition --finding F-001 --to IN_PROGRESS --reason "…" --actor agent-1
git commit …                                                        # the fix
product-check fix --finding F-001 --sha <fix-sha> --actor agent-1 --repro-cmd "node --test test/x.test.mjs"
product-check verify --finding F-001 --head <fix-sha> --policy ops/policy.json --allow-exec   # VC-P5
product-check approve --scope closure:F-001 --sha <fix-sha> --approver alice --key alice.key.pem
product-check approve --scope closure:F-001 --sha <fix-sha> --approver bob --key bob.key.pem
product-check close --finding F-001 --evidence VR-002 --approver alice --policy ops/policy.json
product-check review --repo . --base origin/main --head HEAD --policy ops/policy.json \
  [--impact-check impact.json] [--spec-check spec.json] [--outcome-check outcome.json] [--reviewer-findings ai.json]
product-check assure --policy ops/policy.json --fail-on NO_GO,UNKNOWN   # gate, reports, dashboard/index.html
```

`examples/closure-demo/run-demo.mjs` runs this whole sequence on a synthetic app; its transcript and outputs are
committed in `examples/closure-demo/`.

The brief proposed `product-check scan --mode hybrid --out …`. `scan` already exists (discovery only) and is kept
for compatibility; the baseline scan is `run`. `blueprint`, `dashboard` and `gate` accept `--from <results.json>`
as proposed.

## Policy (operator-owned)

`--policy <file>` (schema `assurance-policy.schema.json`) is never read implicitly from the scanned repository.

```json
{
  "policy_id": "acme-web",
  "required_checks": [{ "id": "unit", "argv": ["npm", "test"], "purpose": "test", "timeout_ms": 600000 }],
  "approvers": [
    { "id": "alice", "type": "human", "roles": ["security"], "public_key": "-----BEGIN PUBLIC KEY-----…" }
  ],
  "risk": {
    "protected_paths": [{ "pattern": "src/auth/**", "owners": ["alice"] }],
    "high_risk_paths": [],
    "low_risk_paths": [],
    "trusted_authors": ["dev@example.com"],
    "allow_low_risk_waiver": false,
    "approvals": { "LOW": 1, "MEDIUM": 1, "HIGH": 2 }
  },
  "review": { "max_cycles": 3, "fail_closed_unverified_p0": true },
  "release": { "rollback_plan": "docs/rollback.md", "staged_rollout": null }
}
```

`product-check keygen --approver alice --out-dir ~/.product-check-keys` creates an Ed25519 key pair and prints the
approver entry.

## Execution model (a deliberate change, opt-in only)

Through 0.2.0 Product Check never started a process. v3.2 requires actual build/test proof, so one module,
`src/exec/process.ts`, may start processes (tests and ESLint enforce that nothing else can):

- `execCommand` runs commands from the **policy** (`required_checks`), a **fix record** (`--repro-cmd`, declared by
  the implementer) or the **regression corpus** (`learn`). Never a detected script, never a command from the scanned
  repository's files. It runs only with `--allow-exec` on that invocation; otherwise every command is recorded as
  NOT_TESTED with the reason and the run is INCONCLUSIVE. Commands run as argv (no shell), with a reduced
  environment (allowlist), a timeout, an output cap, and only stdout/stderr digests plus a redacted 400-character
  tail are kept.
- `gitRead` runs read-only git plumbing (`rev-parse`, `diff`, `show`, `status`, `log`, `merge-base`) with hooks,
  fsmonitor, external diff/textconv drivers, pagers, system config and prompts disabled. Revisions are validated so
  a value can never be read as an option.

The scan pipeline (`run`, `retest`, `scan`, `spec`) is unchanged and never imports this module; its standing
prohibition `execute-repository-code` still holds for scans. **Running `--allow-exec` executes the repository's
code with your permissions: use it only on code you are willing to run** (a container or CI runner for untrusted
code).

## Finding verification (independent, before any block)

| Check                 | How                                                                        |
| --------------------- | -------------------------------------------------------------------------- |
| `evidence-present`    | the finding links evidence that exists                                     |
| `independent-reread`  | the cited file is read again at the exact commit (checksum or rule re-run) |
| `runtime-observation` | the evidence is an HTTP observation or an executed test                    |
| `second-signal`       | another lane or reviewer points at the same place (±5 lines)               |

fact + re-read/runtime → CONFIRMED; inference + re-read → CORROBORATED (CONFIRMED with a second signal);
hypothesis → NEEDS_HUMAN_TRIAGE unless a second signal (CORROBORATED); contradicted by the code → DISPROVEN;
nothing re-checkable → EVIDENCE_COLLECTED; no evidence → SUSPECTED. Only CONFIRMED / CORROBORATED / REPRODUCED P0/P1
block; an unverified P0 blocks only under `fail_closed_unverified_p0` (default true). External reviewer claims
(`--reviewer-findings`, schema `reviewer-findings.schema.json`) are proposals: a claim at a missing file or line is
DISPROVEN, one a deterministic rule agrees with is CORROBORATED, the rest go to human triage.

## Review lanes (deterministic, offline, no credentials)

| Lane           | Rules (examples)                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trust-security | secrets added, privileged env in client prefixes, auth check removed, object lookup by request ID without owner/tenant filter, TLS off, wildcard CORS, string-built SQL, eval/shell, model output reaching exec |
| correctness    | stubs ("not implemented"), mock/sample data in production code, swallowed errors, focused/skipped tests, tests that only assert mocks, behavior changed without tests                                           |
| operations     | irreversible migrations, consequential calls without idempotency keys                                                                                                                                           |
| experience     | images without alt text, positive tabindex                                                                                                                                                                      |
| impact         | Impact Check 2.0 report (affected modules, high impacts) or path-based blast radius                                                                                                                             |
| spec-outcome   | Spec Check 1.0 gaps on changed specs, Outcome Check 1.0 delivery signal; NOT_TESTED without them                                                                                                                |

De-duplication key: rule, component (first two path segments), root-cause signature (normalized match, hashed, never
stored), impact scope. A finding seen in the previous review of the same change is a _repeat_; after
`max_cycles` (default 3) the review stops with BLOCK and asks for a human decision.

## Risk routing and approvals

Risk follows the impacted surface (auth, billing, personal data, tenancy, migration, CI/deployment, AI actions,
security boundary, release/rollback → HIGH; application code → MEDIUM; docs/tests only → LOW; binary or unreadable →
UNDETERMINED, treated as HIGH). Impact Check high impacts raise risk to HIGH. Protected paths add domain owners.
Approvals needed: LOW 1, MEDIUM 1, HIGH 2 (configurable). A trusted author can waive the human approval of a LOW
change only when the policy allows it and no protected path is touched; it never bypasses a security block.

An approval counts only if: the Ed25519 signature verifies against the approver's policy key, the approver is human,
the scope matches (`change:<ref>`, `closure:F-001`, `risk-acceptance:F-001`, `false-positive:F-001`,
`continue:F-001`, `release:<target>`), the decision is approve, the approver is not the change's author or the fix's
implementer, and `reviewed_sha` is the current commit (otherwise STALE). A typed name is not an approval. **Limit:**
Product Check proves possession of a registered key, not that a person used it; key custody is your control.

## Closure state machine

`OPEN → ACKNOWLEDGED → IN_PROGRESS → FIX_PROPOSED → RETEST_REQUIRED → VERIFIED_FIXED → CLOSED`, plus
`REJECTED_FALSE_POSITIVE`, `DEFERRED`, `ACCEPTED_RISK`, `REGRESSED`. Only ACKNOWLEDGED, IN_PROGRESS, DEFERRED and OPEN
can be set directly; every other state has a guarded command. Out-edges of REGRESSED (to ACKNOWLEDGED, IN_PROGRESS
or ACCEPTED_RISK) are our addition; the methodology lists none.

| Invariant                                                                              | Enforced by                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FIX_PROPOSED is not fixed                                                              | `fix` moves to RETEST_REQUIRED only                                                                                |
| VERIFIED_FIXED needs targeted + regression at the exact fix SHA                        | `verify` refuses another HEAD or a dirty tree; only a PASS run transitions; `checkRegister` rejects any other path |
| CLOSED needs evidence, acceptance, gates, accountable human, time, risk-tier approvals | `close` (signed approvals by people other than the implementer, closing actor must be one of them)                 |
| ACCEPTED_RISK fields, never P0, expires                                                | `accept-risk`; expiry re-opens on `register`/`gate`                                                                |
| False positive needs rationale; P0/P1 need secondary support                           | `reject` (signed approval or DISPROVEN)                                                                            |
| Reappearance is REGRESSED, history kept                                                | `register` sync after a re-scan or review                                                                          |
| Agents cannot approve                                                                  | approval evaluation (NOT_HUMAN, SELF_APPROVAL, UNSIGNED)                                                           |
| Cycle limit                                                                            | `verify` escalates; `fix` refuses until a signed `continue:` approval                                              |

Transitions are hash-chained (`prev_digest` → `digest`); `checkRegister` re-verifies the chain, every transition
against the table, guarded-state preconditions and referential integrity on every load. A tampered register is
refused (exit 5).

Verification of a baseline-scan finding re-runs Product Check offline at the fix commit: the finding's control must
no longer report it **or any finding of equal or higher severity** (so moving a secret to another file fails), the
associated hard gate must not fail, the declared reproduction commands must pass, then the regression part: the
policy's required checks and the corpus, no new P0/P1 and no regressed control versus the baseline. A control that
cannot be evaluated is NOT_TESTED → INCONCLUSIVE, never PASS. After-results are retained in
`verification/VR-*-results.json`.

## Release gate

`GO / CONDITIONAL_GO / NO_GO / UNKNOWN` from release conditions RC-0…RC-8 (scan at HEAD, no P0/failed hard gate, P1
under CT3 policy, required checks green at HEAD, human approvals valid for HEAD, coverage gaps disclosed, fixes
retested, rollback for material risk, no regression). Substantiated blockers → NO_GO; then no executed evidence,
INCONCLUSIVE product verdict, stale scan, low coverage or unevaluable checks → UNKNOWN; then missing approvals or
rollback → NO_GO; accepted risks, P2s or unevaluated conditions → CONDITIONAL_GO. Change-review findings count when
their review's head is HEAD or an ancestor of it (they belong to that code).

## Artifacts and schemas (assurance schema 0.1.0)

| File                                            | Schema                              |
| ----------------------------------------------- | ----------------------------------- |
| `product-check-results.json` (unchanged, 0.1.0) | `product-check-results.schema.json` |
| `closure-register.json`                         | `closure-register.schema.json`      |
| `review-evidence.jsonl` (append-only, chained)  | `evidence-record.schema.json`       |
| `change-review.json`, `reviews/CR-*.json`       | `change-review.schema.json`         |
| `proof-run.json`, register `verification_runs`  | `verification-run.schema.json`      |
| `approvals.json`, register `approvals`          | `approval.schema.json`              |
| `fix-packets/F-*.json`                          | `fix-packet.schema.json`            |
| `release-gate.json`                             | `release-gate.schema.json`          |
| policy (input)                                  | `assurance-policy.schema.json`      |
| reviewer findings (input)                       | `reviewer-findings.schema.json`     |

The brief's `scan-contract`, `result`, `evidence` and `finding` schemas already exist and are unchanged, so every
0.1.0/0.2.0 results file still validates and loads. `product-check validate` checks all new kinds. Versions are
separate: methodology `CT3 v3.2`, package 0.3.0, results schema 0.1.0, assurance schema 0.1.0.
The internal canonical methodology document is not copied into this repository.

## Data relationships

```text
scan_id (run_id)      -> target + contract permissions + baseline commit + PoP coverage
finding_id (F-nnn)    -> source_finding_id + evidence ids + location + verification checks
fix_id (FX-nnn)       -> finding_id[] + change_sha + implemented_by + reproduction commands
verification_id (VR)  -> fix_id + exact_sha + environment + executions[] + after-results digest
approval_id (AP)      -> approver + scope + reviewed_sha + decision + Ed25519 signature
closure_id (CL)       -> finding_id + verification_id + approval_id[] + human actor + time
release_gate (RG)     -> results digest + register digest + review id + proof run id + head
```
