// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Masks secret-like strings in any text before it is stored as evidence or rendered. Product Check stores short
 * excerpts only, and every excerpt passes through redact(). The rule names are recorded in evidence.redaction.
 */
const RULES = [
    { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, replace: "[REDACTED]" },
    { name: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replace: "[REDACTED]" },
    { name: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: "[REDACTED]" },
    { name: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, replace: "[REDACTED]" },
    { name: "llm-api-key", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, replace: "[REDACTED]" },
    { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: "[REDACTED]" },
    { name: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/g, replace: "[REDACTED]" },
    { name: "stripe-key", re: /\b[rsp]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, replace: "[REDACTED]" },
    {
        name: "jwt",
        re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        replace: "[REDACTED]",
    },
    {
        name: "private-key",
        re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
        replace: "[REDACTED PRIVATE KEY]",
    },
    {
        name: "url-credentials",
        re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s/@]+@/gi,
        replace: "$1[REDACTED]@",
    },
    {
        name: "assignment-value",
        re: /\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|SERVICE_ROLE)[A-Za-z0-9_]*["']?\s*[:=]\s*)(["']?)[^\s"',;]{4,}\2/gi,
        replace: "$1$2[REDACTED]$2",
    },
];
/** Replacement text for masked secrets. */
export const REDACTED = "[REDACTED]";
/** Masks token-like substrings and secret assignments; returns the text and the names of rules that fired. */
export function redactWithRules(text) {
    let out = text;
    const fired = [];
    for (const rule of RULES) {
        rule.re.lastIndex = 0;
        if (rule.re.test(out)) {
            fired.push(rule.name);
            rule.re.lastIndex = 0;
            out = out.replace(rule.re, rule.replace);
        }
    }
    return { text: out, rules: fired };
}
/** Masks token-like substrings. */
export function redact(text) {
    return redactWithRules(text).text;
}
