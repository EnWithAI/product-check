# Assessment model

## Workflow phases (what happens) vs lifecycle tiers (what is expected)

| Phase         | In Product Check                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| **Scan**      | Inventory points of presence; snapshot the repository; observe the application (live, recorded or HAR). |
| **Test**      | Passive application checks; import executed test results and reports. No repository code is run.        |
| **Validate**  | Evaluate every control; distinguish PASS/PARTIAL/FAIL/BLOCKED/NOT_TESTED/NOT_APPLICABLE; score; decide. |
| **Blueprint** | As-is and to-be architecture, remediations, work packets, test architecture, traceability.              |
| **Dashboard** | Render `dashboard.html` from the results JSON.                                                          |
| **Remediate** | Advisory only: humans or agents act on work packets in their own environment.                           |
| **Retest**    | Re-run with `--baseline`: verified fixes, reopened/new findings, regressions, trends.                   |

Each run records the status of every phase in `run.phases`. Lifecycle tiers are described in
[lifecycle-tiers.md](lifecycle-tiers.md).

## Pillars

| Pillar     | Question                                                      | Examples of controls                                                                                                                                        |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer   | Can intended users understand it, use it and get value?       | reachable entry page, language, viewport, image alternatives, real 404s, journey tests, onboarding                                                          |
| Technology | Is it built, tested and operated soundly?                     | lockfile, tests exist and pass, CI runs tests, runtime pinned, migrations, monitoring, rollback, regressions                                                |
| Trust      | Can users and operators trust it with their data and actions? | committed secrets, public-prefixed keys, exposed files, security headers, cookies, authorization, isolation, vulnerabilities, client-side AI keys, AI evals |

`product-check controls` prints the full catalog (51 controls). Each control declares its tier, weight
(1 hygiene, 2 core, 3 critical), the points of presence that can evidence it, the hard gate it belongs to (if any),
impacts per pillar, a root-cause statement and remediation knowledge.

## Points of presence (PoPs)

Places where the product can be observed: repository, dependency manifests, automated test sources, executed test
results, CI/CD, hosting/IaC, database schema, deployed web application, API definitions, production telemetry, AI
integration, documentation, privacy/security policies. Each has a status (`AVAILABLE`, `PARTIAL`, `BLOCKED`,
`NOT_APPLICABLE`), whether it is relevant, its access (`read-only`/`none`), authorization, scope, observation time,
provenance and limitations. A relevant PoP that is not accessible is `BLOCKED`, and controls that can only be
evidenced there become `BLOCKED`, which lowers coverage.

## Inspection modes

`SOURCE` (repository only), `APPLICATION` (deployed app only), `HYBRID` (both; application evidence first, source
used to locate fixes) and `AUTO` (use whatever is provided and authorized). The effective mode is recorded.

## Evidence

Each evidence item has a deterministic ID, the run that collected it, its kind (source location, file presence,
manifest field, search scope, HTTP response, test result, imported report, baseline comparison), its PoP, strength
(`runtime` > `executed-test` > `static` > `imported-report` > `declared` > `inferred`), provenance, locator and
line, a summary, a redacted excerpt of at most 160 characters, a SHA-256 checksum and the redaction rules applied.
A negative result (for example "no credential patterns") is evidenced by a _search-scope_ item: which files were
searched and a checksum of that file set.

## Findings

A finding belongs to one control and carries: severity (P0 critical exposure … P3 polish) and optional UX severity
(UX0 cannot achieve the core outcome … UX3 polish), status (`OPEN`, `ACCEPTED_RISK`, `RESOLVED`, `UNVERIFIED`),
lifecycle across runs (`NEW`, `PERSISTING`, `REOPENED`, `RESOLVED`, `CARRIED_UNVERIFIED`), epistemic status (fact,
inference, hypothesis), confidence, reproducibility and steps, location, expected vs actual, impacts, root cause,
evidence and its work packet. Its ID is a hash of the control and a location fingerprint that excludes line
numbers, so it survives unrelated edits.

## The scan contract

`schemas/scan-contract.schema.json`. Fields you will most often edit:

- `target.repository.path`, `target.application.url`, `mode`, `lifecycle_stage` (or explicit `tiers`);
- `product.has_user_accounts`, `multi_tenant`, `handles_personal_data`, `uses_ai`, `payments` (unknown values are
  reported as such; `has_user_accounts: false` makes the authorization gate not applicable, for example for CLIs
  and libraries);
- `personas`, `critical_journeys` (used in traceability);
- `authorization`: `authorized_actions`, `scope.origins`, `attestation` (see [safety](safety-and-authorization.md));
- `imports`: test results, npm audit, HAR, recorded observations, Spec/Impact/Outcome Check reports;
- `control_mappings`: `{ "control_id": "PC-S-13", "test_name_pattern": "^authz:" }` makes matching executed tests the
  evidence for that control;
- `risk_acceptances`: owner, rationale, compensating control, expiry and closure condition (P0 is never accepted;
  expired acceptances are rejected and listed);
- `scoring.min_coverage` (default 0.5) and `scoring.pillar_threshold` (default 70).

Omitted fields take defaults. Unknown fields are rejected. Relative paths resolve against the contract's directory.
