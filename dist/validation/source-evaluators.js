// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Source evaluators: static, read-only checks over the repository snapshot. Each returns null when no repository
 * was scanned. Static evidence proves what the files contain, never how the running product behaves.
 */
import { isMinified } from "../discovery/repo.js";
import { lineOf, lineText } from "../inspectors/source/facts.js";
import { sha256 } from "../util/hash.js";
import { checked, unchecked, } from "./context.js";
const MAX_FINDINGS_PER_CONTROL = 25;
/** Evidence for a file location. */
function fileEv(ctx, file, line, summary, excerpt = null) {
    const f = typeof file === "string" ? ctx.repo?.snapshot.byPath.get(file) : file;
    const path = typeof file === "string" ? file : file.path;
    return ctx.ev.add({
        kind: line === null ? "file-presence" : "source-location",
        pop: "repository",
        strength: "static",
        provenance: "observed",
        locator: path,
        line,
        revision: ctx.revision,
        summary,
        excerpt,
        checksum: f?.sha256 ?? null,
    });
}
/** Evidence that a search over a set of files found nothing (scoped negative result). */
function scopeEv(ctx, files, what) {
    const fingerprint = sha256(files.map((f) => `${f.path}:${f.sha256 ?? ""}`).join("\n"));
    return ctx.ev.add({
        kind: "search-scope",
        pop: "repository",
        strength: "static",
        provenance: "observed",
        locator: `repository (${files.length} text files)`,
        revision: ctx.revision,
        summary: `Searched ${files.length} readable, non-ignored text files for ${what} (rubric pc-rubric-0.2).`,
        checksum: fingerprint,
    });
}
/** Describes the version-control state of a file. */
function tracking(f) {
    if (f.tracked === true)
        return "tracked in the git index (committed or staged)";
    if (f.tracked === false)
        return f.ignored ? "git-ignored" : "untracked and not git-ignored (would be committed by `git add .`)";
    return "version-control state unknown (no readable git index)";
}
/** Product Check's own result files (reports about a product, not product code) are not pattern-scanned. */
function isProductCheckReport(f) {
    return (f.path.endsWith(".json") &&
        /"kind":\s*"(product-check-results|observations|blueprint)"/.test((f.text ?? "").slice(0, 400)));
}
/**
 * Test, fixture and example paths. Credential-like strings there are usually deliberate fakes, so matches are
 * reported as P2 hypotheses for human review instead of P0 facts (they never fail the secrets gate on their own).
 */
export const FIXTURE_PATH = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|__fixtures__|testdata|mocks?|__mocks__|examples?|demos?|samples?)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(py|go)$/;
/** Readable files suitable for pattern scanning. */
function scanFiles(repo, filter = () => true) {
    return repo.snapshot.files.filter((f) => f.text !== null &&
        !isMinified(f) &&
        !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|poetry\.lock|Pipfile\.lock|uv\.lock)$/.test(f.path) &&
        !isProductCheckReport(f) &&
        filter(f));
}
/** Wraps an evaluator so it returns null without a repository. */
const withRepo = (fn) => (ctx) => ctx.repo ? fn(ctx, ctx.repo) : null;
/** Decodes a JWT payload's `role` claim without verifying it. */
function jwtRole(token) {
    try {
        const payload = token.split(".")[1] ?? "";
        const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
        return typeof json.role === "string" ? json.role : null;
    }
    catch {
        return null;
    }
}
const PLACEHOLDER = /(your|example|xxx|changeme|placeholder|dummy|sample|replace|<|\$\{|process\.env|\*\*\*|redacted|todo|test1234|password123)/i;
/** Shannon entropy in bits per character. */
function entropy(s) {
    const counts = new Map();
    for (const ch of s)
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
    let h = 0;
    for (const n of counts.values()) {
        const p = n / s.length;
        h -= p * Math.log2(p);
    }
    return h;
}
export const SECRET_RULES = [
    {
        name: "private-key",
        re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
        severity: "P0",
        describe: "private key",
    },
    {
        name: "aws-access-key",
        re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
        severity: "P0",
        describe: "AWS access key ID",
    },
    {
        name: "github-token",
        re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        severity: "P0",
        describe: "GitHub token",
    },
    { name: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, severity: "P0", describe: "Slack token" },
    {
        name: "llm-api-key",
        re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/g,
        severity: "P0",
        describe: "AI provider API key (sk-…)",
    },
    { name: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/g, severity: "P0", describe: "npm token" },
    {
        name: "stripe-secret-key",
        re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
        severity: "P0",
        describe: "Stripe secret key",
        check: (m) => (m.includes("_live_") ? "P0" : "P2"),
    },
    {
        name: "service-role-jwt",
        re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        severity: "P0",
        describe: "service-role JWT (bypasses row-level security)",
        check: (m) => (jwtRole(m) === "service_role" ? "P0" : null),
    },
    {
        name: "url-credentials",
        re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@"'`]+:[^\s/@"'`]+@[^\s/"'`]+/gi,
        severity: "P0",
        describe: "credentials embedded in a connection URL",
        check: (m) => {
            const pass = /:\/\/[^:]+:([^@]+)@/.exec(m)?.[1] ?? "";
            if (PLACEHOLDER.test(pass) || /^(password|postgres|root|user|pass|secret)$/i.test(pass))
                return null;
            return /@(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|mysql|redis|mongo)(:|\/|$)/i.test(m)
                ? "P2"
                : "P0";
        },
    },
    {
        name: "hardcoded-secret-assignment",
        re: /\b[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET)[A-Za-z0-9_]*["']?\s*[:=]\s*["']([^"'\s]{16,})["']/gi,
        severity: "P1",
        describe: "high-entropy literal assigned to a secret-named variable",
        check: (m) => {
            const value = /["']([^"'\s]{16,})["']\s*$/.exec(m)?.[1] ?? "";
            if (PLACEHOLDER.test(value) || entropy(value) < 3.5 || !/[0-9]/.test(value) || !/[A-Za-z]/.test(value))
                return null;
            return "P1";
        },
    },
];
const PC_S_01 = withRepo((ctx, repo) => {
    const files = scanFiles(repo);
    const findings = [];
    const evidence = [];
    for (const f of files) {
        const text = f.text;
        const seen = new Set();
        for (const rule of SECRET_RULES) {
            rule.re.lastIndex = 0;
            for (const m of text.matchAll(rule.re)) {
                const severity = rule.check ? rule.check(m[0]) : rule.severity;
                if (severity === null)
                    continue;
                const line = lineOf(text, m.index ?? 0);
                const key = `${rule.name}:${sha256(m[0]).slice(0, 16)}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                const id = fileEv(ctx, f, line, `${rule.describe} pattern (${rule.name}) in a file that is ${tracking(f)}`, lineText(text, line));
                evidence.push(id);
                const fixture = FIXTURE_PATH.test(f.path);
                const hypothesis = rule.name === "hardcoded-secret-assignment" || fixture;
                findings.push({
                    fingerprint: `${f.path}|${key}`,
                    location: `${f.path}:${line}`,
                    actual: `A ${rule.describe} appears at ${f.path}:${line}; the file is ${tracking(f)}. Validity was not checked (Product Check never uses credentials).`,
                    evidence: [id],
                    epistemic: hypothesis ? "hypothesis" : "fact",
                    confidence: hypothesis ? "LOW" : f.tracked === true ? "HIGH" : "MEDIUM",
                    severity: fixture && (severity === "P0" || severity === "P1") ? "P2" : severity,
                    ...(fixture
                        ? {
                            actual: `A ${rule.describe} pattern appears at ${f.path}:${line}, a test/fixture/example path; it is probably a deliberate fake. Verify it is not a real credential.`,
                        }
                        : {}),
                    title: `${rule.describe[0]?.toUpperCase() ?? ""}${rule.describe.slice(1)} in ${f.path}`,
                    reproduction: [`Open ${f.path} at line ${line} (value redacted in this report).`],
                });
            }
        }
    }
    if (findings.length === 0) {
        return checked("PASS", `No credential patterns found in ${files.length} readable files.`, "static-analysis", "static", [scopeEv(ctx, files, "credential patterns")]);
    }
    const worst = findings.some((x) => x.severity === "P0" && x.epistemic !== "hypothesis");
    const status = worst ? "FAIL" : "PARTIAL";
    return checked(status, `${findings.length} credential-like string(s) found in ${new Set(findings.map((x) => x.location.split(":")[0])).size} file(s).`, "static-analysis", "static", evidence, findings.slice(0, MAX_FINDINGS_PER_CONTROL));
});
const PUBLIC_SECRET = /\b(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_|PUBLIC_)([A-Z0-9_]*?)(SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|ADMIN_KEY|OPENAI|ANTHROPIC|GROQ|GEMINI|MISTRAL|COHERE|REPLICATE|DATABASE_URL|DB_URL|AWS_SECRET)[A-Z0-9_]*\b/g;
const PC_S_02 = withRepo((ctx, repo) => {
    const files = scanFiles(repo, (f) => /\.([cm]?[jt]sx?|vue|svelte|astro|json|ya?ml|toml)$/.test(f.path) || /(^|\/)\.env/.test(f.path));
    const findings = [];
    const evidence = [];
    for (const f of files) {
        const text = f.text;
        const seen = new Set();
        for (const m of text.matchAll(PUBLIC_SECRET)) {
            const name = m[0];
            if (seen.has(name))
                continue;
            const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
            const isEnvFile = /(^|\/)\.env/.test(f.path);
            // The bare PUBLIC_ prefix (SvelteKit/Astro) only counts in an env context: env files, `env.X`/`env["X"]`
            // access (process.env, import.meta.env, $env/dynamic/public) or a file importing from $env/static/public.
            if (m[1] === "PUBLIC_" &&
                !isEnvFile &&
                !/env(\.|\[["'])$/.test(before) &&
                !/from\s+["']\$env\/static\/public["']/.test(text))
                continue;
            seen.add(name);
            const line = lineOf(text, m.index ?? 0);
            const strong = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD/.test(m[3] ?? "");
            const fixture = FIXTURE_PATH.test(f.path);
            const id = fileEv(ctx, f, line, `client-exposed variable name ${name}`, lineText(text, line));
            evidence.push(id);
            findings.push({
                fingerprint: `${f.path}|${name}`,
                location: `${f.path}:${line}`,
                actual: `${name} uses the client-exposed prefix ${m[1] ?? ""}; bundlers inline such variables into JavaScript served to every visitor.`,
                evidence: [id],
                epistemic: fixture ? "hypothesis" : "inference",
                confidence: fixture ? "LOW" : strong ? "HIGH" : "MEDIUM",
                severity: fixture ? "P2" : "P0",
                title: `Privileged key ${name} exposed to the browser`,
                reproduction: [`Search the built client bundle for the value of ${name}.`],
            });
        }
    }
    if (findings.length === 0) {
        return checked("PASS", `No secret-named variables with client-exposed prefixes in ${files.length} files.`, "static-analysis", "static", [scopeEv(ctx, files, "secret-named variables with public prefixes")]);
    }
    return checked(findings.some((x) => x.severity === "P0") ? "FAIL" : "PARTIAL", `${findings.length} secret-named variable(s) use a client-exposed prefix.`, "static-analysis", "static", evidence, findings.slice(0, MAX_FINDINGS_PER_CONTROL));
});
const PC_S_03 = withRepo((ctx, repo) => {
    const findings = [];
    const evidence = [];
    for (const f of repo.envFiles) {
        const committed = f.tracked === true;
        const exposed = committed || !f.ignored;
        if (!exposed) {
            evidence.push(fileEv(ctx, f, null, `${f.path} exists locally and is ${tracking(f)}`));
            continue;
        }
        const id = fileEv(ctx, f, null, `${f.path} is ${tracking(f)}`);
        evidence.push(id);
        findings.push({
            fingerprint: f.path,
            location: f.path,
            actual: `${f.path} is ${tracking(f)}.`,
            evidence: [id],
            epistemic: f.tracked === null ? "inference" : "fact",
            confidence: f.tracked === null ? "MEDIUM" : "HIGH",
            severity: committed ? "P1" : "P2",
            title: committed
                ? `Environment file ${f.path} is committed`
                : `Environment file ${f.path} is not git-ignored`,
        });
    }
    if (findings.length > 0) {
        return checked("FAIL", `${findings.length} environment file(s) are or would be committed.`, "static-analysis", "static", evidence, findings);
    }
    const covered = repo.snapshot.ignores(".env") && repo.snapshot.ignores(".env.local");
    if (repo.gitignore)
        evidence.push(fileEv(ctx, repo.gitignore, null, covered ? ".gitignore ignores .env and .env.local" : ".gitignore does not ignore .env"));
    if (covered) {
        const note = repo.envFiles.length > 0
            ? `${repo.envFiles.length} local env file(s) are git-ignored`
            : "no local env files";
        return checked("PASS", `.gitignore covers environment files; ${note}.`, "static-analysis", "static", evidence);
    }
    const id = repo.gitignore
        ? evidence[0]
        : scopeEv(ctx, repo.snapshot.files.filter((f) => f.path === ".gitignore"), "a .gitignore covering .env files");
    return checked("PARTIAL", "No environment files are present, but .gitignore does not cover .env files yet.", "static-analysis", "static", [id], [
        {
            fingerprint: ".gitignore|env",
            location: ".gitignore",
            actual: ".env and .env.local are not ignored.",
            evidence: [id],
            epistemic: "inference",
            confidence: "HIGH",
            severity: "P3",
            title: ".gitignore does not cover environment files",
        },
    ]);
});
// ---------------------------------------------------------------------------------------------- risky code
const RISKY = [
    { name: "eval", re: /(?<![\w.])(eval|new\s+Function)\s*\(/g, describe: "dynamic code evaluation" },
    {
        name: "dangerously-set-inner-html",
        re: /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*(?!["'`])[^}]/g,
        describe: "raw HTML injection of a non-literal value",
    },
    {
        name: "inner-html",
        re: /\.(innerHTML|outerHTML)\s*=\s*(?!["'`]|\s*$)/g,
        describe: "assignment of a non-literal value to innerHTML",
    },
    { name: "raw-sql-unsafe", re: /\$(queryRawUnsafe|executeRawUnsafe)\s*\(/g, describe: "unsafe raw SQL API" },
    {
        name: "sql-interpolation",
        re: /\b(query|execute|raw|sql\.unsafe)\s*\(\s*`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi,
        describe: "SQL built with string interpolation",
    },
];
const PC_S_16 = withRepo((ctx, repo) => {
    const files = scanFiles(repo, (f) => /\.([cm]?[jt]sx?|vue|svelte|astro)$/.test(f.path) &&
        !/(\.test|\.spec)\.|(^|\/)(__tests__|tests?|e2e)\//.test(f.path));
    const findings = [];
    const evidence = [];
    for (const f of files) {
        const text = f.text;
        for (const rule of RISKY) {
            for (const m of text.matchAll(rule.re)) {
                const line = lineOf(text, m.index ?? 0);
                const id = fileEv(ctx, f, line, `${rule.describe} (${rule.name})`, lineText(text, line));
                evidence.push(id);
                findings.push({
                    fingerprint: `${f.path}|${rule.name}|${sha256(lineText(text, line).trim()).slice(0, 12)}`,
                    location: `${f.path}:${line}`,
                    actual: `${rule.describe} at ${f.path}:${line}. Whether untrusted data reaches it was not determined.`,
                    evidence: [id],
                    epistemic: "hypothesis",
                    confidence: "MEDIUM",
                    title: `Possible injection sink: ${rule.describe} in ${f.path}`,
                });
            }
        }
    }
    if (findings.length === 0) {
        return checked("PASS", `No high-risk code patterns in ${files.length} source files.`, "static-analysis", "static", [scopeEv(ctx, files, "eval/raw HTML/raw SQL patterns")]);
    }
    return checked("PARTIAL", `${findings.length} location(s) need review for injection risk.`, "static-analysis", "static", evidence, findings.slice(0, MAX_FINDINGS_PER_CONTROL));
});
const PC_S_17 = withRepo((ctx, repo) => {
    const files = scanFiles(repo, (f) => /\.([cm]?[jt]sx?|py|json)$/.test(f.path));
    const findings = [];
    const evidence = [];
    for (const f of files) {
        const text = f.text;
        const wildcard = /(origin\s*:\s*(["']\*["']|true)|Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*["']|allow_origins\s*=\s*\[\s*["']\*["'])/i.exec(text);
        if (!wildcard)
            continue;
        const credentials = /(credentials\s*:\s*true|Access-Control-Allow-Credentials["']?\s*[,:]\s*["']true["']|allow_credentials\s*=\s*True)/i.test(text);
        const line = lineOf(text, wildcard.index);
        const id = fileEv(ctx, f, line, credentials ? "wildcard/reflected CORS origin with credentials" : "wildcard CORS origin", lineText(text, line));
        evidence.push(id);
        findings.push({
            fingerprint: `${f.path}|cors`,
            location: `${f.path}:${line}`,
            actual: credentials
                ? "CORS allows any (or reflected) origin and credentials in the same file."
                : "CORS allows any origin.",
            evidence: [id],
            epistemic: "hypothesis",
            confidence: credentials ? "MEDIUM" : "LOW",
            severity: credentials ? "P2" : "P3",
            title: credentials ? `Credentialed wildcard CORS in ${f.path}` : `Wildcard CORS in ${f.path}`,
        });
    }
    if (findings.length === 0) {
        return checked("PASS", "No wildcard CORS configuration found in source.", "static-analysis", "static", [
            scopeEv(ctx, files, "wildcard CORS configuration"),
        ]);
    }
    return checked(findings.some((x) => x.severity === "P2") ? "FAIL" : "PARTIAL", `${findings.length} wildcard CORS configuration(s).`, "static-analysis", "static", evidence, findings);
});
// ---------------------------------------------------------------------------------------------- AI
const AI_IMPORT = /(from\s+["'](openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|groq-sdk|@mistralai\/mistralai|cohere-ai)["']|require\(\s*["'](openai|@anthropic-ai\/sdk)["']\s*\))/;
const PC_AI_01 = withRepo((ctx, repo) => {
    if (!ctx.aiInScope)
        return unchecked("NOT_APPLICABLE", "No AI SDK dependency was found and the contract does not declare AI use.");
    const files = scanFiles(repo, (f) => /\.([cm]?[jt]sx?|vue|svelte)$/.test(f.path));
    const spa = repo.deps.has("vite") || repo.deps.has("react-scripts");
    const serverish = repo.deps.has("next") ||
        repo.deps.has("express") ||
        repo.deps.has("@sveltejs/kit") ||
        repo.deps.has("nuxt") ||
        repo.deps.has("@remix-run/react") ||
        repo.deps.has("hono") ||
        repo.deps.has("fastify");
    const findings = [];
    const evidence = [];
    for (const f of files) {
        const text = f.text;
        const imp = AI_IMPORT.exec(text);
        const browser = /dangerouslyAllowBrowser\s*:\s*true/.exec(text);
        const clientMarked = /^\s*["']use client["']/m.test(text);
        const spaClient = spa && !serverish && /^(src|app)\//.test(f.path) && !/(^|\/)(server|api)\//.test(f.path);
        if (!browser && !(imp && (clientMarked || spaClient)))
            continue;
        const at = browser ?? imp;
        const line = lineOf(text, at?.index ?? 0);
        const why = browser
            ? "enables dangerouslyAllowBrowser"
            : clientMarked
                ? "imports an AI SDK in a 'use client' component"
                : "imports an AI SDK in a client-only single-page app";
        const id = fileEv(ctx, f, line, `AI SDK used client-side: ${why}`, lineText(text, line));
        evidence.push(id);
        findings.push({
            fingerprint: `${f.path}|ai-client`,
            location: `${f.path}:${line}`,
            actual: `${f.path} ${why}; the provider key must then be available in the browser.`,
            evidence: [id],
            epistemic: browser || clientMarked ? "fact" : "inference",
            confidence: browser || clientMarked ? "HIGH" : "MEDIUM",
            title: `AI provider called from the browser in ${f.path}`,
        });
    }
    if (findings.length === 0) {
        return checked("PASS", "AI SDK imports are not in client-marked files and browser use is not enabled.", "static-analysis", "static", [scopeEv(ctx, files, "client-side AI SDK use")]);
    }
    return checked("FAIL", `${findings.length} client-side AI SDK use(s).`, "static-analysis", "static", evidence, findings);
});
const PC_AI_02 = withRepo((ctx, repo) => {
    if (!ctx.aiInScope)
        return unchecked("NOT_APPLICABLE", "No AI SDK dependency was found and the contract does not declare AI use.");
    if (repo.aiEvals.length > 0) {
        return checked("PASS", `AI evaluation files found: ${repo.aiEvals.slice(0, 3).join(", ")}.`, "static-analysis", "static", repo.aiEvals.slice(0, 5).map((p) => fileEv(ctx, p, null, "AI evaluation file")));
    }
    const id = scopeEv(ctx, repo.snapshot.files, "AI evaluation suites (promptfoo, evals/, *.eval.*)");
    return checked("FAIL", "AI is used but no evaluation suite was found.", "static-analysis", "static", [id], [
        {
            fingerprint: "ai-evals",
            location: "repository",
            actual: "No promptfoo config, evals/ directory or *.eval.* files.",
            evidence: [id],
            epistemic: "fact",
            confidence: "MEDIUM",
            title: "AI features have no evaluation suite",
        },
    ]);
});
// ---------------------------------------------------------------------------------------------- technology
/** A simple presence check: PASS with file evidence, or FAIL with a scope evidence and one finding. */
function presence(ctx, repo, found, passText, failText, fingerprint, title) {
    if (found.length > 0) {
        return checked("PASS", passText, "static-analysis", "static", found.slice(0, 5).map((l) => fileEv(ctx, l.path, l.line, l.detail)));
    }
    const id = scopeEv(ctx, repo.snapshot.files, title.toLowerCase());
    return checked("FAIL", failText, "static-analysis", "static", [id], [
        {
            fingerprint,
            location: "repository",
            actual: failText,
            evidence: [id],
            epistemic: "fact",
            confidence: "HIGH",
            title,
        },
    ]);
}
const PC_T_01 = withRepo((ctx, repo) => {
    if (repo.malformedManifests.length > 0) {
        const ids = repo.malformedManifests.map((p) => fileEv(ctx, p, null, "package.json is not valid JSON"));
        return checked("FAIL", `Malformed manifest(s): ${repo.malformedManifests.join(", ")}; installs and builds will fail.`, "static-analysis", "static", ids, repo.malformedManifests.map((p, i) => ({
            fingerprint: `${p}|malformed`,
            location: p,
            actual: `${p} is not valid JSON.`,
            evidence: [ids[i]],
            epistemic: "fact",
            confidence: "HIGH",
            severity: "P1",
            title: `Malformed manifest ${p}`,
        })));
    }
    if (repo.manifests.length === 0) {
        const id = scopeEv(ctx, repo.snapshot.files, "dependency manifests");
        return checked("FAIL", "No dependency manifest (package.json, requirements.txt, pyproject.toml) found.", "static-analysis", "static", [id], [
            {
                fingerprint: "no-manifest",
                location: "repository",
                actual: "No dependency manifest found.",
                evidence: [id],
                epistemic: "fact",
                confidence: "HIGH",
                title: "No dependency manifest",
            },
        ]);
    }
    const root = repo.manifests[0];
    const dir = root.path.includes("/") ? root.path.slice(0, root.path.lastIndexOf("/") + 1) : "";
    const lock = repo.lockfiles.find((l) => l.startsWith(dir) && !l.slice(dir.length).includes("/")) ??
        (dir === "" ? undefined : repo.lockfiles.find((l) => !l.includes("/")));
    const manifestEv = fileEv(ctx, root.path, null, `dependency manifest (${Object.keys(root.deps).length} dependencies)`);
    if (lock)
        return checked("PASS", `Manifest ${root.path} with lockfile ${lock}.`, "static-analysis", "static", [
            manifestEv,
            fileEv(ctx, lock, null, "lockfile"),
        ]);
    if (root.ecosystem === "python" && /==/.test(root.text) && !/(>=|~=|\^)/.test(root.text)) {
        return checked("PASS", `${root.path} pins exact versions.`, "static-analysis", "static", [manifestEv]);
    }
    return checked("FAIL", `Manifest ${root.path} has no lockfile next to it.`, "static-analysis", "static", [manifestEv], [
        {
            fingerprint: `${root.path}|lockfile`,
            location: root.path,
            actual: "No lockfile next to the root manifest.",
            evidence: [manifestEv],
            epistemic: "fact",
            confidence: "HIGH",
            title: "No lockfile: builds are not reproducible",
        },
    ]);
});
const PC_T_02 = withRepo((ctx, repo) => {
    const scriptEv = repo.testScripts.map((s) => fileEv(ctx, s.path, s.line, s.detail));
    if (repo.testFiles.length > 0 && repo.testScripts.length > 0) {
        return checked("PASS", `${repo.testFiles.length} test file(s) and a test command.`, "static-analysis", "static", [...scriptEv, ...repo.testFiles.slice(0, 3).map((p) => fileEv(ctx, p, null, "test file"))]);
    }
    if (repo.testFiles.length > 0) {
        const ids = repo.testFiles.slice(0, 3).map((p) => fileEv(ctx, p, null, "test file"));
        return checked("PARTIAL", `${repo.testFiles.length} test file(s) but no test command in the manifest.`, "static-analysis", "static", ids, [
            {
                fingerprint: "no-test-script",
                location: repo.manifests[0]?.path ?? "repository",
                actual: "Test files exist but no `test` script runs them.",
                evidence: ids,
                epistemic: "fact",
                confidence: "HIGH",
                severity: "P3",
                title: "Tests exist but there is no test command",
            },
        ]);
    }
    const id = scopeEv(ctx, repo.snapshot.files, "test files (*.test.*, *.spec.*, tests/, __tests__/, test_*.py)");
    return checked("FAIL", "No automated test files found.", "static-analysis", "static", [id], [
        {
            fingerprint: "no-tests",
            location: "repository",
            actual: "No automated test files found.",
            evidence: [id],
            epistemic: "fact",
            confidence: "HIGH",
            title: "No automated tests",
        },
    ]);
});
const PC_T_04 = withRepo((ctx, repo) => presence(ctx, repo, repo.ciFiles.map((f) => ({ path: f.path, line: null, detail: "CI configuration" })), `CI configuration: ${repo.ciFiles.map((f) => f.path).join(", ")}.`, "No CI configuration found.", "no-ci", "No CI pipeline"));
const TEST_CMD = /\b(npm (run )?test|npm t\b|pnpm (run )?test|yarn (run )?test|bun (run )?test|npx (vitest|jest|playwright)|vitest|jest\b|playwright test|pytest|go test|cargo test|python -m (pytest|unittest))/;
/** True when an npm script (followed through `npm run x` indirection, depth ≤ 5) runs tests. */
function scriptRunsTests(scripts, name, depth = 0) {
    const body = scripts[name];
    if (body === undefined || depth > 5)
        return false;
    if (TEST_CMD.test(body) || /^test(:|$)/.test(name))
        return true;
    return [...body.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+|run-script\s+)?([\w:.-]+)/g)].some((m) => {
        const next = m[1] ?? "";
        return next !== name && next !== "ci" && next !== "install" && scriptRunsTests(scripts, next, depth + 1);
    });
}
const PC_T_05 = withRepo((ctx, repo) => {
    if (repo.ciFiles.length === 0)
        return unchecked("NOT_APPLICABLE", "No CI configuration exists (see PC-T-04).");
    const scripts = Object.assign({}, ...repo.manifests
        .filter((m) => m.ecosystem === "npm")
        .reverse()
        .map((m) => m.scripts));
    for (const f of repo.ciFiles) {
        const text = f.text ?? "";
        const m = TEST_CMD.exec(text);
        if (m) {
            const line = lineOf(text, m.index);
            return checked("PASS", `${f.path} runs tests (${m[0]}).`, "static-analysis", "static", [
                fileEv(ctx, f, line, "CI test command", lineText(text, line)),
            ]);
        }
        for (const run of text.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+|run-script\s+)?([\w:.-]+)/g)) {
            const script = run[1] ?? "";
            if (script === "ci" || script === "install" || !scriptRunsTests(scripts, script))
                continue;
            const line = lineOf(text, run.index ?? 0);
            return checked("PASS", `${f.path} runs \`${script}\`, whose script chain runs the tests.`, "static-analysis", "static", [
                fileEv(ctx, f, line, `CI runs script ${script}`, lineText(text, line)),
                fileEv(ctx, repo.manifests[0]?.path ?? "package.json", null, `scripts.${script} = ${scripts[script] ?? ""}`),
            ]);
        }
    }
    const ids = repo.ciFiles
        .slice(0, 5)
        .map((f) => fileEv(ctx, f, null, "CI configuration without a test command"));
    return checked("FAIL", "CI configuration does not invoke a test command.", "static-analysis", "static", ids, [
        {
            fingerprint: "ci-no-tests",
            location: repo.ciFiles[0]?.path ?? "CI",
            actual: "No test command in CI configuration.",
            evidence: ids,
            epistemic: "fact",
            confidence: "MEDIUM",
            title: "CI does not run the tests",
        },
    ]);
});
const PC_T_06 = withRepo((ctx, repo) => {
    const readme = repo.readme;
    if (!readme || readme.text === null) {
        const id = scopeEv(ctx, repo.snapshot.files, "a README");
        return checked("FAIL", "No README found.", "static-analysis", "static", [id], [
            {
                fingerprint: "no-readme",
                location: "repository",
                actual: "No README.",
                evidence: [id],
                epistemic: "fact",
                confidence: "HIGH",
                title: "No README with setup instructions",
            },
        ]);
    }
    const text = readme.text;
    const install = /\b(npm (ci|install|i)\b|pnpm (install|i)\b|yarn( install)?\b|bun install|pip install|poetry install|uv sync|docker compose up|getting started|installation|setup)/i.exec(text);
    const run = /\b(npm (run )?(dev|start)|pnpm (run )?(dev|start)|yarn (dev|start)|bun (run )?dev|python [\w./-]+\.py|uvicorn|flask run|docker compose up|streamlit run|npx next dev)/i.exec(text);
    const usage = /^#{1,4}\s*(usage|quick ?start|getting started|run|running|demo|try it|60-second demo)\b/im.exec(text);
    if (install && (run || usage)) {
        const line = lineOf(text, install.index);
        return checked("PASS", `${readme.path} documents install and run commands.`, "static-analysis", "static", [fileEv(ctx, readme, line, "README install/run instructions", lineText(text, line))]);
    }
    const id = fileEv(ctx, readme, null, `README without ${install ? "" : "install "}${!install && !run ? "or " : ""}${run ? "" : "run "}instructions`);
    return checked("PARTIAL", `${readme.path} lacks ${!install ? "install" : ""}${!install && !run ? " and " : ""}${!run ? "run" : ""} instructions.`, "static-analysis", "static", [id], [
        {
            fingerprint: "readme-setup",
            location: readme.path,
            actual: "README does not explain how to install and run.",
            evidence: [id],
            epistemic: "fact",
            confidence: "MEDIUM",
            title: "README lacks setup/run instructions",
        },
    ]);
});
const PC_T_07 = withRepo((ctx, repo) => presence(ctx, repo, repo.runtimeDecl, `Runtime declared: ${repo.runtimeDecl.map((r) => r.detail).join("; ")}.`, "No runtime version declaration found.", "no-runtime", "Runtime version is not declared"));
const PC_T_08 = withRepo((ctx, repo) => presence(ctx, repo, repo.staticAnalysis, `Static analysis configured: ${[...new Set(repo.staticAnalysis.map((s) => s.detail))].join("; ")}.`, "No strict type checking or linter configuration found.", "no-static-analysis", "No type checking or linting configured"));
const PC_T_09 = withRepo((ctx, repo) => {
    const npm = repo.manifests.filter((m) => m.ecosystem === "npm");
    if (npm.length === 0)
        return unchecked("NOT_TESTED", "Only npm manifests are checked for unbounded versions in this release.");
    const findings = [];
    const evidence = [];
    for (const m of npm) {
        for (const [name, version] of Object.entries({ ...m.deps, ...m.devDeps })) {
            const v = version.trim();
            const open = v === "" ||
                v === "*" ||
                v === "latest" ||
                v === "x" ||
                /^>=?\s*[\d.]+$/.test(v) ||
                (/^(git\+|git:|github:|https?:)/.test(v) && !/#[0-9a-f]{7,}$/.test(v));
            if (!open)
                continue;
            const idx = m.text.indexOf(`"${name}"`);
            const line = idx >= 0 ? lineOf(m.text, idx) : null;
            const id = fileEv(ctx, m.path, line, `unbounded version for ${name}: ${v || "(empty)"}`, line ? lineText(m.text, line) : null);
            evidence.push(id);
            findings.push({
                fingerprint: `${m.path}|${name}`,
                location: `${m.path}${line ? `:${line}` : ""}`,
                actual: `${name} is declared as "${v}".`,
                evidence: [id],
                epistemic: "fact",
                confidence: "HIGH",
                title: `Unbounded dependency version: ${name}`,
            });
        }
    }
    if (findings.length === 0)
        return checked("PASS", "All npm dependency versions are bounded.", "static-analysis", "static", npm.map((m) => fileEv(ctx, m.path, null, "dependency manifest")));
    return checked("FAIL", `${findings.length} dependency version(s) are unbounded.`, "static-analysis", "static", evidence, findings);
});
const PC_T_10 = withRepo((ctx, repo) => {
    if (repo.observability.length > 0) {
        const ids = repo.observability
            .slice(0, 3)
            .map((d) => fileEv(ctx, repo.deps.get(d)?.manifest ?? "package.json", null, `monitoring dependency ${d}`));
        return checked("PASS", `Monitoring SDK present: ${repo.observability.join(", ")} (presence only; runtime operation not verified).`, "static-analysis", "static", ids);
    }
    if (repo.manifests.length === 0)
        return unchecked("NOT_TESTED", "No dependency manifest to inspect.");
    const id = scopeEv(ctx, repo.snapshot.files.filter((f) => repo.manifests.some((m) => m.path === f.path)), "error-tracking / telemetry dependencies");
    return checked("FAIL", "No error-tracking or telemetry dependency found.", "static-analysis", "static", [id], [
        {
            fingerprint: "no-monitoring",
            location: repo.manifests[0]?.path ?? "repository",
            actual: "No error-tracking or telemetry SDK in dependencies.",
            evidence: [id],
            epistemic: "fact",
            confidence: "MEDIUM",
            title: "No error monitoring",
        },
    ]);
});
const PC_T_11 = withRepo((ctx, repo) => {
    if (repo.dbDeps.length === 0)
        return unchecked("NOT_APPLICABLE", "No database or ORM dependency was found in the manifests.");
    const prismaSchema = repo.snapshot.files.find((f) => /(^|\/)schema\.prisma$/.test(f.path));
    if (repo.migrations.length > 0)
        return checked("PASS", `Migrations: ${repo.migrations.join(", ")}.`, "static-analysis", "static", repo.migrations
            .slice(0, 3)
            .map((p) => fileEv(ctx, repo.snapshot.files.find((f) => f.path.startsWith(`${p}/`)) ?? p, null, "migration directory")));
    const ids = [
        fileEv(ctx, repo.deps.get(repo.dbDeps[0])?.manifest ?? "package.json", null, `database dependency ${repo.dbDeps.join(", ")}`),
    ];
    if (prismaSchema)
        ids.push(fileEv(ctx, prismaSchema, null, "Prisma schema without migrations"));
    return checked("FAIL", `Database dependencies (${repo.dbDeps.join(", ")}) but no migrations directory.`, "static-analysis", "static", ids, [
        {
            fingerprint: "no-migrations",
            location: prismaSchema?.path ?? "repository",
            actual: "Schema changes are not versioned as migrations.",
            evidence: ids,
            epistemic: "inference",
            confidence: "MEDIUM",
            title: "Database schema changes are not versioned",
        },
    ]);
});
// ---------------------------------------------------------------------------------------------- customer (static)
const PC_C_02 = withRepo((ctx, repo) => {
    const docs = repo.markupFiles.filter((f) => /<html\b/i.test(f.text));
    if (docs.length === 0)
        return unchecked("NOT_TESTED", "No <html> document template was found in source.");
    const missing = docs.filter((f) => !/<html\b[^>]*\blang\s*=/i.test(f.text));
    if (missing.length === 0)
        return checked("PASS", `All ${docs.length} document template(s) declare lang.`, "static-analysis", "static", docs
            .slice(0, 3)
            .map((f) => fileEv(ctx, f, lineOf(f.text, f.text.search(/<html\b/i)), "<html> with lang")));
    const findings = missing.map((f) => {
        const line = lineOf(f.text, f.text.search(/<html\b/i));
        const id = fileEv(ctx, f, line, "<html> without lang", lineText(f.text, line));
        return {
            fingerprint: f.path,
            location: `${f.path}:${line}`,
            actual: "<html> has no lang attribute.",
            evidence: [id],
            epistemic: "fact",
            confidence: "HIGH",
            title: `No page language in ${f.path}`,
        };
    });
    return checked("FAIL", `${missing.length} of ${docs.length} template(s) lack lang.`, "static-analysis", "static", findings.flatMap((f) => f.evidence), findings);
});
const PC_C_03 = withRepo((ctx, repo) => {
    const hit = repo.markupFiles.find((f) => /name\s*=\s*["']viewport["']|export\s+const\s+viewport\b/.test(f.text));
    if (hit) {
        const idx = hit.text.search(/name\s*=\s*["']viewport["']|export\s+const\s+viewport\b/);
        return checked("PASS", `Viewport declared in ${hit.path}.`, "static-analysis", "static", [
            fileEv(ctx, hit, lineOf(hit.text, idx), "viewport declaration"),
        ]);
    }
    if (repo.appRouter) {
        const layout = repo.snapshot.files.find((f) => /^(src\/)?app\/layout\.[jt]sx?$/.test(f.path));
        return checked("PASS", "Next.js App Router emits a default responsive viewport (framework default; inferred).", "static-analysis", "inferred", [fileEv(ctx, layout, null, "Next.js App Router root layout (framework default viewport)")]);
    }
    if (!repo.markupFiles.some((f) => /<html\b|<head\b/i.test(f.text)))
        return unchecked("NOT_TESTED", "No document <head> template found in source.");
    const files = repo.markupFiles.filter((f) => /<head\b/i.test(f.text));
    const id = scopeEv(ctx, files, "a viewport meta tag");
    return checked("FAIL", "No viewport meta tag in document templates.", "static-analysis", "static", [id], [
        {
            fingerprint: "no-viewport",
            location: files[0]?.path ?? "templates",
            actual: "No viewport meta tag.",
            evidence: [id],
            epistemic: "fact",
            confidence: "MEDIUM",
            title: "Pages are not configured for mobile",
        },
    ]);
});
const PC_C_04 = withRepo((ctx, repo) => {
    const findings = [];
    let total = 0;
    for (const f of repo.markupFiles) {
        const text = f.text;
        for (const m of text.matchAll(/<(img|Image)\b([^>]*?)\/?>/g)) {
            if (/\{\s*\.\.\./.test(m[2] ?? ""))
                continue;
            total++;
            if (/\balt\s*=/.test(m[2] ?? ""))
                continue;
            const line = lineOf(text, m.index ?? 0);
            const id = fileEv(ctx, f, line, `<${m[1] ?? "img"}> without alt`, lineText(text, line));
            findings.push({
                fingerprint: `${f.path}|${sha256(lineText(text, line).trim()).slice(0, 12)}`,
                location: `${f.path}:${line}`,
                actual: `<${m[1] ?? "img"}> without alt.`,
                evidence: [id],
                epistemic: "fact",
                confidence: "HIGH",
                title: `Image without alt text in ${f.path}`,
            });
        }
    }
    if (total === 0)
        return unchecked("NOT_TESTED", "No image elements found in source templates.");
    if (findings.length === 0)
        return checked("PASS", `All ${total} image element(s) have alt attributes.`, "static-analysis", "static", [scopeEv(ctx, repo.markupFiles, "image elements without alt")]);
    return checked("FAIL", `${findings.length} of ${total} image element(s) lack alt.`, "static-analysis", "static", findings.flatMap((f) => f.evidence), findings.slice(0, MAX_FINDINGS_PER_CONTROL));
});
const PC_C_06 = withRepo((ctx, repo) => {
    if (repo.notFoundPages.length > 0)
        return checked("PASS", `Not-found page in source: ${repo.notFoundPages[0] ?? ""}.`, "static-analysis", "static", [fileEv(ctx, repo.notFoundPages[0], null, "not-found page")]);
    return unchecked("NOT_TESTED", "No dedicated not-found page in source; the served status code needs a deployed URL.");
});
/** Security contact: SECURITY.md in the repository or /.well-known/security.txt on the deployment; either suffices. */
const PC_S_11 = (ctx) => {
    const repo = ctx.repo;
    const txt = ctx.app?.observations.find((o) => o.purpose === "security-txt");
    const evidence = [];
    if (repo && repo.securityPolicy.length > 0) {
        return checked("PASS", `Security policy: ${repo.securityPolicy.join(", ")}.`, "static-analysis", "static", repo.securityPolicy.map((p) => fileEv(ctx, p, null, "security policy / contact")));
    }
    if (txt && txt.status !== null) {
        const served = txt.status >= 200 && txt.status < 300 && !/text\/html/.test(txt.headers["content-type"] ?? "");
        const id = ctx.ev.add({
            kind: "http-response",
            pop: "deployed-web",
            strength: ctx.app?.source === "har" ? "imported-report" : "runtime",
            provenance: ctx.app?.source === "live" ? "observed" : "imported",
            locator: `GET ${txt.url}`,
            summary: `security.txt request (status ${txt.status})`,
            checksum: txt.body_sha256,
        });
        if (served)
            return checked("PASS", "/.well-known/security.txt is served.", ctx.app?.source === "har" ? "imported-report" : "passive-http", ctx.app?.source === "har" ? "imported-report" : "runtime", [id]);
        evidence.push(id);
    }
    if (repo)
        evidence.push(scopeEv(ctx, repo.snapshot.files, "SECURITY.md or .well-known/security.txt"));
    if (evidence.length === 0)
        return null;
    return checked("FAIL", `No security contact: ${repo ? "no SECURITY.md in the repository" : "repository not inspected"}${txt ? `; /.well-known/security.txt answered ${txt.status ?? "nothing"}` : ""}.`, txt ? "passive-http" : "static-analysis", txt && ctx.app?.source !== "har" ? "runtime" : "static", evidence, [
        {
            fingerprint: "security-contact",
            location: repo ? "repository" : (txt?.url ?? "application"),
            actual: "No published security contact.",
            evidence,
            epistemic: "fact",
            confidence: "HIGH",
            title: "No security contact published",
        },
    ]);
};
const PC_S_12 = withRepo((ctx, repo) => {
    if (ctx.contract.product.handles_personal_data === false)
        return unchecked("NOT_APPLICABLE", "The contract declares that no personal data is handled.");
    if (repo.privacyPages.length > 0)
        return checked("PASS", `Privacy page in source: ${repo.privacyPages[0] ?? ""}.`, "static-analysis", "static", [fileEv(ctx, repo.privacyPages[0], null, "privacy page")]);
    return null;
});
/** Source evaluators by control ID. */
export const SOURCE_EVALUATORS = {
    "PC-C-02": PC_C_02,
    "PC-C-03": PC_C_03,
    "PC-C-04": PC_C_04,
    "PC-C-06": PC_C_06,
    "PC-T-01": PC_T_01,
    "PC-T-02": PC_T_02,
    "PC-T-04": PC_T_04,
    "PC-T-05": PC_T_05,
    "PC-T-06": PC_T_06,
    "PC-T-07": PC_T_07,
    "PC-T-08": PC_T_08,
    "PC-T-09": PC_T_09,
    "PC-T-10": PC_T_10,
    "PC-T-11": PC_T_11,
    "PC-S-01": PC_S_01,
    "PC-S-02": PC_S_02,
    "PC-S-03": PC_S_03,
    "PC-S-11": PC_S_11,
    "PC-S-12": PC_S_12,
    "PC-S-16": PC_S_16,
    "PC-S-17": PC_S_17,
    "PC-AI-01": PC_AI_01,
    "PC-AI-02": PC_AI_02,
};
