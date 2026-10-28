# Scoring and gates (rubric pc-rubric-0.2)

All of this is implemented in `src/scoring/score.ts` and `src/scoring/verdict.ts` as pure functions.
`product-check validate` recomputes them from a results file; the dashboard does the same and shows a banner if the
stored figures do not match.

## Per pillar

| Quantity          | Definition                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| applicable weight | Σ weight of controls in the pillar that are not `NOT_APPLICABLE`                                                                                                                                                                                                                         |
| checked weight    | Σ weight of `PASS`, `PARTIAL` and `FAIL` controls                                                                                                                                                                                                                                        |
| **coverage**      | checked weight ÷ applicable weight (4 decimals)                                                                                                                                                                                                                                          |
| **score**         | Σ weight × value ÷ checked weight × 100, rounded; PASS = 1, PARTIAL = 0.5, FAIL = 0                                                                                                                                                                                                      |
| withheld          | score = `null`, state `INSUFFICIENT_EVIDENCE`, when coverage < `min_coverage` (0.5) or fewer than 2 controls were checked                                                                                                                                                                |
| **cap**           | an open P0 in the pillar caps the score at 39; an open P1 at 59 (recorded in `cap`)                                                                                                                                                                                                      |
| **confidence**    | `HIGH`: coverage ≥ 0.8, ≥ 50% of checked weight from runtime or executed-test evidence, no unverified hard gate in the pillar · `MEDIUM`: coverage ≥ 0.5 and ≥ 50% static-or-better evidence · `LOW` otherwise (always LOW when the score is withheld) · `NONE` when nothing was checked |
| **trend**         | delta to the baseline run's score (retest only)                                                                                                                                                                                                                                          |

`BLOCKED` and `NOT_TESTED` count as unchecked. They can only lower coverage and confidence.

## Hard gates

| Gate                                                                    | Controls                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| G-SECRETS: no exposed production secrets or client-side privileged keys | PC-S-01, PC-S-02, PC-S-09, PC-AI-01                                    |
| G-AUTHZ: no authentication or authorization bypass on privileged paths  | PC-S-13                                                                |
| G-ISOLATION: no cross-tenant or cross-user data exposure                | PC-S-14 (applicable unless the product declares `multi_tenant: false`) |

A gate is `FAIL` if any applicable member control fails, `UNVERIFIED` if any is blocked or not tested, `PASS`
otherwise. PC-S-13 and PC-S-14 can only be verified with your own executed tests linked through `control_mappings`:
Product Check never logs in or tries to break access control itself.

## Release verdict

1. Any failed hard gate or open P0 → **NOT_READY**.
2. Any open P1 without a valid risk acceptance → **NOT_READY**.
3. Any unverified hard-gate control, or any pillar without a score → **INCONCLUSIVE**.
4. Any pillar below the threshold (70), LOW confidence, open P2 or accepted risk → **READY_WITH_CONDITIONS**.
5. Otherwise → **READY**.

Open means `OPEN` or `UNVERIFIED` (carried from a baseline without being re-checked). The verdict also lists the
blocking gates and findings, the unverified gate controls, accepted and rejected risk acceptances, and a
`bounded_by` statement naming the revision, origin and observation time. Approval is recorded as required for
launch tiers (CT-T3+) or when risks were accepted; Product Check never marks anything approved itself.

Tier-specific wording is provided as an alias (for example CT-T3: GO / GO WITH ACCEPTED RISK / NO-GO).

## Why no composite score

A single number invites averaging away exactly the failures that matter. Readers get three scores with coverage and
confidence, the gates, and the open findings instead.
