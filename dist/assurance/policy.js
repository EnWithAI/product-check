// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The assurance policy: required checks, approvers and their public keys, risk routing, review convergence and
 * release settings. It belongs to the operator and is passed explicitly with --policy; Product Check never reads a
 * policy from the scanned repository implicitly. Omitted fields take the defaults below.
 */
import { createPublicKey } from "node:crypto";
import { usageError } from "../errors.js";
import { formatErrors, validateAgainst } from "../schema/registry.js";
import { ASSURANCE_SCHEMA_VERSION } from "./types.js";
import { digestOf, readJson } from "./util.js";
/** Defaults: no checks declared, nobody may approve, HIGH needs two humans, three review cycles. */
export function defaultPolicy() {
    return {
        schema_version: ASSURANCE_SCHEMA_VERSION,
        kind: "assurance-policy",
        policy_id: "default",
        required_checks: [],
        approvers: [],
        risk: {
            protected_paths: [],
            high_risk_paths: [],
            low_risk_paths: [],
            trusted_authors: [],
            allow_low_risk_waiver: false,
            approvals: { LOW: 1, MEDIUM: 1, HIGH: 2 },
        },
        review: { max_cycles: 3, fail_closed_unverified_p0: true },
        release: { rollback_plan: null, staged_rollout: null },
        exec: {
            env_allowlist: ["PATH", "HOME", "LANG", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "COMSPEC", "PATHEXT"],
            max_output_bytes: 4 * 1024 * 1024,
        },
    };
}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function merge(base, over) {
    if (!isObj(base) || !isObj(over))
        return over === undefined ? base : over;
    const out = { ...base };
    for (const [k, v] of Object.entries(over))
        out[k] = k in base ? merge(base[k], v) : v;
    return out;
}
/** Applies defaults, validates against the schema and checks every approver key parses. */
export function parsePolicy(raw, label) {
    if (!isObj(raw))
        throw usageError(`Policy ${label} must be a JSON object.`);
    const merged = merge(defaultPolicy(), raw);
    merged.required_checks = merged.required_checks.map((c) => ({
        ...c,
        cwd: c.cwd ?? ".",
        timeout_ms: c.timeout_ms ?? 600_000,
        source: "policy",
    }));
    const errors = validateAgainst("assurance-policy.schema.json", merged);
    if (errors.length > 0)
        throw usageError(`Invalid assurance policy ${label}:\n${formatErrors(errors)}`);
    const ids = new Set();
    for (const a of merged.approvers) {
        if (ids.has(a.id))
            throw usageError(`Policy ${label}: approver ${a.id} is declared twice.`);
        ids.add(a.id);
        try {
            const key = createPublicKey(a.public_key);
            if (key.asymmetricKeyType !== "ed25519")
                throw new Error("not ed25519");
        }
        catch {
            throw usageError(`Policy ${label}: approver ${a.id} has no valid Ed25519 public key (SPKI PEM).`);
        }
    }
    const checkIds = merged.required_checks.map((c) => c.id);
    if (new Set(checkIds).size !== checkIds.length)
        throw usageError(`Policy ${label}: required_checks ids must be unique.`);
    return merged;
}
/** Loads a policy file, or the defaults when no path is given. */
export function loadPolicy(path) {
    if (path === undefined)
        return { policy: defaultPolicy(), digest: null };
    const policy = parsePolicy(readJson(path), path);
    return { policy, digest: digestOf(policy) };
}
