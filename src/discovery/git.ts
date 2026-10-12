// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Reads git metadata directly from the .git directory (HEAD, loose refs, packed-refs and the index) so Product
 * Check can report the exact revision scanned and which files are tracked without running git. Unreadable or
 * unusual layouts (worktrees, submodules, unsupported index versions) degrade to "unknown", never to a guess.
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Revision information for the scanned repository. */
export interface GitInfo {
  present: boolean;
  commit: string | null;
  ref: string | null;
  /** Paths tracked in the index (forward slashes), or null when the index could not be read. */
  tracked: Set<string> | null;
  notes: string[];
}

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** Locates the git directory (supports a `.git` file pointing elsewhere, as used by worktrees). */
function gitDir(root: string): string | null {
  const dotGit = join(root, ".git");
  if (!existsSync(dotGit)) return null;
  const stat = lstatSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  if (stat.isFile()) {
    const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
    if (m?.[1]) return resolve(root, m[1].trim());
  }
  return null;
}

/** Resolves a ref name through loose refs and packed-refs. */
function resolveRef(dir: string, ref: string, notes: string[]): string | null {
  const commonFile = join(dir, "commondir");
  const common = existsSync(commonFile) ? resolve(dir, readFileSync(commonFile, "utf8").trim()) : dir;
  for (const base of [dir, common]) {
    const loose = join(base, ref);
    if (existsSync(loose) && lstatSync(loose).isFile()) {
      const value = readFileSync(loose, "utf8").trim();
      if (SHA.test(value)) return value;
    }
    const packed = join(base, "packed-refs");
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, "utf8").split("\n")) {
        const [sha, name] = line.split(" ");
        if (name === ref && sha && SHA.test(sha)) return sha;
      }
    }
  }
  notes.push(`ref ${ref} could not be resolved (unborn branch or unusual layout)`);
  return null;
}

/** Parses the paths from a git index file (versions 2, 3 and 4). */
export function parseIndex(buf: Buffer): Set<string> | null {
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "DIRC") return null;
  const version = buf.readUInt32BE(4);
  const count = buf.readUInt32BE(8);
  if (version < 2 || version > 4) return null;
  const paths = new Set<string>();
  let offset = 12;
  let previous = "";
  for (let i = 0; i < count; i++) {
    const start = offset;
    if (start + 62 > buf.length) return null;
    const flags = buf.readUInt16BE(start + 60);
    let headerEnd = start + 62;
    if (version >= 3 && flags & 0x4000) headerEnd += 2;
    let path: string;
    if (version === 4) {
      let shift = 0;
      let pos = headerEnd;
      // Offset-encoded varint (git's "varint" used by index v4).
      let b = buf[pos++] ?? 0;
      let strip = b & 0x7f;
      while (b & 0x80) {
        b = buf[pos++] ?? 0;
        strip = ((strip + 1) << 7) | (b & 0x7f);
        shift++;
        if (shift > 5) return null;
      }
      const end = buf.indexOf(0, pos);
      if (end < 0) return null;
      path = previous.slice(0, previous.length - strip) + buf.toString("utf8", pos, end);
      offset = end + 1;
    } else {
      const end = buf.indexOf(0, headerEnd);
      if (end < 0) return null;
      path = buf.toString("utf8", headerEnd, end);
      const entryLength = end - start + 1;
      offset = start + Math.ceil(entryLength / 8) * 8;
    }
    previous = path;
    paths.add(path);
  }
  return paths;
}

/** Reads revision and index information for a repository root. */
export function readGit(root: string): GitInfo {
  const notes: string[] = [];
  const dir = gitDir(root);
  if (dir === null)
    return { present: false, commit: null, ref: null, tracked: null, notes: ["no .git directory"] };
  let commit: string | null = null;
  let ref: string | null = null;
  try {
    const head = readFileSync(join(dir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      ref = head.slice(4).trim();
      commit = resolveRef(dir, ref, notes);
    } else if (SHA.test(head)) {
      commit = head;
      notes.push("detached HEAD");
    }
  } catch {
    notes.push("HEAD unreadable");
  }
  let tracked: Set<string> | null = null;
  try {
    const indexPath = join(dir, "index");
    if (existsSync(indexPath)) {
      tracked = parseIndex(readFileSync(indexPath));
      if (tracked === null) notes.push("git index format not supported; tracked state unknown");
    } else {
      tracked = new Set();
    }
  } catch {
    notes.push("git index unreadable; tracked state unknown");
  }
  return { present: true, commit, ref, tracked, notes };
}
