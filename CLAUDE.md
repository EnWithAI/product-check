# CLAUDE.md — Product Check repository conventions

These conventions apply inside this repository. They never override the workspace launch pack
(`../START_HERE.md`, `../MASTER_PROMPT.md`, `../PHASE_GATES.md`), the Product Check implementation brief, or the
user's explicit instructions.

## Commands

- Install: `npm ci --ignore-scripts`
- Full gate: `npm run check:all` (typecheck → lint → format check → build → tests with coverage ≥ 80% lines)
- Demo/examples: `npm run build && npm run demo` (needs git; commit the regenerated examples)
- Licenses: `node scripts/license-audit.mjs --all` (one production dependency: `yaml`, ISC, pinned)

## Invariants (tests enforce most of these)

- No `child_process`, `vm`, `eval`, `new Function` or dynamic `import()` in `src/`; network only in
  `src/inspectors/http/fetch.ts`, only after `contract/safety.ts` allows it.
- No PASS/PARTIAL/FAIL without evidence; unchecked statuses carry a reason; untested never raises a score.
- Git-ignored files are never read; evidence excerpts are redacted and short; no request headers or bodies kept.
- Results are deterministic with `SOURCE_DATE_EPOCH`; IDs are content hashes over relative paths.
- The committed demo outputs must equal a fresh run (tested); dashboards must equal a fresh render (tested).
- Fixtures and demo data are synthetic; secret-like strings are assembled at run time.

## Permission gates

Local commits are fine. **Pushing, creating remotes/repos, publishing to npm, changing the license, or contacting any
external system requires explicit user approval for that specific action.**
