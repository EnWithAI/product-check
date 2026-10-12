# Migration note: names

This is the only place in the repository where superseded names are mentioned.

| Superseded (do not use)                                            | Current                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| BuildProof / buildproof (abandoned working title for this project) | Product Check · `product-check` · `@enwithai/product-check` |
| ChangeLens                                                         | Impact Check · `@enwithai/impact-check`                     |
| SpecGuard                                                          | Spec Check · `@enwithai/spec-check`                         |
| AgentScore                                                         | Outcome Check · `@enwithai/outcome-check`                   |

CT3 / CLEAR CT is the methodology that inspired the assessment model, recorded as `run.methodology` in results
(`name: "CT3"`, `relationship: "inspired"`, `reference_version: "CLEAR CT v3.1 (unpublished; principles only)"`). The
methodology version (v3.1) is not the product version (0.1.0-alpha.0) or the results schema version (0.1.0).

## Stale-name search (2026-10-12)

`grep -rniE "buildproof|build proof|changelens|specguard|agentscore"` over the repository (excluding `node_modules`,
`dist`, `coverage` and the generated demo app) found **no occurrences** outside this file. `™`/`®` appear only in
`docs/branding-and-attribution.md`, which explains why they are not used. The three sibling repositories were not
modified.
