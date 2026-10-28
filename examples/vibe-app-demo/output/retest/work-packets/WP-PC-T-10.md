# WP-PC-T-10: Fix PC-T-10: Error monitoring is instrumented

> DEMO DATA: synthetic example application.

Status: **FAILED_VERIFICATION** · Human approval required: **no** · Source run: PCR-20261015T100000Z-B68F0A

## Objective

Add an error-tracking or OpenTelemetry SDK, initialise it on server and client, and configure alerting.

## Findings

- PCF-3F928FCAF1 (P2, fact): No error-tracking or telemetry SDK in dependencies. at `package.json`

## Where to look

- `package.json`

## Constraints

- Do not commit secrets, credentials or real customer data; use environment variables and synthetic data.
- Keep the change minimal and focused on the listed findings; do not refactor unrelated code.
- Do not disable, skip or delete tests or checks to make them pass.
- Do not mark this packet done without a Product Check retest showing the control PASS with new evidence.

## Suggested steps

1. Inspect each location listed in context.
2. Add an error-tracking or OpenTelemetry SDK, initialise it on server and client, and configure alerting.
3. Add the regression protection: A deliberate test error in staging appears in the monitoring tool.

## Acceptance criteria

- [ ] A monitoring SDK is installed and initialised.
- [ ] Control PC-T-10 evaluates PASS on retest.
- [ ] Finding PCF-3F928FCAF1 (package.json) is no longer observed on retest.

## Verify

```bash
product-check retest --baseline <this results file> (with the same inputs as this run)
```

This packet is complete only when the retest reports the control PASS; a completion claim alone is not verification.
