// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Small helpers for the assurance layer: canonical JSON (for digests and signatures), glob matching, JSON file I/O
 * with atomic writes, and ISO date handling.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inputError } from "../errors.js";
import { sha256 } from "../util/hash.js";
/** JSON with object keys sorted recursively, so equal content always has the same digest. */
export function canonicalJson(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value) ?? "null";
    if (Array.isArray(value))
        return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
    const obj = value;
    return `{${Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(",")}}`;
}
/** SHA-256 of the canonical JSON of a value. */
export const digestOf = (value) => sha256(canonicalJson(value));
/** Converts a glob (`**`, `*`, `?`) to an anchored regular expression over forward-slash paths. */
export function globToRegExp(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === "*") {
            if (glob[i + 1] === "*") {
                const slash = glob[i + 2] === "/";
                re += slash ? "(?:.*/)?" : ".*";
                i += slash ? 2 : 1;
            }
            else
                re += "[^/]*";
        }
        else if (ch === "?")
            re += "[^/]";
        else
            re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${re}$`);
}
/** True when the path matches any of the globs. */
export const matchesAny = (path, globs) => globs.some((g) => globToRegExp(g).test(path));
/** Reads and parses a JSON file; failures are input errors (exit 3). */
export function readJson(path, label = path) {
    let text;
    try {
        text = readFileSync(path, "utf8");
    }
    catch {
        throw inputError(`Cannot read ${label}`);
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw inputError(`Not valid JSON: ${label}`);
    }
}
/** Writes text atomically (temp file + rename), creating parent directories. */
export function writeText(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = join(dirname(path), `.pc-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(temp, content, { mode: 0o644 });
    renameSync(temp, path);
}
/** Writes pretty JSON atomically. */
export const writeJson = (path, value) => writeText(path, `${JSON.stringify(value, null, 2)}\n`);
/** Reads a JSON file when it exists. */
export const readJsonIfExists = (path) => (existsSync(path) ? readJson(path) : null);
/** YYYY-MM-DD validation. */
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/** Days from `now` until the end of a YYYY-MM-DD date (negative when past). */
export function daysUntil(date, now) {
    return Math.floor((Date.parse(`${date}T23:59:59.999Z`) - now.getTime()) / 86_400_000);
}
/** Zero-padded sequential identifier: F-001, FX-002, VR-010. */
export const seqId = (prefix, n) => `${prefix}-${String(n).padStart(3, "0")}`;
/** A git object name or ref that is safe to pass as an argument (never an option). */
export function assertRef(ref, label) {
    if (!/^[A-Za-z0-9._/@^~{}][A-Za-z0-9._/@^~{}:-]*$/.test(ref) || ref.includes(".."))
        throw inputError(`${label} is not a valid git revision: ${JSON.stringify(ref)}`);
    return ref;
}
