// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The exact state a check ran against: commit, whether the worktree was clean, and the environment fingerprint
 * (platform, Node, tool version, lockfile digest). Verification is only meaningful against an exact, clean commit.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { gitRead } from "../exec/process.js";
import { sha256, stableId } from "../util/hash.js";
import { TOOL_VERSION } from "../version.js";
import { assertRef } from "./util.js";
const LOCKFILES = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "poetry.lock",
    "uv.lock",
    "Cargo.lock",
    "go.sum",
];
/** Environment fingerprint for executed evidence. */
export function environmentRecord(repo) {
    const lock = LOCKFILES.map((f) => join(repo, f)).find((p) => existsSync(p));
    const runner = {
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        tool_version: TOOL_VERSION,
    };
    const lockfile_digest = lock ? sha256(readFileSync(lock)) : null;
    return {
        environment_id: stableId("ENV", [
            runner.platform,
            runner.arch,
            runner.node_version,
            runner.tool_version,
            lockfile_digest,
        ]),
        runner,
        lockfile_digest,
    };
}
/** Resolves a revision to a full commit SHA, or null. */
export function resolveSha(repo, rev) {
    const r = gitRead(repo, ["rev-parse", "--verify", "--quiet", `${assertRef(rev, "revision")}^{commit}`]);
    const sha = r.stdout.trim();
    return r.ok && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}
/** Commit, cleanliness and changed paths of the working tree. `ignore` is a directory excluded from the check. */
export function worktreeState(repo, ignore) {
    const head = resolveSha(repo, "HEAD");
    const st = gitRead(repo, ["status", "--porcelain=v1", "--untracked-files=normal", "-z"]);
    if (!st.ok)
        return { head, clean: null, dirty: [] };
    const ignoreRel = ignore ? relative(resolve(repo), resolve(ignore)).split(sep).join("/") : null;
    const dirty = st.stdout
        .split("\0")
        .filter((e) => e.length > 3)
        .map((e) => e.slice(3))
        .filter((p) => !(ignoreRel &&
        !ignoreRel.startsWith("..") &&
        (p === ignoreRel || p === `${ignoreRel}/` || p.startsWith(`${ignoreRel}/`))));
    return { head, clean: dirty.length === 0, dirty };
}
/** Commit author email (or name) of a revision. */
export function commitAuthor(repo, rev) {
    const r = gitRead(repo, ["log", "-1", "--format=%ae", assertRef(rev, "revision"), "--"]);
    const v = r.stdout.trim();
    return r.ok && v ? v : null;
}
/** File content at a revision, or null when it does not exist there. */
export function fileAt(repo, rev, path) {
    if (path.startsWith("-") || path.includes("\0"))
        return null;
    const r = gitRead(repo, ["show", `${assertRef(rev, "revision")}:${path}`]);
    return r.ok ? r.stdout : null;
}
