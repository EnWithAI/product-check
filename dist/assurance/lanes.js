import { SECRET_RULES } from "../validation/source-evaluators.js";
const CODE = /\.(c|m)?(j|t)sx?$|\.(py|rb|go|java|kt|php|cs|rs|vue|svelte)$/i;
const TEST = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(py|go)$|(^|\/)test_[^/]+\.py$/i;
const MIGRATION = /(^|\/)(migrations?|migrate|alembic\/versions)\/|\.sql$/i;
const CLIENT = /(^|\/)(app|pages|components|src\/(components|pages|views|client|ui))\/|\.(jsx|tsx|vue|svelte)$|(^|\/)public\//i;
const isCode = (p) => CODE.test(p);
const isProdCode = (p) => CODE.test(p) && !TEST.test(p) && !/(^|\/)(fixtures?|mocks?|__mocks__|examples?|scripts|seed)\//i.test(p);
const isTest = (p) => TEST.test(p);
const re = (r) => (t) => r.exec(t)?.[0] ?? null;
/** Line rules: evaluated on each added line (and on whole files when re-checking a fix). */
export const LINE_RULES = [
    {
        id: "VC-TR-SECRET",
        lane: "trust-security",
        title: "Secret-like credential added to the code",
        severity: "P0",
        pillars: ["trust"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "Credentials come from the runtime environment or a secret manager, never from source.",
        impact: "Anyone with repository or bundle access can use the credential.",
        files: (p) => !/\.(lock|lockb|sum)$|package-lock\.json$/.test(p),
        match: (t) => {
            for (const rule of SECRET_RULES) {
                rule.re.lastIndex = 0;
                for (const m of t.matchAll(rule.re)) {
                    const sev = rule.check ? rule.check(m[0]) : rule.severity;
                    if (sev === "P0" || sev === "P1")
                        return `${rule.name}:${m[0]}`;
                }
            }
            return null;
        },
    },
    {
        id: "VC-TR-CLIENT-ENV",
        lane: "trust-security",
        title: "Privileged environment variable exposed to the browser bundle",
        severity: "P0",
        pillars: ["trust"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "Only public, non-privileged values use client-exposed prefixes (NEXT_PUBLIC_, VITE_, REACT_APP_, PUBLIC_).",
        impact: "The privileged value ships to every visitor's browser.",
        files: (p) => isCode(p) || /(^|\/)\.env/.test(p),
        match: re(/\b(?:NEXT_PUBLIC|VITE|REACT_APP|PUBLIC|EXPO_PUBLIC)_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|ADMIN)[A-Z0-9_]*\b/),
    },
    {
        id: "VC-TR-TLS-DISABLED",
        lane: "trust-security",
        title: "TLS certificate verification disabled",
        severity: "P1",
        pillars: ["trust"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "TLS verification stays on outside of tests.",
        impact: "Traffic can be intercepted and altered.",
        files: isProdCode,
        match: re(/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False/),
    },
    {
        id: "VC-TR-CORS-WILDCARD",
        lane: "trust-security",
        title: "Wildcard CORS with credentials or on an API",
        severity: "P2",
        pillars: ["trust"],
        epistemic: "inference",
        confidence: "MEDIUM",
        expected: "CORS allows only known origins for credentialed APIs.",
        impact: "Other sites may read API responses on behalf of signed-in users.",
        files: isProdCode,
        match: re(/Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"]|origin\s*:\s*['"]\*['"]|cors\(\s*\)/),
    },
    {
        id: "VC-TR-SQL-CONCAT",
        lane: "trust-security",
        title: "SQL built from interpolated input",
        severity: "P1",
        pillars: ["trust", "technology"],
        epistemic: "hypothesis",
        confidence: "MEDIUM",
        expected: "Queries use parameters or a query builder.",
        impact: "Possible SQL injection.",
        files: isProdCode,
        match: re(/\b(query|execute|raw|\$queryRawUnsafe|exec)\s*\(\s*[`'"](?:SELECT|INSERT|UPDATE|DELETE)\b[^`'"]*(\$\{|['"]\s*\+)/i),
    },
    {
        id: "VC-TR-DYNAMIC-EVAL",
        lane: "trust-security",
        title: "Dynamic code or shell execution",
        severity: "P1",
        pillars: ["trust"],
        epistemic: "inference",
        confidence: "MEDIUM",
        expected: "No eval/new Function/shell execution of runtime data.",
        impact: "Remote code execution if any input reaches it.",
        files: isProdCode,
        match: re(/\beval\s*\(|new\s+Function\s*\(|\bexecSync?\s*\(\s*`[^`]*\$\{|\bos\.system\s*\(|subprocess\.\w+\([^)]*shell\s*=\s*True/),
    },
    {
        id: "VC-TR-AI-TOOL-EXEC",
        lane: "trust-security",
        title: "Model output reaches a shell, eval or database without an allowlist",
        severity: "P1",
        pillars: ["trust"],
        epistemic: "hypothesis",
        confidence: "LOW",
        expected: "Tool calls from a model are validated against an allowlist and schema before execution.",
        impact: "Prompt injection can trigger consequential actions.",
        files: isProdCode,
        match: re(/(tool_calls|function_call|toolCall|completion|choices\[0\]|\.content\b)[^;\n]*(exec|eval|spawn|query|\$queryRaw)\s*\(|(exec|eval|spawn)\s*\([^)]*(tool_calls|completion|choices\[0\]|toolCall)/),
    },
    {
        id: "VC-CR-STUB",
        lane: "correctness",
        title: "Unimplemented stub or placeholder in production code",
        severity: "P2",
        pillars: ["technology", "customer"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "Shipped code paths are implemented or explicitly disabled behind a flag.",
        impact: "The feature silently does nothing or fails at runtime.",
        files: isProdCode,
        match: re(/throw new Error\(\s*['"`](not implemented|todo|unimplemented)[^'"`]*['"`]\s*\)|raise NotImplementedError|\/\/\s*TODO:?\s*implement|#\s*TODO:?\s*implement/i),
    },
    {
        id: "VC-CR-MOCK-DATA",
        lane: "correctness",
        title: "Mock or sample data wired into production code",
        severity: "P2",
        pillars: ["customer", "technology"],
        epistemic: "inference",
        confidence: "MEDIUM",
        expected: "Production code reads real data sources; fixtures stay in tests.",
        impact: "Users see fabricated data presented as real.",
        files: isProdCode,
        match: re(/from\s+['"][^'"]*(\/|^)(mocks?|__mocks__|fixtures?|fake-?data|sample-?data|dummy-?data)[/'".]|\b(const|let|var)\s+(mock|fake|dummy)[A-Z_]\w*\s*=\s*\[/),
    },
    {
        id: "VC-CR-SWALLOWED-ERROR",
        lane: "correctness",
        title: "Error swallowed silently",
        severity: "P3",
        pillars: ["technology"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "Errors are handled, logged or rethrown.",
        impact: "Failures disappear; users see silent fallbacks.",
        files: isProdCode,
        match: re(/catch\s*(\([^)]*\))?\s*\{\s*\}|except[^:]*:\s*pass\b|\.catch\(\s*\(\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)/),
    },
    {
        id: "VC-CR-FOCUSED-TEST",
        lane: "correctness",
        title: "Focused or skipped test",
        severity: "P2",
        pillars: ["technology"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "The full suite runs in CI; nothing is focused or skipped without a tracked reason.",
        impact: "Tests silently stop protecting behavior.",
        files: isTest,
        match: re(/\b(describe|it|test)\.(only|skip)\s*\(|\b(xit|xdescribe|fit|fdescribe)\s*\(|@pytest\.mark\.skip\b/),
    },
    {
        id: "VC-OP-NONIDEMPOTENT",
        lane: "operations",
        title: "Consequential call without an idempotency key",
        severity: "P2",
        pillars: ["trust", "technology"],
        epistemic: "hypothesis",
        confidence: "LOW",
        expected: "Payments, emails and other consequential actions carry an idempotency key so retries do not repeat them.",
        impact: "Retries or background jobs can charge or message people twice.",
        files: isProdCode,
        match: (t) => /\b(paymentIntents|charges|refunds|transfers|payouts)\.create\s*\(|\b(sendEmail|sendMail|messages\.create|sms\.send)\s*\(/.test(t) && !/idempotenc/i.test(t)
            ? (/\b\w+\.create\s*\(|\bsend\w*\s*\(/.exec(t)?.[0] ?? "call")
            : null,
    },
    {
        id: "VC-UX-IMG-ALT",
        lane: "experience",
        title: "Image without alternative text",
        severity: "P3",
        pillars: ["customer"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "Images carry alt text (empty alt for decoration).",
        impact: "Screen-reader users miss the content.",
        files: (p) => /\.(jsx|tsx|html|vue|svelte)$/.test(p),
        match: (t) => /<img\b(?![^>]*\balt\s*=)[^>]*>/i.exec(t)?.[0] ?? null,
    },
    {
        id: "VC-UX-POSITIVE-TABINDEX",
        lane: "experience",
        title: "Positive tabindex breaks keyboard order",
        severity: "P3",
        pillars: ["customer"],
        epistemic: "fact",
        confidence: "HIGH",
        expected: "tabindex is 0 or -1.",
        impact: "Keyboard users meet a confusing focus order.",
        files: (p) => /\.(jsx|tsx|html|vue|svelte)$/.test(p),
        match: re(/tab[iI]ndex\s*=\s*\{?\s*['"]?[1-9]/),
    },
];
const AUTH_CALL = /\b(requireAuth|requireUser|isAuthenticated|ensureAuthenticated|authenticate|authorize|checkPermission|requireRole|getServerSession|verifyToken|jwt\.verify|withAuth|login_required|permission_required|@PreAuthorize|currentUser)\b/;
const ID_LOOKUP = /\b(findUnique|findById|findOne|findFirst|get_object_or_404|objects\.get|\.get\()\s*\(?[^)]*\b(req\.params|params\.|request\.args|req\.query|ctx\.params|\bid\b)/;
const OWNER_FILTER = /\b(userId|user_id|ownerId|owner_id|tenantId|tenant_id|orgId|org_id|accountId|account_id|session\.user|req\.user|currentUser|request\.user)\b/;
const normalize = (s) => s.replace(/\s+/g, " ").replace(/\d+/g, "#").trim().slice(0, 160);
/** Runs the line rules over a set of lines of one file. */
export function lineHits(path, lines) {
    const hits = [];
    for (const rule of LINE_RULES) {
        if (!rule.files(path))
            continue;
        for (const l of lines) {
            const m = rule.match(l.text, path);
            if (m === null)
                continue;
            hits.push({
                rule_id: rule.id,
                lane: rule.lane,
                title: rule.title,
                severity: rule.severity,
                pillars: rule.pillars,
                epistemic: rule.epistemic,
                confidence: rule.confidence,
                path,
                line: l.line,
                signature: normalize(m),
                expected: rule.expected,
                actual: `${path}${l.line !== null ? `:${l.line}` : ""} adds: ${normalize(l.text)}`,
                impact: rule.impact,
                excerpt: l.text.trim().slice(0, 200),
            });
        }
    }
    return hits;
}
/** File-level rules that need the whole change of a file (removed auth, ownership filters, migrations, tests). */
export function fileHits(file, headText) {
    const hits = [];
    const added = file.lines.filter((l) => l.kind === "add");
    const removed = file.lines.filter((l) => l.kind === "del");
    const push = (h) => {
        hits.push({ ...h, path: file.path });
    };
    if (isProdCode(file.path)) {
        const IMPORT = /^\s*(import\b|export\s+\{|from\s+\S+\s+import\b|const\s+\{[^}]*\}\s*=\s*require\()/;
        const stillThere = (t) => {
            const token = AUTH_CALL.exec(t)?.[0];
            return (headText !== null &&
                token !== undefined &&
                new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`).test(headText));
        };
        const removedAuth = removed.filter((l) => AUTH_CALL.test(l.text) && !IMPORT.test(l.text) && !stillThere(l.text));
        const addedAuth = added.some((l) => AUTH_CALL.test(l.text) && !IMPORT.test(l.text));
        if (removedAuth.length > 0 && !addedAuth) {
            const first = removedAuth[0];
            push({
                rule_id: "VC-TR-AUTHZ-REMOVED",
                lane: "trust-security",
                title: "Authentication or authorization check removed",
                severity: "P1",
                pillars: ["trust"],
                epistemic: "fact",
                confidence: "HIGH",
                line: null,
                signature: normalize(AUTH_CALL.exec(first.text)?.[0] ?? "auth"),
                expected: "Every protected route keeps an authentication and authorization check.",
                actual: `${file.path} removes ${removedAuth.length} line(s) with an auth check (old line ${first.line}: ${normalize(first.text)}) and adds none.`,
                impact: "Protected data or actions may become reachable without signing in.",
                excerpt: first.text.trim().slice(0, 200),
            });
        }
        const lookups = added.filter((l) => ID_LOOKUP.test(l.text));
        if (lookups.length > 0) {
            const context = headText ?? added.map((l) => l.text).join("\n");
            if (!OWNER_FILTER.test(context)) {
                const first = lookups[0];
                push({
                    rule_id: "VC-TR-OBJECT-AUTHZ",
                    lane: "trust-security",
                    title: "Object fetched by request ID without an ownership or tenant filter",
                    severity: "P1",
                    pillars: ["trust"],
                    epistemic: "hypothesis",
                    confidence: "MEDIUM",
                    line: first.line,
                    signature: normalize(ID_LOOKUP.exec(first.text)?.[0] ?? "lookup"),
                    expected: "Objects looked up by a client-supplied ID are scoped to the signed-in user or tenant.",
                    actual: `${file.path}:${first.line} looks up a record by a request ID; no user/tenant filter appears in the file.`,
                    impact: "Any signed-in user may read or change other users' records (IDOR / cross-tenant leakage).",
                    excerpt: first.text.trim().slice(0, 200),
                });
            }
        }
    }
    if (MIGRATION.test(file.path) && file.status === "added") {
        const text = headText ?? added.map((l) => l.text).join("\n");
        if (/\b(ALTER|DROP|CREATE|RENAME)\b/i.test(text) &&
            !/\b(down|rollback|revert|reverse)\b|--\s*\+migrate\s+Down/i.test(text)) {
            push({
                rule_id: "VC-OP-MIGRATION-NO-DOWN",
                lane: "operations",
                title: "Schema migration without a reversible path",
                severity: "P2",
                pillars: ["technology", "trust"],
                epistemic: "inference",
                confidence: "MEDIUM",
                line: null,
                signature: "migration-without-down",
                expected: "Each migration has a tested down/rollback path or a documented forward-only recovery plan.",
                actual: `${file.path} changes the schema and declares no down/rollback step.`,
                impact: "A failed release cannot be rolled back without data loss.",
                excerpt: text
                    .split("\n")
                    .find((l) => /\b(ALTER|DROP|CREATE|RENAME)\b/i.test(l))
                    ?.trim()
                    .slice(0, 200) ?? "",
            });
        }
    }
    if (isTest(file.path) && added.length > 0) {
        const text = headText ?? added.map((l) => l.text).join("\n");
        const assertions = text.split("\n").filter((l) => /\b(expect|assert)\w*\s*\(|\bassert\b/.test(l));
        const mockOnly = assertions.length > 0 &&
            assertions.every((l) => /(mock|spy|stub|fake|toHaveBeenCalled|called_once|assert_called)/i.test(l) ||
                /expect\(\s*(true|1)\s*\)|assert\.ok\(\s*true\s*\)|assert\s+True\b/.test(l));
        if (mockOnly) {
            push({
                rule_id: "VC-CR-MOCK-ONLY-TEST",
                lane: "correctness",
                title: "Test only asserts mocks or constants",
                severity: "P2",
                pillars: ["technology"],
                epistemic: "hypothesis",
                confidence: "MEDIUM",
                line: null,
                signature: "mock-only-assertions",
                expected: "Tests assert observable behavior of the real code under test.",
                actual: `All ${assertions.length} assertion(s) in ${file.path} check mocks, spies or constants.`,
                impact: "The suite passes while the real behavior is unverified.",
                excerpt: (assertions[0] ?? "").trim().slice(0, 200),
            });
        }
    }
    return hits;
}
/** Change-level rule: production code changed but no test changed. */
export function changeHits(files) {
    const prod = files.filter((f) => isProdCode(f.path) && f.status !== "deleted" && f.additions > 0);
    const tests = files.filter((f) => isTest(f.path));
    if (prod.length === 0 || tests.length > 0)
        return [];
    return [
        {
            rule_id: "VC-CR-NO-TESTS",
            lane: "correctness",
            title: "Behavior changed without any test change",
            severity: "P3",
            pillars: ["technology"],
            epistemic: "inference",
            confidence: "MEDIUM",
            path: prod[0].path,
            line: null,
            signature: "no-test-change",
            expected: "Behavior changes come with a test that would fail without them.",
            actual: `${prod.length} production file(s) changed (${prod
                .map((f) => f.path)
                .slice(0, 5)
                .join(", ")}) and no test file changed.`,
            impact: "Regressions in the changed behavior go unnoticed.",
            excerpt: "",
        },
    ];
}
/** True when a path is client-reachable code (used to raise secret findings' certainty). */
export const isClientPath = (p) => CLIENT.test(p);
