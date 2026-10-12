# WP-PC-AI-02: Fix PC-AI-02: An AI evaluation suite exists

> DEMO DATA: synthetic example application.

Status: **PROPOSED** · Human approval required: **no** · Source run: PCR-20261014T100000Z-36EE7E

## Objective

Add an evaluation suite with representative and adversarial cases; run it when prompts or models change.

## Findings

- PCF-B565960DEE (P2, fact): No promptfoo config, evals/ directory or \*.eval.\* files. at `repository`

## Where to look

- `repository`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Add an evaluation suite with representative and adversarial cases; run it when prompts or models change.
3. Add the regression protection: Eval suite in CI on prompt changes.

## Acceptance criteria

- [ ] Eval suite present and runnable.
- [ ] Control PC-AI-02 evaluates PASS on retest.
- [ ] Finding PCF-B565960DEE (repository) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
