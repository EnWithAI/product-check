// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Hashing helpers for checksums and deterministic, stable identifiers.
 */
import { createHash } from "node:crypto";
/** Hex SHA-256 of a string or buffer. */
export function sha256(data) {
    return createHash("sha256").update(data).digest("hex");
}
/** A short deterministic ID: prefix + first `length` hex chars of SHA-256 over the joined parts. */
export function stableId(prefix, parts, length = 10) {
    return `${prefix}-${sha256(parts.map((p) => String(p ?? "")).join("\u001f"))
        .slice(0, length)
        .toUpperCase()}`;
}
