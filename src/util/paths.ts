// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Rewrites absolute paths under a base directory to relative ones in every string of a JSON value, so results
 * are portable and do not leak the user's home-directory layout.
 */
import { sep } from "node:path";

/** Returns a deep copy with `base/` prefixes removed from all strings (and `base` itself replaced by "."). */
export function relativize<T>(value: T, base: string): T {
  const prefix = base.endsWith(sep) ? base : `${base}${sep}`;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v === base) return ".";
      return v
        .split(prefix)
        .join("")
        .split(sep)
        .join(sep === "\\" && v.includes(prefix) ? "/" : sep);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}
