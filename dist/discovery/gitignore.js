// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * A pragmatic .gitignore matcher (root .gitignore plus nested .gitignore files) covering the common syntax:
 * comments, negation, directory-only patterns, anchoring, `*`, `?`, `**` and character classes. Used only to
 * decide whether a local file would be committed; results are labelled as inference, not fact.
 */
/** Converts one gitignore glob into a regular expression over a path relative to `base`. */
function globToRegExp(glob, anchored) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === "*") {
            if (glob[i + 1] === "*") {
                const slashAfter = glob[i + 2] === "/";
                re += slashAfter ? "(?:.*/)?" : ".*";
                i += slashAfter ? 2 : 1;
            }
            else
                re += "[^/]*";
        }
        else if (ch === "?")
            re += "[^/]";
        else if (ch === "[") {
            const close = glob.indexOf("]", i + 1);
            if (close > i) {
                re += `[${glob
                    .slice(i + 1, close)
                    .replace(/^!/, "^")
                    .replace(/\\/g, "\\\\")}]`;
                i = close;
            }
            else
                re += "\\[";
        }
        else if (ch === "\\" && i + 1 < glob.length) {
            re += glob[i + 1].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
            i++;
        }
        else
            re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
    return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${re}(?:/.*)?$`);
}
/** Matcher built from .gitignore files. */
export class GitIgnore {
    rules = [];
    /** Adds the patterns of a .gitignore located in directory `base` ("" for the root). */
    add(base, text) {
        for (const raw of text.split(/\r?\n/)) {
            let line = raw.replace(/(?<!\\)\s+$/, "");
            if (line === "" || line.startsWith("#"))
                continue;
            let negate = false;
            if (line.startsWith("!")) {
                negate = true;
                line = line.slice(1);
            }
            const dirOnly = line.endsWith("/");
            if (dirOnly)
                line = line.slice(0, -1);
            const anchored = line.includes("/");
            if (line.startsWith("/"))
                line = line.slice(1);
            if (line === "")
                continue;
            this.rules.push({ base, re: globToRegExp(line, anchored), negate, dirOnly });
        }
    }
    /** True when the path (relative to the repo root, forward slashes) is ignored. */
    ignores(path, isDir = false) {
        let ignored = false;
        for (const rule of this.rules) {
            if (rule.base !== "" && !path.startsWith(`${rule.base}/`))
                continue;
            const rel = rule.base === "" ? path : path.slice(rule.base.length + 1);
            if (rule.dirOnly && !isDir) {
                // A directory-only rule still ignores files beneath a matching directory.
                const parts = rel.split("/");
                let hit = false;
                for (let i = 1; i < parts.length; i++) {
                    if (rule.re.test(parts.slice(0, i).join("/")))
                        hit = true;
                }
                if (hit)
                    ignored = !rule.negate;
                continue;
            }
            if (rule.re.test(rel))
                ignored = !rule.negate;
        }
        return ignored;
    }
    /** Number of rules loaded. */
    get size() {
        return this.rules.length;
    }
}
