# Governance

Product Check is the fourth EnWithAI Engineering Commons tool, after Impact Check, Spec Check and Outcome Check, and
follows the Commons charter and attribution standard v1.0.

- **Maintainer and security contact:** Koushik Ramani (@aiwithrk), EnWithAI Technologies (as for the other Commons
  tools).
- **Decisions:** maintainers decide by consensus in issues and pull requests. Changes to the control catalog's gates,
  the scoring/verdict rules or the safety model need a written rationale in the PR and a CHANGELOG entry, because they
  change what results mean.
- **Rubric and schema versions:** `rubric_version` (currently `pc-rubric-0.2`) changes whenever controls, scoring, weights,
  caps, gates or verdict rules change; `schema_version` (currently `0.1.0`) changes with the JSON contract. Both are
  recorded in every results file.
- **Framework relationships** (CLEAR, TRACE) change only with a versioned specification and the owner's approval.
- **Publication** (repository, npm, releases) requires explicit approval by the Commons owner for each action.
