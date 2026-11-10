// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Executable regression-test candidates for controls where a small, safe, framework-neutral test can be written:
 * header and status assertions against the user's own deployment (Node's built-in test runner and fetch) and a
 * secret-pattern guard for CI. Candidates are text in the blueprint; Product Check never runs them.
 */
/** A runnable test candidate, or null when none is defensible for the control. */
export function regressionCandidate(controlId, origin) {
    const base = origin ?? "https://your-app.example";
    const header = (name, assertion) => ({
        language: "javascript (node --test)",
        code: [
            `// Save as test/${name}.test.mjs and run: BASE_URL=${base} node --test`,
            `import test from "node:test";`,
            `import assert from "node:assert/strict";`,
            `const BASE_URL = process.env.BASE_URL ?? "${base}";`,
            `test("${name}", async () => {`,
            `  const res = await fetch(BASE_URL, { redirect: "manual" });`,
            `  ${assertion}`,
            `});`,
            ``,
        ].join("\n"),
    });
    switch (controlId) {
        case "PC-C-01":
            return header("entry-page-reachable", `assert.ok(res.status >= 200 && res.status < 400, \`status \${res.status}\`);`);
        case "PC-C-06":
            return {
                language: "javascript (node --test)",
                code: [
                    `// Save as test/not-found.test.mjs and run: BASE_URL=${base} node --test`,
                    `import test from "node:test";`,
                    `import assert from "node:assert/strict";`,
                    `const BASE_URL = process.env.BASE_URL ?? "${base}";`,
                    `test("unknown paths return 404", async () => {`,
                    `  const res = await fetch(new URL("/this-page-does-not-exist-" + Date.now(), BASE_URL));`,
                    `  assert.equal(res.status, 404);`,
                    `});`,
                    ``,
                ].join("\n"),
            };
        case "PC-S-04":
            return header("hsts", `assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=(\\d{8,}|1[5-9]\\d{6}|[2-9]\\d{7})/);`);
        case "PC-S-05":
            return header("content-security-policy", `assert.ok(res.headers.get("content-security-policy"), "CSP header missing");`);
        case "PC-S-06":
            return header("framing-policy", `const csp = res.headers.get("content-security-policy") ?? "";\n  assert.ok(/frame-ancestors/.test(csp) || /^(deny|sameorigin)$/i.test(res.headers.get("x-frame-options") ?? ""));`);
        case "PC-S-07":
            return header("nosniff", `assert.equal(res.headers.get("x-content-type-options"), "nosniff");`);
        case "PC-S-10":
            return header("no-stack-disclosure", `assert.equal(res.headers.get("x-powered-by"), null);`);
        case "PC-S-01":
        case "PC-S-02":
            return {
                language: "yaml (GitHub Actions step)",
                code: [
                    `# Add to your CI workflow: fails the build when credentials or public-prefixed secrets are committed.`,
                    `- name: Secret guard`,
                    `  run: |`,
                    `    ! git grep -nE '(sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE))' -- . ':!*.lock' ':!package-lock.json'`,
                    ``,
                ].join("\n"),
            };
        case "PC-S-09":
            return {
                language: "javascript (node --test)",
                code: [
                    `// Save as test/no-exposed-files.test.mjs and run: BASE_URL=${base} node --test`,
                    `import test from "node:test";`,
                    `import assert from "node:assert/strict";`,
                    `const BASE_URL = process.env.BASE_URL ?? "${base}";`,
                    `for (const path of ["/.env", "/.env.local", "/.git/HEAD", "/.git/config"]) {`,
                    `  test(\`\${path} is not served\`, async () => {`,
                    `    const res = await fetch(new URL(path, BASE_URL), { redirect: "manual" });`,
                    `    const body = res.ok ? await res.text() : "";`,
                    `    assert.ok(!res.ok || !/^([A-Z_][A-Z0-9_]*=|ref: refs\\/|\\[core\\])/m.test(body), \`\${path} exposed\`);`,
                    `  });`,
                    `}`,
                    ``,
                ].join("\n"),
            };
        default:
            return null;
    }
}
