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
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/** SHA-256 of the canonical JSON of a value. */
export const digestOf = (value: unknown): string => sha256(canonicalJson(value));

/** Converts a glob (`**`, `*`, `?`) to an anchored regular expression over forward-slash paths. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** True when the path matches any of the globs. */
export const matchesAny = (path: string, globs: readonly string[]): boolean =>
  globs.some((g) => globToRegExp(g).test(path));

/** Reads and parses a JSON file; failures are input errors (exit 3). */
export function readJson<T = unknown>(path: string, label = path): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw inputError(`Cannot read ${label}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw inputError(`Not valid JSON: ${label}`);
  }
}

/** Writes text atomically (temp file + rename), creating parent directories. */
export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.pc-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`);
  writeFileSync(temp, content, { mode: 0o644 });
  renameSync(temp, path);
}

/** Writes pretty JSON atomically. */
export const writeJson = (path: string, value: unknown): void =>
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);

/** Reads a JSON file when it exists. */
export const readJsonIfExists = <T>(path: string): T | null => (existsSync(path) ? readJson<T>(path) : null);

/** YYYY-MM-DD validation. */
export const isIsoDate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Days from `now` until the end of a YYYY-MM-DD date (negative when past). */
export function daysUntil(date: string, now: Date): number {
  return Math.floor((Date.parse(`${date}T23:59:59.999Z`) - now.getTime()) / 86_400_000);
}

/** Zero-padded sequential identifier: F-001, FX-002, VR-010. */
export const seqId = (prefix: string, n: number): string => `${prefix}-${String(n).padStart(3, "0")}`;

/** A git object name or ref that is safe to pass as an argument (never an option). */
export function assertRef(ref: string, label: string): string {
  if (!/^[A-Za-z0-9._/@^~{}][A-Za-z0-9._/@^~{}:-]*$/.test(ref) || ref.includes(".."))
    throw inputError(`${label} is not a valid git revision: ${JSON.stringify(ref)}`);
  return ref;
}
