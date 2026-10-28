# Lifecycle tiers

Tiers express what should be true at a given maturity. They are distinct from workflow phases. The declared
`lifecycle_stage` selects the primary tier; explicit `tiers` in the contract override it. **Tiers carry forward:** the
primary tier applies its own controls and those of every earlier tier, so unresolved foundations are never waived.
Controls above the primary tier are reported as `NOT_APPLICABLE` with the reason.

| Tier  | Name                            | Focus                                                                       | Stage(s)                       |
| ----- | ------------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| CT-T0 | Foundation & Testability        | secrets, access control, data ownership, testability, recovery basics       | DISCOVERY_BUILD                |
| CT-T1 | Experience & Product Usefulness | onboarding, accessibility, journeys, correct user-facing behaviour          | ALPHA                          |
| CT-T2 | Pre-Launch Assurance            | isolation, privacy, security hardening, regression, AI behaviour            | BETA_PILOT, PRE_LAUNCH         |
| CT-T3 | Launch Decision                 | verified gates, blockers, risk acceptances, go/no-go for an exact candidate | LAUNCH_GATE                    |
| CT-T4 | Launch Watch                    | production monitoring, escaped-defect detection (read-only)                 | JUST_LAUNCHED                  |
| CT-T5 | Stabilization                   | real behaviour, value, incident and defect trends                           | POST_LAUNCH                    |
| CT-T6 | Continuous Assurance            | release-to-release regression, drift, scale                                 | PRODUCTION_SCALE, MAJOR_CHANGE |

## What this release can and cannot evidence per tier

- **T0–T2:** most controls are checkable from source, passive application observation and imported results.
  Authorization and isolation need your executed tests (control mappings).
- **T3:** change impact (via an Impact Check report), architecture drift (via an Architecture Check report, PC-T-17)
  and rollback (via a mapped rehearsal test).
- **T4:** SLOs (PC-T-18), SLO alerting (PC-T-19), runtime confirmation of declared dependencies (PC-T-20) and
  monitoring (PC-T-14) from exported OpenSLO, alert-rule and service-graph files ([operational imports](operational-imports.md)).
  Without them the observability PoP is `BLOCKED`. Real-user journey health (PC-C-11) stays `NOT_TESTED`.
- **T5:** delivery stability via an Outcome Check report.
- **T6:** PC-T-16 compares with the baseline and fails on any control that went from PASS to PARTIAL/FAIL.

The tier names follow the CT lifecycle model that inspired Product Check; descriptions and control content are
Product Check's own.
