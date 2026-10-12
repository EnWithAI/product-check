# Example: repository-only scan (synthetic)

**DEMO DATA.** The same weak Vibe Notes source as the main demo (baseline commit), scanned in SOURCE mode with no
deployed application. Regenerate with `npm run build && npm run demo`.

It shows what a source-only scan can and cannot claim: every application control is BLOCKED (the deployed-web point
of presence was not provided), Customer and Trust are **not scored** because too little could be checked, and the
verdict is NOT_READY only because source evidence alone proves the secrets gate fails.
