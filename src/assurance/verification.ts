// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Independent verification of alleged findings before they may influence a block decision.
 *
 * Checks (each recorded with its result):
 *  - evidence-present     the finding links evidence that exists;
 *  - independent-reread   the cited file is read again at the exact commit and the observation still holds
 *                         (a different code path from the reviewer that raised it);
 *  - runtime-observation  the evidence is a runtime response or an executed test;
 *  - second-signal        another independent reviewer/lane points at the same place.
 *
 * States: fact + reread/runtime → CONFIRMED; inference + reread → CORROBORATED (CONFIRMED with a second signal);
 * hypothesis → NEEDS_HUMAN_TRIAGE unless a second signal → CORROBORATED; reread contradicts → DISPROVEN; nothing
 * re-checkable → EVIDENCE_COLLECTED; no evidence at all → SUSPECTED. Speculative or unverified reviewer claims are
 * never treated as proven defects.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import type { Finding, Results, Severity } from "../types.js";
import { sha256 } from "../util/hash.js";
import { fileHits, lineHits, type RuleHit } from "./lanes.js";
import type { DiffFile } from "./diff.js";
import type { FindingVerification, VerificationCheck, VerificationState } from "./types.js";

/** Rules evaluated over a whole changed file (re-checked with the file rules, not line by line). */
export const FILE_RULES = new Set([
  "VC-TR-AUTHZ-REMOVED",
  "VC-TR-OBJECT-AUTHZ",
  "VC-OP-MIGRATION-NO-DOWN",
  "VC-CR-MOCK-ONLY-TEST",
  "VC-CR-NO-TESTS",
]);

const BLOCKING_STATES: VerificationState[] = ["CONFIRMED", "CORROBORATED", "REPRODUCED"];

/** True when a verified finding of this severity may block. P0 also blocks unverified under a fail-closed policy. */
export function isBlocking(severity: Severity, state: VerificationState, failClosedP0: boolean): boolean {
  if (severity !== "P0" && severity !== "P1") return false;
  if (BLOCKING_STATES.includes(state)) return true;
  return severity === "P0" && failClosedP0 && state !== "DISPROVEN";
}

function decide(epistemic: string, checks: VerificationCheck[]): VerificationState {
  const r = (name: string): VerificationCheck["result"] | undefined =>
    checks.find((c) => c.check === name)?.result;
  if (r("evidence-present") === "fail") return "SUSPECTED";
  if (r("independent-reread") === "fail") return "DISPROVEN";
  const reread = r("independent-reread") === "pass";
  const runtime = r("runtime-observation") === "pass";
  const second = r("second-signal") === "pass";
  if (epistemic === "fact") return reread || runtime ? "CONFIRMED" : "EVIDENCE_COLLECTED";
  if (epistemic === "inference") {
    if ((reread || runtime) && second) return "CONFIRMED";
    if (reread || runtime || second) return "CORROBORATED";
    return "EVIDENCE_COLLECTED";
  }
  return second || runtime ? "CORROBORATED" : "NEEDS_HUMAN_TRIAGE";
}

/** Re-checks a review hit against the file as it is at the head commit. */
export function recheckHit(
  hit: RuleHit,
  headText: string | null,
  diffFile: DiffFile | undefined
): VerificationCheck {
  if (hit.rule_id === "VC-CR-NO-TESTS")
    return {
      check: "independent-reread",
      result: "not-run",
      detail: "Change-level inference; no single file to re-read.",
    };
  if (headText === null)
    return {
      check: "independent-reread",
      result: "not-run",
      detail: "Head content unavailable (diff supplied as a file or file deleted).",
    };
  if (hit.rule_id === "VC-TR-AUTHZ-REMOVED") {
    const still = headText.includes(hit.excerpt);
    return still
      ? {
          check: "independent-reread",
          result: "fail",
          detail: "The removed auth line is still present at head (moved, not removed).",
        }
      : { check: "independent-reread", result: "pass", detail: "Re-read at head: the auth check is absent." };
  }
  const again =
    FILE_RULES.has(hit.rule_id) && diffFile
      ? fileHits(diffFile, headText).filter((h) => h.rule_id === hit.rule_id)
      : lineHits(
          hit.path,
          headText.split("\n").map((text, i) => ({ line: i + 1, text }))
        ).filter((h) => h.rule_id === hit.rule_id && h.signature === hit.signature);
  return again.length > 0
    ? {
        check: "independent-reread",
        result: "pass",
        detail: `Re-read ${hit.path} at head: the condition holds${hit.line !== null ? ` (line ${again.map((h) => h.line).join(", ")})` : ""}.`,
      }
    : {
        check: "independent-reread",
        result: "fail",
        detail: `Re-read ${hit.path} at head: the condition does not hold.`,
      };
}

/** Verifies a hit given the recheck and the other hits/claims of the same review. */
export function verifyHit(
  hit: RuleHit,
  recheck: VerificationCheck,
  others: { path: string; line: number | null; source: string }[]
): FindingVerification {
  const near = others.filter(
    (o) => o.path === hit.path && (hit.line === null || o.line === null || Math.abs(o.line - hit.line) <= 5)
  );
  const checks: VerificationCheck[] = [
    { check: "evidence-present", result: "pass", detail: "Diff line(s) recorded as evidence." },
    recheck,
    near.length > 0
      ? {
          check: "second-signal",
          result: "pass",
          detail: `Also raised by: ${[...new Set(near.map((n) => n.source))].join(", ")}.`,
        }
      : { check: "second-signal", result: "not-run", detail: "No other reviewer points at this location." },
  ];
  return { state: decide(hit.epistemic, checks), checks };
}

/** An external reviewer's claim (for example an AI code reviewer's comment). */
export interface ReviewerClaim {
  reviewer: string;
  type: "ai" | "human" | "imported";
  path: string;
  line: number | null;
  title: string;
  severity: Severity;
  body: string;
}

/** Verifies an external claim: it can be disproven by the code, corroborated by a deterministic hit, or triaged. */
export function verifyClaim(
  claim: ReviewerClaim,
  headText: string | null,
  hits: RuleHit[]
): FindingVerification {
  const checks: VerificationCheck[] = [];
  if (headText === null) {
    checks.push({
      check: "independent-reread",
      result: "fail",
      detail: `${claim.path} does not exist at head.`,
    });
    return { state: "DISPROVEN", checks };
  }
  const lines = headText.split("\n").length;
  if (claim.line !== null && (claim.line < 1 || claim.line > lines)) {
    checks.push({
      check: "independent-reread",
      result: "fail",
      detail: `${claim.path} has ${lines} lines; line ${claim.line} does not exist.`,
    });
    return { state: "DISPROVEN", checks };
  }
  checks.push({
    check: "independent-reread",
    result: "pass",
    detail: "The cited location exists at head; the claim itself is not machine-checked.",
  });
  const near = hits.filter(
    (h) =>
      h.path === claim.path && (claim.line === null || h.line === null || Math.abs(h.line - claim.line) <= 5)
  );
  checks.push(
    near.length > 0
      ? {
          check: "second-signal",
          result: "pass",
          detail: `Deterministic rule(s) agree: ${near.map((h) => h.rule_id).join(", ")}.`,
        }
      : { check: "second-signal", result: "not-run", detail: "No deterministic rule corroborates the claim." }
  );
  return { state: near.length > 0 ? "CORROBORATED" : "NEEDS_HUMAN_TRIAGE", checks };
}

/** Candidate absolute paths for an evidence locator. */
function locate(locator: string, repo: string, repoLabel: string | null): string | null {
  const root = resolve(repo);
  const cands = isAbsolute(locator)
    ? [locator]
    : [
        resolve(root, locator),
        ...(repoLabel && locator.startsWith(`${repoLabel}/`)
          ? [resolve(root, locator.slice(repoLabel.length + 1))]
          : []),
      ];
  return cands.find((c) => c.startsWith(root + sep) && existsSync(c)) ?? null;
}

/** Verifies a finding from a Product Check results document (baseline whole-product scan). */
export function verifyResultsFinding(f: Finding, results: Results, repo: string | null): FindingVerification {
  const ev = f.evidence_ids
    .map((id) => results.evidence.find((e) => e.id === id))
    .filter((e) => e !== undefined);
  const checks: VerificationCheck[] = [
    ev.length > 0 && ev.length === f.evidence_ids.length
      ? { check: "evidence-present", result: "pass", detail: `${ev.length} evidence record(s) linked.` }
      : { check: "evidence-present", result: "fail", detail: "Linked evidence is missing from the results." },
  ];
  const runtime = ev.filter((e) => e.strength === "runtime" || e.strength === "executed-test");
  checks.push(
    runtime.length > 0
      ? {
          check: "runtime-observation",
          result: "pass",
          detail: `Observed at runtime or by an executed test (${runtime.map((e) => e.id).join(", ")}).`,
        }
      : { check: "runtime-observation", result: "not-run", detail: "No runtime or executed-test evidence." }
  );
  const files = ev.filter((e) => e.kind === "source-location" && e.checksum !== null);
  if (repo === null || files.length === 0) {
    checks.push({
      check: "independent-reread",
      result: "not-run",
      detail:
        repo === null
          ? "Repository not available for a re-read."
          : "No checksummed source evidence to re-read.",
    });
  } else {
    const label = results.contract.target.repository?.path ?? null;
    const outcomes = files.map((e) => {
      const p = locate(e.source.locator, repo, label);
      if (!p) return "missing";
      return sha256(readFileSync(p)) === e.checksum?.value ? "match" : "changed";
    });
    if (outcomes.every((o) => o === "match"))
      checks.push({
        check: "independent-reread",
        result: "pass",
        detail: `Re-read ${files.length} cited file(s); checksums match the evidence.`,
      });
    else
      checks.push({
        check: "independent-reread",
        result: "not-run",
        detail: `Cited file(s) ${outcomes.includes("missing") ? "missing" : "changed"} since the scan; re-read is inconclusive (not a disproof).`,
      });
  }
  return { state: decide(f.epistemic, checks), checks };
}
