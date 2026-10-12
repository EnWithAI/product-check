# Security policy

## Supported versions

Pre-release. Once published, only the latest `0.x` alpha will receive fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting (once the repository is public)
or write to [hello@enwithai.com](mailto:hello@enwithai.com). Include the Product Check version, the command and a
minimal **synthetic** reproduction. Never send real results, HAR files or repositories: they can contain secrets.

## Security properties Product Check is designed to keep

- It never executes repository code, starts processes or uses `eval`/dynamic imports.
- It never reads git-ignored files, and stores only short redacted excerpts and checksums as evidence.
- It sends network requests only when explicitly authorized, only passive GETs to fixed paths on one origin, with no
  cookies, credentials or bodies, a request budget and timeouts. It never follows redirects to other origins.
- It refuses prohibited actions (production writes, destructive tests, outreach, payments, active scanning,
  credentialed access, personal-data extraction) whatever a contract says.
- It has no telemetry, account or model calls.
- Generated Markdown and HTML escape all untrusted text; the dashboard has a `default-src 'none'` CSP and one
  hash-pinned inline script.
- A results file whose figures do not recompute is flagged and cannot be used as a baseline.

A violation of any of these is a security bug. See [docs/threat-model.md](docs/threat-model.md) and
[docs/safety-and-authorization.md](docs/safety-and-authorization.md).
