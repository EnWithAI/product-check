## What and why

## Checklist

- [ ] `npm run check:all` passes
- [ ] New or changed controls: catalog entry (tier, weight, gate, remediation) and a failing test written first
- [ ] Nothing reports PASS without evidence; unchecked states carry a reason
- [ ] No new network access, process execution, telemetry or runtime dependency (or discussed in an issue first)
- [ ] Fixtures and demo data synthetic only; secret-like strings assembled at runtime, never committed
- [ ] `CHANGELOG.md` updated; demo regenerated (`npm run build && npm run demo`) if output changed
