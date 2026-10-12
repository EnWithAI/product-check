# CLI reference

```text
product-check run      [inputs] [output options]
product-check retest   --baseline <results.json> [inputs] [output options]
product-check scan     [--repo <dir>] [--url <url>] [--json]
product-check spec     --repo <dir> | --contract <file> [--out-dir <dir>] [--format md|json|both] [--json] [--quiet]
product-check init     [--repo <dir>] [--url <url>] [--stage <stage>] [--name <name>] [--authorize …] [--output <file>] [--force]
product-check validate <file>...
product-check report    <results.json> [--format markdown|json] [--output <file>] [--no-branding]
product-check blueprint <results.json> [--format markdown|json] [--out-dir <dir>]
product-check dashboard <results.json> [--output <file>]
product-check controls  [--format json]
product-check schema    [name]
```

## Inputs

| Flag                                                       | Meaning                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--repo <dir>`                                             | local checkout to inspect (read-only)                                                                                             |
| `--url <url>`                                              | deployed application (needs authorization to be requested)                                                                        |
| `--authorize <a,b>`                                        | `passive-http`, `exposure-probe`; records a CLI attestation and adds the origin to scope                                          |
| `--authorized-by <name>`                                   | name recorded in the attestation (default "local CLI user")                                                                       |
| `--contract <file>`                                        | scan contract; flags override its values                                                                                          |
| `--allow-network`                                          | confirms network actions authorized inside a contract file                                                                        |
| `--stage <stage>`                                          | DISCOVERY_BUILD, ALPHA (default), BETA_PILOT, PRE_LAUNCH, LAUNCH_GATE, JUST_LAUNCHED, POST_LAUNCH, PRODUCTION_SCALE, MAJOR_CHANGE |
| `--mode <mode>`                                            | AUTO (default), SOURCE, APPLICATION, HYBRID                                                                                       |
| `--name <name>`                                            | product name (default: directory or host name)                                                                                    |
| `--test-results <file>`                                    | JUnit XML or Jest/Vitest JSON; repeatable                                                                                         |
| `--npm-audit <file>`                                       | `npm audit --json` output                                                                                                         |
| `--har <file>`, `--observations <file>`                    | offline application evidence                                                                                                      |
| `--spec-check`, `--impact-check`, `--outcome-check <file>` | sibling Commons reports                                                                                                           |
| `--baseline <file>`                                        | previous results (must pass integrity checks)                                                                                     |

## Output

| Flag                                         | Meaning                                     |
| -------------------------------------------- | ------------------------------------------- |
| `--out-dir <dir>`                            | default `.product-check/`                   |
| `--json`                                     | print results JSON to stdout; write nothing |
| `--record-observations <file>`               | save live observations for replay           |
| `--fail-on <verdicts>`                       | exit 6 if the verdict is listed             |
| `--no-dashboard`, `--no-branding`, `--quiet` |                                             |

When the repository was inspected, `run` and `retest` also write `as-built-spec.json` and
`specs/000-as-built/spec.md` (see [As-built spec](#as-built-spec-spec)).

`SOURCE_DATE_EPOCH` (seconds) fixes the clock for reproducible output.

## As-built spec (`spec`)

`spec` reverse-engineers a specification from the repository's structure. It reads the same snapshot as `run`
(read-only; git-ignored files are never read; nothing is executed; no requests are sent) and writes to `--out-dir`
(default `.product-check/`):

- `as-built-spec.json`: the discovered surface (pages, endpoints, data entities, integrations, configuration
  variable **names**, authentication boundaries, test titles) with evidence, plus derived `FR-`/`NFR-`/`SC-`/`EC-`
  items, each marked `observed`, `inferred` or `hypothesis`. It validates with `product-check validate`.
- `specs/000-as-built/spec.md`: the same content in GitHub Spec Kit layout, so Spec Check reads it without flags.

Code shows what exists, not why. Purpose, users, priorities and measurable targets are therefore written as
`[NEEDS CLARIFICATION: …]` markers, and Spec Check will block the spec until a person answers them. That is
intended. The loop is:

```bash
product-check spec --repo .                                   # 1. derive
# 2. answer the clarifications and correct statements in .product-check/specs/000-as-built/spec.md
spec-check check .product-check/specs --format json > spec-check.json   # 3. lint
product-check run --repo . --spec-check spec-check.json       # 4. PC-C-10 now evaluates instead of NOT_TESTED
```

Recognised: Next.js (app and pages routers), SvelteKit, Astro, React Router, Express/Fastify/Hono/Koa/NestJS,
FastAPI/Flask, Prisma, Drizzle, Mongoose, SQL `CREATE TABLE`, SQLAlchemy/Django models. Other stacks yield an honest,
mostly empty surface with a stated uncertainty.

## Exit codes

| Code | Meaning                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------ |
| 0    | success (whatever the verdict, unless `--fail-on` matched)                                       |
| 1    | internal error (a bug)                                                                           |
| 2    | usage or configuration error (including invalid contracts)                                       |
| 3    | input error (missing or malformed input file)                                                    |
| 4    | safety refusal (unauthorized or prohibited action); an ABORTED record is written unless `--json` |
| 5    | `validate`: at least one artifact is invalid                                                     |
| 6    | `--fail-on` matched the verdict                                                                  |
