import { globToRegExp, matchesAny } from "./util.js";
/** High-risk surfaces and how they are recognized (path first, then changed content). */
const SURFACES = [
    {
        id: "auth",
        path: /(^|\/)(auth|login|logout|session|sessions|oauth|sso|jwt|passwords?|middleware|permissions?|rbac|acl|guards?)([./_-]|$)/i,
        content: /\b(requireAuth|isAuthenticated|getServerSession|verifyToken|jwt\.verify|authorize|checkPermission|login_required|@PreAuthorize|currentUser|req\.user)\b/,
    },
    {
        id: "billing",
        path: /(^|\/)(billing|payments?|stripe|checkout|invoices?|subscriptions?|pricing)([./_-]|$)/i,
        content: /\b(stripe\.|paymentIntents|charges\.create|checkout\.sessions)\b/,
    },
    {
        id: "personal-data",
        path: /(^|\/)(users?|profiles?|accounts?|customers?|pii|gdpr|privacy)([./_-]|$)/i,
        content: /\b(email|phone|date_of_birth|ssn|address)\b.*[:=]/i,
    },
    {
        id: "tenancy",
        path: /(^|\/)(tenants?|orgs?|organizations?|workspaces?|teams?)([./_-]|$)/i,
        content: /\b(tenant_?id|org_?id|organization_?id|workspace_?id)\b/i,
    },
    {
        id: "data-migration",
        path: /(^|\/)(migrations?|migrate|schema\.prisma|alembic|flyway|liquibase)([./_-]|$)|\.sql$/i,
        content: /\b(ALTER TABLE|DROP TABLE|DROP COLUMN|CREATE TABLE)\b/i,
    },
    {
        id: "ci-deployment",
        path: /^(\.github\/workflows\/|\.gitlab-ci|\.circleci\/|Jenkinsfile|azure-pipelines|Dockerfile|docker-compose|vercel\.json|netlify\.toml|fly\.toml|render\.yaml|Procfile|terraform\/|infra\/|k8s\/|helm\/|deploy)/i,
        content: null,
    },
    {
        id: "ai-action",
        path: /(^|\/)(agents?|tools?|llm|prompts?|ai)([./_-]|$)/i,
        content: /\b(tool_calls|function_call|tools\s*:|anthropic|openai|generateText|streamText)\b/,
    },
    {
        id: "security-boundary",
        path: /(^|\/)(security|crypto|secrets?|cors|csp|headers|rate-?limit)([./_-]|$)|(^|\/)\.env/i,
        content: /\b(cors\(|helmet\(|Content-Security-Policy|rejectUnauthorized|createCipher|crypto\.)/,
    },
    {
        id: "release-rollback",
        path: /(^|\/)(release|rollback|feature-?flags?|canary)([./_-]|$)/i,
        content: null,
    },
];
const DOCS = /(^|\/)(docs?\/.*|README[^/]*|CHANGELOG[^/]*|LICENSE[^/]*|NOTICE[^/]*|CONTRIBUTING[^/]*|CODE_OF_CONDUCT[^/]*|[^/]+\.(md|mdx|txt|rst|adoc))$/i;
const TESTS = /(^|\/)(__tests__|tests?|spec|e2e|cypress|playwright)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(py|go)$/i;
/** Surfaces a changed file touches. */
export function surfacesOf(file) {
    const added = file.lines
        .filter((l) => l.kind === "add" || l.kind === "del")
        .map((l) => l.text)
        .join("\n");
    const found = new Set();
    for (const s of SURFACES) {
        if (s.path.test(file.path) || (file.previous_path !== null && s.path.test(file.previous_path)))
            found.add(s.id);
        else if (s.content && !DOCS.test(file.path) && s.content.test(added))
            found.add(s.id);
    }
    if (DOCS.test(file.path))
        found.add("docs");
    else if (TESTS.test(file.path))
        found.add("tests");
    else if (found.size === 0)
        found.add("application");
    return [...found].sort();
}
const HIGH_SURFACES = new Set([
    "auth",
    "billing",
    "personal-data",
    "tenancy",
    "data-migration",
    "ci-deployment",
    "ai-action",
    "security-boundary",
    "release-rollback",
]);
/** Classifies a change. */
export function classifyRisk(files, policy, impact) {
    const reasons = [];
    const owners = new Set();
    const protectedHits = [];
    const changed = files.map((f) => {
        const surfaces = surfacesOf(f);
        const prot = policy.risk.protected_paths.filter((p) => globToRegExp(p.pattern).test(f.path) ||
            (f.previous_path !== null && globToRegExp(p.pattern).test(f.previous_path)));
        for (const p of prot)
            p.owners.forEach((o) => owners.add(o));
        if (prot.length > 0)
            protectedHits.push(f.path);
        return {
            path: f.path,
            previous_path: f.previous_path,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            surfaces,
            protected: prot.length > 0,
        };
    });
    const surfaces = [...new Set(changed.flatMap((c) => c.surfaces))].sort();
    let level;
    if (changed.length === 0) {
        level = "UNDETERMINED";
        reasons.push("The diff is empty or could not be read; risk cannot be determined.");
    }
    else if (changed.some((c) => c.status === "binary")) {
        level = "UNDETERMINED";
        reasons.push(`Binary change(s) cannot be inspected: ${changed
            .filter((c) => c.status === "binary")
            .map((c) => c.path)
            .join(", ")}.`);
    }
    else {
        const high = changed.filter((c) => c.surfaces.some((s) => HIGH_SURFACES.has(s)) ||
            c.protected ||
            matchesAny(c.path, policy.risk.high_risk_paths));
        const nonLow = changed.filter((c) => !(c.surfaces.length === 1 && (c.surfaces[0] === "docs" || c.surfaces[0] === "tests")) &&
            !matchesAny(c.path, policy.risk.low_risk_paths));
        if (high.length > 0) {
            level = "HIGH";
            reasons.push(`High-risk surface(s) touched: ${[...new Set(high.flatMap((c) => c.surfaces.filter((s) => HIGH_SURFACES.has(s))))].join(", ") || "policy high-risk path"} (${high
                .map((c) => c.path)
                .slice(0, 8)
                .join(", ")}).`);
        }
        else if (nonLow.length > 0) {
            level = "MEDIUM";
            reasons.push(`Application change(s) without a high-risk surface: ${nonLow
                .map((c) => c.path)
                .slice(0, 8)
                .join(", ")}.`);
        }
        else {
            level = "LOW";
            reasons.push("Only documentation, tests or policy-declared low-risk paths changed.");
        }
    }
    if (protectedHits.length > 0)
        reasons.push(`Protected path(s): ${protectedHits.join(", ")}; domain-owner approval required.`);
    if (impact && impact.high > 0 && level !== "HIGH") {
        reasons.push(`Impact Check reports ${impact.high} high-severity impact finding(s); raised to HIGH.`);
        level = "HIGH";
    }
    const effective = level === "UNDETERMINED" ? "HIGH" : level;
    if (level === "UNDETERMINED")
        reasons.push("UNDETERMINED is treated as HIGH until evidence supports reclassification.");
    return {
        changed,
        risk: {
            level,
            effective_level: effective,
            surfaces,
            reasons,
            protected_paths: protectedHits,
            impact_check: impact,
        },
        owners: [...owners].sort(),
    };
}
/** Human approvals a change needs, including the LOW-risk waiver decision. */
export function approvalsRequired(risk, owners, policy, author) {
    const humans = policy.risk.approvals[risk.effective_level];
    const eligible = risk.level === "LOW" && risk.protected_paths.length === 0 && policy.risk.allow_low_risk_waiver;
    let reason;
    if (risk.level !== "LOW")
        reason = `Not eligible: risk is ${risk.level}.`;
    else if (risk.protected_paths.length > 0)
        reason = "Not eligible: a protected path is touched.";
    else if (!policy.risk.allow_low_risk_waiver)
        reason = "Not eligible: the policy does not allow LOW-risk waivers.";
    else if (!author.trusted)
        reason = `Eligible, not applied: author ${author.id ?? "(unknown)"} is not a trusted author in the policy.`;
    else
        reason = `Applied: LOW risk, no protected path, trusted author ${author.id ?? ""}, policy allows the waiver.`;
    const applied = eligible && author.trusted;
    return { humans: applied ? 0 : humans, domain_owners: owners, waiver: { eligible, applied, reason } };
}
