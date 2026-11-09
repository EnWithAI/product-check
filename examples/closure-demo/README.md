# Demo: verified closure on "Vibe Invoices" (synthetic)

**DEMO DATA.** A deliberately weak, synthetic invoices app built in a temporary directory by `run-demo.mjs`. The fake
Stripe key is assembled at run time and never written here; the script fails if it appears in any output.

`run-demo.mjs` drives the CT3 v3.2 workflow with the built CLI, and every step really runs:

1. Baseline scan (`run`) and closure register: the client-side key is a CONFIRMED P0 (`F-001`).
2. Author-side proof (`proof --allow-exec`): `node --test` executed at the baseline commit.
3. Fix packets for verified P0–P2 findings.
4. **Faulty patch**: the key moves to `app/lib/config.ts` and a superficial test (`assert.ok(true)`) passes.
   `verify` fails: the control still reports a P0 at the new location ("the fix moved the problem"). `F-001` goes
   back to IN_PROGRESS (cycle 1).
5. **Correct fix**: the key is read from the server environment; `verify` passes at the exact fix commit
   (targeted re-assessment, gate re-check, the implementer's reproduction test, the policy's suite, no new P0/P1).
6. `close` is refused until two signed human approvals for that commit exist; then `F-001` is CLOSED by `alice`.
7. A **dangerous change** on a branch removes the auth check and fetches invoices by request ID. The review is HIGH
   risk and BLOCK; an AI reviewer's IDOR claim is CORROBORATED by the deterministic object-authorization rule, and
   its claim about a line that does not exist is DISPROVEN.
8. `assure`: release gate, reports and `output/dashboard/index.html`.

```bash
npm run build && node examples/closure-demo/run-demo.mjs
```

`demo-transcript.txt` is the console output of the committed run. Commit SHAs, timestamps and durations change on
every run (keys are generated fresh), so `output/` is illustrative and not byte-compared by the tests; the same
scenarios are asserted in `test/assurance.test.ts`.
