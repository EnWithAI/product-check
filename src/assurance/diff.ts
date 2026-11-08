// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Unified diff parsing (output of `git diff`): files, statuses, renames, binary markers and every added/removed
 * line with its new/old line number. Pure; no git process.
 */

export interface DiffLine {
  kind: "add" | "del";
  /** Line number in the new file (add) or old file (del). */
  line: number;
  text: string;
}

export interface DiffFile {
  path: string;
  previous_path: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "binary";
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

const unquote = (p: string): string => {
  const s = p.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
};
const strip = (p: string): string | null => {
  const s = unquote(p);
  if (s === "/dev/null") return null;
  return s.replace(/^[ab]\//, "");
};

/** Parses a unified diff. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const finish = (): void => {
    if (cur) files.push(cur);
    cur = null;
    inHunk = false;
  };
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      finish();
      const m = /^diff --git (?:"?a\/)(.+?)"? (?:"?b\/)(.+?)"?$/.exec(raw);
      const path = m?.[2] ?? raw.slice(11);
      cur = { path, previous_path: null, status: "modified", lines: [], additions: 0, deletions: 0 };
      continue;
    }
    if (!cur) continue;
    const c: DiffFile = cur;
    if (!inHunk || raw.startsWith("@@")) {
      if (raw.startsWith("new file mode")) c.status = "added";
      else if (raw.startsWith("deleted file mode")) c.status = "deleted";
      else if (raw.startsWith("rename from ")) {
        c.previous_path = unquote(raw.slice(12));
        c.status = "renamed";
      } else if (raw.startsWith("rename to ")) c.path = unquote(raw.slice(10));
      else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) c.status = "binary";
      else if (raw.startsWith("--- ")) {
        const p = strip(raw.slice(4));
        if (p === null) c.status = "added";
      } else if (raw.startsWith("+++ ")) {
        const p = strip(raw.slice(4));
        if (p === null) c.status = "deleted";
        else c.path = p;
      }
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) {
      oldLine = Number(h[1]);
      newLine = Number(h[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith("+")) {
      c.lines.push({ kind: "add", line: newLine++, text: raw.slice(1) });
      c.additions++;
    } else if (raw.startsWith("-")) {
      c.lines.push({ kind: "del", line: oldLine++, text: raw.slice(1) });
      c.deletions++;
    } else if (raw.startsWith(" ") || raw === "") {
      oldLine++;
      newLine++;
    }
  }
  finish();
  return files;
}
