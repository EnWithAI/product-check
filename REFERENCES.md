# References

Sources that shaped Product Check. Formats and dependencies it _uses_ are in [ATTRIBUTION.md](ATTRIBUTION.md); this
file lists _ideas and specifications_. Listing a source does not imply its authors endorse Product Check. No text,
diagrams or tables are reproduced.

## Methods

### CLEAR CT — Customer Technology Trust scan (NetworkGain Consulting)

- **Version:** v3.1 "Canonical Master" (29 September 2026), internal and unpublished; read locally during design.
- **What we took from it:** the idea of three separately reported pillars; lifecycle tiers CT-T0…T6 with
  carry-forward of unresolved gates; points of presence with availability statuses; evidence-before-opinion and the
  PASS/PARTIAL/FAIL/BLOCKED/NOT_TESTED/NOT_APPLICABLE vocabulary; P0–P3 and UX0–UX3 severities; hard gates and risk
  acceptance that cannot cover P0; coverage and confidence shown beside every score.
- **What we did not take:** its prompts, question flows, control catalogs, scoring dimensions, report templates and
  wording. Product Check's 47 controls, rubric weights, caps, confidence rules, verdict rules and texts are its own.
- **Relationship:** `inspired` (see ATTRIBUTION.md). Not an implementation, not certified.

## Practice and standards consulted for control content

| Source                                                                                                              | Used for                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)                                       | Which response headers to check (CSP, HSTS, X-Frame-Options/frame-ancestors, nosniff, X-Powered-By)   |
| [RFC 6797 HSTS](https://www.rfc-editor.org/rfc/rfc6797)                                                             | HSTS semantics; the 15552000-second minimum is a common recommendation, not an RFC requirement        |
| [RFC 9116 security.txt](https://www.rfc-editor.org/rfc/rfc9116)                                                     | Security contact control                                                                              |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (1.1.1, 3.1.1)                                                            | Text alternatives and page language                                                                   |
| Supabase documentation on API keys                                                                                  | That the `anon` key is public and the `service_role` key bypasses row-level security (JWT role check) |
| Framework docs on public env prefixes (Next.js `NEXT_PUBLIC_`, Vite `VITE_`, CRA `REACT_APP_`, Expo `EXPO_PUBLIC_`) | Client-exposed secret control                                                                         |

Each was consulted for facts, not copied. Product Check does not claim conformance with any of them.

## Engineering Commons siblings

[Spec Check](https://github.com/enwithai/spec-check) (report schema 1.0), [Impact Check](https://github.com/enwithai/impact-check)
(schema 2.0) and [Outcome Check](https://github.com/enwithai/outcome-check) (schema 1.0): repository conventions and the
report fields read by Product Check's optional importers.
