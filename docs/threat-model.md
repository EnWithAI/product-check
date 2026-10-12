# Threat model

Assets: the user's machine and secrets, the scanned product and its users, third parties that could be contacted,
and the integrity of the results people rely on.

| Threat                                                                        | Mitigation                                                                                                                                               | Test                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Executing untrusted repository code                                           | No `child_process`, `vm`, `eval`, `new Function` or dynamic `import()` in `src/`; tests are imported, never run; git metadata parsed from files          | `security.test.ts`                          |
| Scanning systems without permission                                           | `passive-http` needs scope + attestation + explicit flag; prohibited actions refused; contract files cannot enable the network without `--allow-network` | `acceptance.test.ts` A9                     |
| Intrusive or harmful requests                                                 | fixed GET paths only, no cookies/credentials/bodies, manual same-origin redirects, timeouts, request budget                                              | `http.test.ts`                              |
| Leaking the user's local secrets                                              | git-ignored files are never read; excerpts redacted and ≤160 chars; cookie values removed; no request headers kept; credentials in URLs refused          | `security.test.ts`, `units.test.ts`         |
| Copying secrets found in the product into reports                             | every excerpt, summary and locator passes through redaction (token formats and secret-named assignments)                                                 | `acceptance.test.ts` A4, `security.test.ts` |
| Hostile content (page titles, paths, test names) injecting markup             | all Markdown/HTML output escaped; dashboard CSP `default-src 'none'` with a hash-pinned script; data rendered server-side                                | `security.test.ts`                          |
| Malicious repository layouts (symlinks, huge files, deep trees, binary files) | symlinks never followed; 1 MiB per-file, depth 25 and file-count caps; each skip recorded as a limitation                                                | `units.test.ts`                             |
| Tampered or fabricated results                                                | schema + referential integrity + recomputation of scorecard and verdict; tampered baselines refused; the dashboard flags mismatches                      | `acceptance.test.ts` A5, A8; `cli.test.ts`  |
| Overclaiming readiness                                                        | untested never counts as passed; withheld scores; gates override; verdict bounded to revision/origin; RESOLVED only with new evidence                    | `acceptance.test.ts` A2–A6                  |
| Trojan Source in this repository                                              | test rejects bidi/invisible characters in `src/`, `test/`, `dashboard/` (it caught literal invisible characters in three files during development)       | `security.test.ts`                          |

Residual risks: pattern-based checks can miss secrets in unusual formats and can flag test fixtures; findings label
such matches as hypotheses where appropriate. Imported test results are trusted as reported (their environment is not
verified, which the PoP states). Passive requests are still visible in the target's logs.
