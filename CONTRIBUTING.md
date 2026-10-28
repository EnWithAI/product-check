# Contributing to Product Check

Thanks for helping! Product Check aims to stay **small, deterministic and honest** about what it knows.

## Ground rules

- **Evidence or nothing.** A new check must say exactly which evidence makes it PASS, PARTIAL or FAIL. If it cannot
  run, its evaluator returns `null` or an unchecked status with a reason. Never report PASS without evidence.
- **Safety.** No new network access beyond `src/inspectors/http/fetch.ts`, no child processes, no execution of
  repository code, no telemetry, no runtime dependency beyond `yaml`, without an issue discussing it first.
- **Controls** live in `src/validation/catalog.ts` with tier, weight, gate, impacts, root cause and remediation. Write
  a failing test first, then the evaluator.
- **Schema changes** bump the results `schema_version` and update `schemas/` (via `scripts/dev/write-schemas.mjs`) and
  `src/types.ts` together.
- **Fixtures** are synthetic. Never commit real repositories, HAR files, results of real products, secrets or personal
  data. Assemble secret-like test strings at run time.
- **Output changes:** `npm run build && npm run demo` regenerates the committed demo; commit the result.

## Development

```bash
npm ci --ignore-scripts
npm run check:all                     # typecheck, lint, format check, build, tests with coverage
node scripts/license-audit.mjs --all
npm run build && npm run demo         # regenerate examples (needs git)
```

## Pull requests

- Keep PRs focused; include tests that assert behaviour.
- Describe user-visible changes in `CHANGELOG.md` under "Unreleased".
- By contributing you agree your contribution is licensed under the MIT License (inbound = outbound).

## Licensing of contributions and attribution

- Do not paste code, text or diagrams from other projects or publications (including the CLEAR CT method text). If
  third-party material is genuinely needed, open an issue first.
- New source files start with `// SPDX-License-Identifier: MIT` and
  `// SPDX-FileCopyrightText: 2026 EnWithAI Technologies` (`#` for YAML and shell).
- Do not add framework (CLEAR/TRACE) or product (CrewPE) claims unless
  [commons-provenance.yaml](commons-provenance.yaml) records an evidenced relationship.
- AI-assisted contributions are welcome. You are responsible for reviewing them; mention significant AI assistance in
  the PR description.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
