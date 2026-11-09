# Safety and authorization

## Never done, whatever a contract says

Production writes, destructive tests, real outreach, payment flows, active security scanning, credentialed access,
personal-data extraction, executing repository code and paid external calls. A contract that authorizes any of these,
or removes them from `prohibited_actions`, is refused with exit code 4.

## What each action allows

| Action                        | Allows                                                                                                                                                                                                                                                         | Needs                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-local-source` (default) | reading files of the given checkout; `.git` metadata parsed from files                                                                                                                                                                                         | nothing (on by default)                                                                                                                                                                            |
| `import-artifacts` (default)  | reading files you pass (test results, audit, HAR, reports)                                                                                                                                                                                                     | nothing (on by default)                                                                                                                                                                            |
| `passive-http`                | fixed GET requests to the declared origin: entry page (same-origin redirects, max 3 hops), `http://` redirect check for HTTPS targets, one random not-found path, `/robots.txt`, `/.well-known/security.txt`, and the privacy page if it is on the same origin | the origin in `scope.origins`, a written `attestation`, and `--allow-network` when it comes from a contract file (or `--authorize passive-http` on the command line, which records an attestation) |
| `exposure-probe`              | GET `/.env`, `/.env.local`, `/.git/HEAD`, `/.git/config` on that origin; only a yes/no signature is kept, never content                                                                                                                                        | `passive-http` as well, and the same confirmation                                                                                                                                                  |

Requests carry no cookies, credentials or bodies, use `redirect: manual`, never follow redirects to other origins,
have a per-request timeout (default 10 s) and a hard budget (default 12, maximum 50). Bodies are read up to 1 MiB,
hashed and discarded; only page facts (title, lang, viewport, image alt counts, meta CSP, privacy link) are kept.
Response headers are filtered to a security-relevant allowlist and cookie values are replaced by `[REDACTED]`.

Recorded observations (`--observations`) and HAR files (`--har`) give application evidence with no request at all;
when present they are used instead of the network.

## Opt-in command execution (`proof`, `verify`; CT3 v3.2)

The scan (`run`, `retest`, `scan`, `spec`) still never executes anything. Author-side proof and closure verification
need executed evidence, so `proof` and `verify` can run commands, under these rules:

- only commands declared by the operator: `required_checks` in the `--policy` file, `--repro-cmd` recorded with a
  fix, or corpus cases added with `learn`; never a script detected in, or a command read from, the repository;
- only with `--allow-exec` on that invocation; without it each command is recorded as `NOT_TESTED` with the reason;
- argv only (no shell), working directory inside the repository, reduced environment (`exec.env_allowlist`), a
  timeout per command and an output cap; only digests and a redacted 400-character tail are kept;
- one module (`src/exec/process.ts`) may start processes; tests and ESLint enforce it. It also runs read-only git
  plumbing (`rev-parse`, `diff`, `show`, `status`, `log`, `merge-base`) with hooks, fsmonitor, external diff and
  textconv drivers, pagers, system config and prompts disabled.

`--allow-exec` runs the repository's code with your permissions. Use it only for code you would run anyway, ideally
in a disposable container or CI runner.

## A contract you did not write cannot trigger requests silently

The CLI never reads a contract or an assurance policy from the scanned repository by itself. A contract file that authorizes network
actions additionally requires `--allow-network` on the command line.

## Refusals are recorded

When the safety gate refuses a run, the CLI writes an `ABORTED` results document (all controls `BLOCKED` with the
refusal reason, verdict `INCONCLUSIVE`, no network use) to the output directory and exits 4. See
`examples/aborted-run/`.

## Local development servers

For loopback origins (`localhost`, `127.x.x.x`, `[::1]`), HTTPS and HSTS cannot be assessed and are reported as
`NOT_TESTED` with that reason rather than failed.

## Your responsibility

Only scan systems you own or are authorized to test. Even passive requests appear in the target's logs.
