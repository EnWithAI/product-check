# Attribution and provenance

## Publisher

- **Project:** Product Check (`@enwithai/product-check`, proposed package name; not published).
- **Commons:** EnWithAI Engineering Commons. Question: _does this software work, can it be trusted, and what needs to
  improve?_
- **Copyright holder:** EnWithAI Technologies (to be confirmed for this repository).
- **License:** not yet decided. Until it is, no license is granted beyond what the law allows.
- **Proposed maintainer:** Koushik Ramani ([@aiwithrk](https://github.com/aiwithrk)), EnWithAI Technologies (to confirm).
- **Contact:** [hello@enwithai.com](mailto:hello@enwithai.com)
- **Security issues:** see [SECURITY.md](SECURITY.md).

## Development provenance

Product Check was written for this repository with substantial AI assistance (Claude Code), directed and reviewed by
the project's human sponsor. Commits carry a `Co-Authored-By` trailer. It has **no runtime dependencies** and contains
no vendored third-party code. Test fixtures and the demo application are synthetic; credential-like strings in them
are generated at run time and are not real.

## Built on

| Upstream                                                                 | Version        | License | How Product Check uses it                       |
| ------------------------------------------------------------------------ | -------------- | ------- | ----------------------------------------------- |
| [Node.js](https://nodejs.org)                                            | 22 / 24 / ≥ 26 | MIT     | Runtime only (built-in `fetch`, `crypto`, `fs`) |
| [JSON Schema](https://json-schema.org)                                   | draft 2020-12  | —       | Contract format for every artifact              |
| JUnit XML (de facto format)                                              | —              | —       | Input format for executed test results          |
| [HAR 1.2](https://w3c.github.io/web-performance/specs/HAR/Overview.html) | 1.2 (draft)    | —       | Input format for recorded browser traffic       |

Development tools (TypeScript, Vitest, ESLint, typescript-eslint, Prettier, Ajv) are not distributed. Design
references are in [REFERENCES.md](REFERENCES.md). Listing a project does not mean its maintainers endorse Product Check.

## Frameworks

| Framework        | Owner                  | Relationship   | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLEAR (CLEAR CT) | NetworkGain Consulting | `inspired`     | The design of the assessment model — separate Customer, Technology and Trust pillars, CT-T0…T6 lifecycle tiers, points of presence, evidence statuses, the rule that strong pillars never hide weak ones, and hard gates overriding scores — was inspired by NetworkGain's CLEAR CT method (v3.1, internal and unpublished). No text, catalog, prompt or scoring table from it is reproduced, and there is no structural relationship. **This wording awaits the framework owner's approval.** |
| TRACE            | EnWithAI Technologies  | `not-assessed` | Each finding carries an intent → evidence → remediation → retest chain, which may match TRACE's intent; alignment cannot be stated until the TRACE specification is available.                                                                                                                                                                                                                                                                                                                 |

## Ecosystem

Product Check is independently usable. It has no dependency on CrewPE, any EnWithAI service or NetworkGain, and it
contacts no service except an origin the user explicitly authorizes. CrewPE is EnWithAI's enterprise engineering
lifecycle product and could consume Product Check's JSON results and work packets in governed workflows; no such
integration exists today. NetworkGain Consulting contributes enterprise value and governance perspective to the
Commons; using Product Check creates no obligation to engage it.

## Not affiliated

Product Check is not affiliated with, endorsed by or certified by GitHub, Vercel, Supabase, OpenAI, Anthropic, Stripe,
Google, the OWASP Foundation, the W3C or any framework vendor named in its rules or documentation.
