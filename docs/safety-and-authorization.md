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

## A contract you did not write cannot trigger requests silently

The CLI never reads a contract from the scanned repository by itself. A contract file that authorizes network
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
