// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Repository snapshot: walks a local checkout (never following symlinks), records tracked/ignored state, and
 * reads the text of scannable files within size limits. Contents of git-ignored files are never read: they are
 * the user's local secrets, not part of the product. Every skip becomes a limitation.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { inputError } from "../errors.js";
import { sha256 } from "../util/hash.js";
import { readGit } from "./git.js";
import { GitIgnore } from "./gitignore.js";
export const REPO_LIMITS = { maxFileBytes: 1024 * 1024, maxDepth: 25, maxLine: 10_000 };
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".output",
    "coverage",
    ".vercel",
    ".turbo",
    "out",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
    "target",
    ".cache",
    ".parcel-cache",
    ".product-check",
]);
const TEXT_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|json|ya?ml|toml|py|rb|go|java|kt|php|cs|rs|swift|sql|sh|md|txt|prisma|tf|ini|cfg|properties|xml|gradle|lock)$/i;
const TEXT_NAMES = new Set([
    "Dockerfile",
    "Procfile",
    "Jenkinsfile",
    ".gitignore",
    ".nvmrc",
    ".node-version",
    ".tool-versions",
    ".python-version",
    "runtime.txt",
    "Gemfile",
]);
/** True when a file's content is worth reading for analysis. */
export function isScannable(path) {
    const name = basename(path);
    return (TEXT_EXT.test(name) || TEXT_NAMES.has(name) || /^\.env(\..+)?$/.test(name) || /^security\.txt$/.test(name));
}
/** Collects skip reasons as limitations. */
class Skips {
    byCode = new Map();
    add(code, path) {
        const set = this.byCode.get(code) ?? new Set();
        set.add(path);
        this.byCode.set(code, set);
    }
    toLimitations() {
        const messages = {
            "symlink-skipped": "Symbolic links are never followed; these paths were skipped.",
            "binary-skipped": "Binary or non-UTF-8 files were not content-scanned.",
            "too-large": `Files larger than ${REPO_LIMITS.maxFileBytes / 1024 / 1024} MiB were not content-scanned.`,
            "minified-skipped": "Minified or generated files (very long lines) were not pattern-scanned.",
            "file-cap": "The file cap (constraints.max_files) was reached; remaining files were not inspected.",
            "depth-cap": `Directories deeper than ${REPO_LIMITS.maxDepth} levels were not walked.`,
            unreadable: "These paths could not be read.",
            "ignored-not-read": "Git-ignored files were listed but their contents were not read (local-only files such as .env).",
        };
        return [...this.byCode.entries()]
            .map(([code, paths]) => {
            const sorted = [...paths].sort();
            return { code, message: messages[code] ?? code, paths: sorted.slice(0, 25), count: sorted.length };
        })
            .sort((a, b) => (a.code < b.code ? -1 : 1));
    }
}
/** Builds a snapshot of a local repository directory. */
export function snapshotRepo(root, maxFiles, label) {
    let stat;
    try {
        stat = lstatSync(root);
    }
    catch {
        throw inputError(`Repository path not found: ${root}`, "Pass the path of a local checkout with --repo.");
    }
    if (!stat.isDirectory())
        throw inputError(`Repository path is not a directory: ${root}`);
    const git = readGit(root);
    const ignore = new GitIgnore();
    const skips = new Skips();
    const files = [];
    const display = (abs) => relative(root, abs).split(sep).join("/");
    let capped = false;
    const trackedDirs = new Set();
    for (const path of git.tracked ?? []) {
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i++)
            trackedDirs.add(parts.slice(0, i).join("/"));
    }
    const loadIgnore = (dir) => {
        try {
            const text = readFileSync(join(dir, ".gitignore"), "utf8");
            ignore.add(display(dir), text);
        }
        catch {
            /* no .gitignore here */
        }
    };
    const walk = (dir, depth) => {
        if (capped)
            return;
        if (depth > REPO_LIMITS.maxDepth) {
            skips.add("depth-cap", display(dir));
            return;
        }
        loadIgnore(dir);
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            skips.add("unreadable", display(dir) || ".");
            return;
        }
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of entries) {
            const abs = join(dir, entry.name);
            const rel = display(abs);
            if (entry.isSymbolicLink()) {
                skips.add("symlink-skipped", rel);
            }
            else if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name))
                    continue;
                if (ignore.ignores(rel, true) && !trackedDirs.has(rel))
                    continue;
                walk(abs, depth + 1);
            }
            else if (entry.isFile()) {
                if (files.length >= maxFiles) {
                    skips.add("file-cap", rel);
                    capped = true;
                    return;
                }
                files.push(readOne(abs, rel));
            }
        }
    };
    const readOne = (abs, rel) => {
        const tracked = git.tracked ? git.tracked.has(rel) : null;
        const ignored = tracked === true ? false : ignore.ignores(rel);
        let size = 0;
        try {
            size = lstatSync(abs).size;
        }
        catch {
            skips.add("unreadable", rel);
            return { path: rel, size, tracked, ignored, text: null, sha256: null };
        }
        if (!isScannable(rel))
            return { path: rel, size, tracked, ignored, text: null, sha256: null };
        if (ignored) {
            skips.add("ignored-not-read", rel);
            return { path: rel, size, tracked, ignored, text: null, sha256: null };
        }
        if (size > REPO_LIMITS.maxFileBytes) {
            skips.add("too-large", rel);
            return { path: rel, size, tracked, ignored, text: null, sha256: null };
        }
        let bytes;
        try {
            bytes = readFileSync(abs);
        }
        catch {
            skips.add("unreadable", rel);
            return { path: rel, size, tracked, ignored, text: null, sha256: null };
        }
        let text;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        }
        catch {
            skips.add("binary-skipped", rel);
            return { path: rel, size, tracked, ignored, text: null, sha256: sha256(bytes) };
        }
        if (text.includes("\0")) {
            skips.add("binary-skipped", rel);
            return { path: rel, size, tracked, ignored, text: null, sha256: sha256(bytes) };
        }
        return { path: rel, size, tracked, ignored, text: text.replace(/^\ufeff/, ""), sha256: sha256(bytes) };
    };
    walk(root, 0);
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const limitations = skips.toLimitations();
    if (git.notes.length > 0 && git.present) {
        limitations.push({
            code: "git-metadata",
            message: `Git metadata: ${git.notes.join("; ")}.`,
            paths: [],
            count: git.notes.length,
        });
    }
    if (!git.present) {
        limitations.push({
            code: "no-git",
            message: "No .git directory: the scanned revision and which files are committed are unknown; tracked-state findings are inferences from .gitignore.",
            paths: [],
            count: 1,
        });
    }
    return {
        root,
        label: label ?? (basename(root) || "repository"),
        git,
        files,
        byPath: new Map(files.map((f) => [f.path, f])),
        limitations,
        ignores: (path) => ignore.ignores(path),
    };
}
/** True when a line looks minified/generated (skip pattern scanning). */
export function isMinified(file) {
    if (/\.min\.[cm]?js$/.test(file.path))
        return true;
    return file.text !== null && file.text.split("\n").some((l) => l.length > REPO_LIMITS.maxLine);
}
