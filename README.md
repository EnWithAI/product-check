# Product Check

**Does this software work, can it be trusted, and what needs to improve?**
_Scan. Validate. Blueprint. Improve._ Evidence-led product assurance and software blueprinting.

Product Check looks at your **repository**, your **deployed app**, or **both**, checks them against a catalog of
Customer, Technology and Trust controls, and gives you:

- **findings backed by evidence**: file and line, or the exact HTTP response, with a checksum and a redacted excerpt;
- **three separate scores** (Customer, Technology, Trust), each with coverage and confidence, never averaged together;
- a **readiness verdict** (`READY`, `READY_WITH_CONDITIONS`, `NOT_READY`, `INCONCLUSIVE`) that hard gates can block
  and that states exactly what it does and does not cover;
- an **engineering blueprint**: prioritized fixes, acceptance criteria, regression-test candidates and one
  **work packet** per fix that you (or any coding agent) can act on;
- a **local dashboard** and a **retest** loop that shows verified fixes, regressions and trends.

Everything is written to one versioned JSON file. The report, blueprint and dashboard are renderings of it.

> Status: **early release** (`0.2.0`, pre-1.0, results schema `0.1.0`, rubric `pc-rubric-0.2`). Install with
> `npm install --global @enwithai/product-check`, or build from source as in the demo below.

## What it will not pretend

Untested is never passed. Product Check reports `BLOCKED` or `NOT_TESTED` (with the reason) for anything it could not
check, lowers coverage accordingly, and withholds a score when evidence is thin. It is **not** a penetration test, a
compliance certification or a guarantee of production readiness. It never runs your repository's code, never logs in,
never submits forms and never sends anything anywhere except passive GET requests to an origin you authorize.

## Two-minute demo

Requires Node.js 22, 24 or ≥ 26, and git. No account, no network, one runtime dependency (`yaml`, for OpenSLO and alert-rule files).

```bash
git clone https://github.com/enwithai/product-check.git && cd product-check
npm ci --ignore-scripts && npm run build
cd examples/vibe-app-demo
node create-app.mjs                     # generates a deliberately weak, synthetic vibe-coded app in ./app
node ../../dist/cli/main.js run --contract scan-contract.json --observations inputs/observations-baseline.json --out-dir output/baseline
```

```text
Verdict: NOT_READY at CT-T2 ("NOT READY")
  - Hard gate failed: G-SECRETS.
  - 8 open P0 finding(s).
  - 1 open P1 finding(s).
Customer   40/100 (coverage 77%, confidence MEDIUM)
Technology 4/100 (coverage 80%, confidence MEDIUM)
Trust      2/100 (coverage 67%, confidence MEDIUM)
```

Then apply the fixes and retest against that baseline (the app's own tests were run against its fixed build and
their JUnit output is in `inputs/`):

```bash
node create-app.mjs --remediate
node ../../dist/cli/main.js retest --contract scan-contract.json --observations inputs/observations-remediated.json \
  --test-results inputs/test-results-remediated.xml --baseline output/baseline/product-check-results.json --out-dir output/retest
open output/retest/dashboard.html       # or xdg-open / start
```

```text
Verdict: READY_WITH_CONDITIONS at CT-T2 ("CONDITIONAL")
  - 2 open P2 finding(s).
Customer   100/100 (coverage 92%, confidence HIGH)
Technology 94/100 (coverage 100%, confidence MEDIUM)
Trust      97/100 (coverage 83%, confidence HIGH)
Retest vs PCR-20261014T100000Z-D74DF2: 35 verified fixed, 0 new, 0 reopened, 0 regressed control(s)
```

The two remaining P2s (no error monitoring, no AI evaluation suite) are real gaps in the fixed demo app. A
[repository-only scan](examples/repo-only/report.md) of the same weak app shows the other side of honesty: Customer
and Trust are **not scored** because, without the running app, too little could be checked.

The committed [baseline](examples/vibe-app-demo/output/baseline/report.md) and
[retest](examples/vibe-app-demo/output/retest/report.md) outputs are what these commands produce (the test suite
checks that). See [examples/vibe-app-demo](examples/vibe-app-demo/README.md) for the live version, where the probe
talks to a local stand-in deployment of the demo app.

## Use it on your project

```bash
# Your repository (read-only; nothing is executed):
product-check run --repo .

# Your deployed app (only if you own it or may test it): passive GETs to fixed paths on that origin.
product-check run --repo . --url https://your-app.example --authorize passive-http

# Also check whether /.env or /.git are publicly served (more intrusive; separately authorized):
product-check run --repo . --url https://your-app.example --authorize passive-http,exposure-probe

# Add evidence you already have:
npx vitest run --reporter=junit --outputFile=junit.xml   # or jest-junit, playwright --reporter=junit, pytest --junitxml
npm audit --json > npm-audit.json
product-check run --repo . --test-results junit.xml --npm-audit npm-audit.json --stage PRE_LAUNCH
```

Results go to `.product-check/`: `product-check-results.json`, `report.md`, `blueprint.md`, `work-packets/*.md`,
`dashboard.html` (open it directly; no server) and, when the repository was read, an as-built spec
(`specs/000-as-built/spec.md`, `as-built-spec.json`) reverse-engineered from its structure. After changing things, run
`product-check retest --baseline .product-check/product-check-results.json …` with the same inputs.

No deployed URL you can scan? Export a HAR file from your browser's DevTools on your app and pass `--har app.har`.

For repeatable setups, `product-check init --repo . --url … --stage …` writes a
[scan contract](docs/assessment-model.md#the-scan-contract) you can edit: declare tenancy, personal data and AI use,
critical journeys, risk acceptances, and **control mappings** that link your own executed tests (for example
authorization or tenant-isolation tests) to the controls Product Check cannot test by itself.

## Commands

| Command                            | What it does                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `run`                              | Scan → Test → Validate → Blueprint; writes results and renderings                                 |
| `retest --baseline <file>`         | `run` plus comparison: verified fixes, reopened and new findings, regressions, trends             |
| `scan`                             | Discovery only: which points of presence exist and what could be checked (no requests, no checks) |
| `spec`                             | Reverse-engineers an as-built spec (Spec Kit `spec.md` + JSON) from the repository's structure    |
| `init`                             | Writes an editable scan contract                                                                  |
| `validate <file>…`                 | Schema validation; for results also referential integrity and recomputation of scores and verdict |
| `report`, `blueprint`, `dashboard` | Re-render from a results file                                                                     |
| `controls`, `schema [name]`        | The control catalog and the JSON Schemas                                                          |

Exit codes: `0` ok · `1` internal error · `2` usage · `3` input · `4` safety refusal · `5` invalid artifact ·
`6` `--fail-on` matched (for CI gating, for example `--fail-on NOT_READY`). Full reference: [docs/cli.md](docs/cli.md).

## How it decides

- **Pillars** ([assessment model](docs/assessment-model.md)): Customer (can people use it and get value?),
  Technology (is it built, tested and operated soundly?), Trust (secrets, access, isolation, privacy, AI boundaries).
- **Lifecycle tiers** CT-T0…CT-T6 ([lifecycle tiers](docs/lifecycle-tiers.md)), selected from your declared stage,
  with carry-forward: a later tier always includes earlier tiers' controls.
- **Scoring and gates** ([scoring and gates](docs/scoring-and-gates.md)): pass = 1, partial = ½, fail = 0, weighted;
  coverage and confidence shown beside every score; open P0/P1 cap the pillar; failed hard gates force `NOT_READY`;
  unverified gates force `INCONCLUSIVE`.
- **Safety** ([safety and authorization](docs/safety-and-authorization.md)): what is never done, and what needs
  explicit, scoped authorization.

## Privacy and security

No telemetry, account, model call or child process. The repository is read, never executed; git-ignored files (such
as your local `.env`) are listed but never read. Evidence keeps short redacted excerpts, never file or response
contents; response headers are filtered to a security-relevant allowlist with cookie values removed. The dashboard is
a single file with a hash-pinned script and a `default-src 'none'` Content-Security-Policy. See
[SECURITY.md](SECURITY.md) and [docs/threat-model.md](docs/threat-model.md).

## Documentation

[Philosophy](docs/philosophy.md) · [Architecture](docs/architecture.md) ·
[Assessment model](docs/assessment-model.md) · [Scoring and gates](docs/scoring-and-gates.md) ·
[Lifecycle tiers](docs/lifecycle-tiers.md) · [Safety and authorization](docs/safety-and-authorization.md) ·
[Interoperability](docs/interoperability.md) · [CLI](docs/cli.md) · [Threat model](docs/threat-model.md) ·
[Branding and attribution](docs/branding-and-attribution.md) · [Implementation status](IMPLEMENTATION_STATUS.md) ·
[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Governance](GOVERNANCE.md)

## License

MIT © EnWithAI Technologies. Not affiliated with or endorsed by any
platform or framework vendor named in this repository.

---

<sub>**Check the spec. Check the impact. Check the outcome. Check the product.** Product Check is the fourth check, with
[Impact Check](https://github.com/enwithai/impact-check), [Spec Check](https://github.com/enwithai/spec-check) and
[Outcome Check](https://github.com/enwithai/outcome-check).</sub>

<sub>An **EnWithAI Engineering Commons** initiative. Developed and maintained by EnWithAI Technologies, contributing to
open, verifiable and accountable AI-assisted software engineering. Part of the broader [CrewPE](https://crewpe.ai)
engineering ecosystem. Product Check is independently usable and does not require CrewPE. Enterprise advisory and
transformation perspectives are supported through [NetworkGain Consulting](https://networkgain.com).
Attribution: [ATTRIBUTION.md](ATTRIBUTION.md) · Notices: [NOTICE.md](NOTICE.md) · Trademarks:
[TRADEMARKS.md](TRADEMARKS.md) · References: [REFERENCES.md](REFERENCES.md).</sub>

<sub>The design of Product Check's assessment model (separate Customer, Technology and Trust pillars, lifecycle tiers,
points of presence, evidence-before-opinion) was inspired by NetworkGain's CLEAR CT method. There is no structural
relationship — see [ATTRIBUTION.md](ATTRIBUTION.md#frameworks).</sub>
