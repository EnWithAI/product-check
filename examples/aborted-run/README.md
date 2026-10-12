# Example: aborted run

`product-check run --url https://vibenotes-demo.example --mode APPLICATION` without authorization. The safety gate
refuses (exit 4) and the CLI records an `ABORTED` results document: every control BLOCKED with the refusal reason,
no network use, verdict INCONCLUSIVE. It validates against the same schema as any other run.
