// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The closure register: every finding's verified-closure state machine, with hash-chained transitions.
 *
 *   OPEN → ACKNOWLEDGED → IN_PROGRESS → FIX_PROPOSED → RETEST_REQUIRED → VERIFIED_FIXED → CLOSED
 *   plus REJECTED_FALSE_POSITIVE, DEFERRED, ACCEPTED_RISK and REGRESSED.
 *
 * Invariants enforced here (and re-checked by `checkRegister` on every load):
 *  1. FIX_PROPOSED is not fixed: a fix only moves the finding to RETEST_REQUIRED.
 *  2. VERIFIED_FIXED only through a PASS verification run against the exact fix commit.
 *  3. CLOSED needs that verification, satisfied acceptance checks, no failing associated gate, signed human
 *     approvals for the risk tier from people other than the implementer, an accountable closing human, a time.
 *  4. ACCEPTED_RISK needs owner, scope, rationale, compensating controls, review date, expiry, closure condition
 *     and signed approvals; never for P0; it is never shown as fixed or closed.
 *  5. A finding that reappears after VERIFIED_FIXED/CLOSED becomes REGRESSED, keeping its history.
 *  6. Agents and bots cannot approve; a typed approver name proves nothing.
 *  7. After the cycle limit, autonomous fix loops stop until a human signs a "continue" decision.
 *  8. Missing verification never leads to CLOSED.
 * Only the guarded functions below can reach FIX_PROPOSED, RETEST_REQUIRED, VERIFIED_FIXED, CLOSED, ACCEPTED_RISK,
 * REJECTED_FALSE_POSITIVE or REGRESSED; `manualTransition` covers the rest.
 */
import { usageError } from "../errors.js";
import type { Results, Severity } from "../types.js";
import { isOpen } from "../scoring/score.js";
import { stableId } from "../util/hash.js";
import { tallyApprovals } from "./approvals.js";
import {
  ASSURANCE_SCHEMA_VERSION,
  METHODOLOGY_VERSION,
  type Actor,
  type Approval,
  type AssurancePolicy,
  type ChangeReview,
  type ClosureRegister,
  type ClosureState,
  type CommandSpec,
  type FixRecord,
  type RegisterEntry,
  type RiskAcceptanceV32,
  type Transition,
  type VerificationRun,
} from "./types.js";
import { daysUntil, digestOf, isIsoDate, seqId } from "./util.js";
import { verifyResultsFinding } from "./verification.js";

/** Allowed transitions (CT3 v3.2), plus documented out-edges for REGRESSED. */
export const TRANSITIONS: Record<ClosureState, ClosureState[]> = {
  OPEN: ["ACKNOWLEDGED", "REJECTED_FALSE_POSITIVE", "ACCEPTED_RISK", "DEFERRED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "ACCEPTED_RISK", "DEFERRED", "REJECTED_FALSE_POSITIVE"],
  IN_PROGRESS: ["FIX_PROPOSED"],
  FIX_PROPOSED: ["RETEST_REQUIRED"],
  RETEST_REQUIRED: ["VERIFIED_FIXED", "IN_PROGRESS", "REGRESSED"],
  VERIFIED_FIXED: ["CLOSED", "REGRESSED"],
  CLOSED: ["REGRESSED"],
  ACCEPTED_RISK: ["RETEST_REQUIRED", "OPEN"],
  DEFERRED: ["OPEN"],
  REJECTED_FALSE_POSITIVE: [],
  REGRESSED: ["ACKNOWLEDGED", "IN_PROGRESS", "ACCEPTED_RISK"],
};

/** Targets a person or agent may set directly; every other target needs its guarded command. */
const MANUAL: ClosureState[] = ["ACKNOWLEDGED", "IN_PROGRESS", "DEFERRED", "OPEN"];

/** Risk tier of a finding for approval counts. */
export const findingRisk = (s: Severity): "LOW" | "MEDIUM" | "HIGH" =>
  s === "P0" || s === "P1" ? "HIGH" : s === "P2" ? "MEDIUM" : "LOW";

const SYSTEM: Actor = { id: "product-check", type: "system" };
const noRefs = (): Transition["refs"] => ({
  evidence_ids: [],
  verification_id: null,
  approval_ids: [],
  fix_id: null,
  run_id: null,
});

function entry(reg: ClosureRegister, id: string): RegisterEntry {
  const e = reg.entries.find((x) => x.finding_id === id);
  if (!e)
    throw usageError(
      `Unknown finding ${id}. Known: ${reg.entries
        .slice(0, 10)
        .map((x) => x.finding_id)
        .join(", ")}${reg.entries.length > 10 ? ", …" : ""}`
    );
  return e;
}

/** Appends a transition (table-checked) to an entry and the chain. */
function apply(
  reg: ClosureRegister,
  e: RegisterEntry,
  to: ClosureState,
  actor: Actor,
  reason: string,
  refs: Partial<Transition["refs"]>,
  now: Date
): Transition {
  const from = e.transitions.length === 0 ? null : e.state;
  if (from !== null && !TRANSITIONS[from].includes(to))
    throw usageError(
      `${e.finding_id}: ${from} → ${to} is not an allowed transition (allowed: ${TRANSITIONS[from].join(", ") || "none"}).`
    );
  const body = {
    seq: reg.chain.length + 1,
    from,
    to,
    at: now.toISOString(),
    actor,
    reason,
    refs: { ...noRefs(), ...refs },
    prev_digest: reg.chain.head_digest,
  };
  const t: Transition = { ...body, digest: digestOf({ finding_id: e.finding_id, ...body }) };
  e.transitions.push(t);
  e.state = to;
  reg.chain = { length: t.seq, head_digest: t.digest };
  reg.updated_at = now.toISOString();
  return t;
}

function newEntry(
  reg: ClosureRegister,
  fields: Omit<
    RegisterEntry,
    | "finding_id"
    | "state"
    | "cycles"
    | "escalated"
    | "fix_ids"
    | "verification_ids"
    | "approval_ids"
    | "acceptance_id"
    | "regressions"
    | "closure"
    | "transitions"
  >,
  now: Date,
  reason: string
): RegisterEntry {
  const e: RegisterEntry = {
    finding_id: seqId("F", reg.entries.length + 1),
    ...fields,
    state: "OPEN",
    cycles: 0,
    escalated: false,
    fix_ids: [],
    verification_ids: [],
    approval_ids: [],
    acceptance_id: null,
    regressions: [],
    closure: null,
    transitions: [],
  };
  reg.entries.push(e);
  apply(reg, e, "OPEN", SYSTEM, reason, { run_id: fields.opened_in }, now);
  return e;
}

/** Creates a register from a baseline results document. */
export function createRegister(
  results: Results,
  resultsSha: string,
  repo: string | null,
  policy: AssurancePolicy,
  now: Date
): ClosureRegister {
  const reg: ClosureRegister = {
    schema_version: ASSURANCE_SCHEMA_VERSION,
    kind: "closure-register",
    methodology_version: METHODOLOGY_VERSION,
    register_id: stableId("REG", [results.run.run_id, resultsSha]),
    target: {
      name: results.contract.target.name,
      repository: results.run.target_revision.repository?.label ?? null,
    },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    baseline: {
      run_id: results.run.run_id,
      results_sha256: resultsSha,
      baseline_sha: results.run.target_revision.repository?.commit ?? null,
    },
    settings: { max_cycles: policy.review.max_cycles },
    entries: [],
    fixes: [],
    verification_runs: [],
    approvals: [],
    risk_acceptances: [],
    regression_corpus: [],
    chain: { length: 0, head_digest: null },
  };
  syncResults(reg, results, repo, now);
  return reg;
}

/** Adds findings that are new in a results document and marks reappearing verified/closed ones REGRESSED. */
export function syncResults(
  reg: ClosureRegister,
  results: Results,
  repo: string | null,
  now: Date
): { added: string[]; regressed: string[] } {
  const added: string[] = [];
  const regressed: string[] = [];
  const order: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const open = results.findings
    .filter((f) => isOpen(f) || f.status === "ACCEPTED_RISK")
    .sort((a, b) => order[a.severity] - order[b.severity] || (a.id < b.id ? -1 : 1));
  for (const f of open) {
    const existing = reg.entries.find((e) => e.source_finding_id === f.id);
    if (existing) {
      if (existing.state === "VERIFIED_FIXED" || existing.state === "CLOSED") {
        const prev = existing.state;
        apply(
          reg,
          existing,
          "REGRESSED",
          SYSTEM,
          `Observed again in run ${results.run.run_id} after ${prev}; history kept.`,
          { run_id: results.run.run_id },
          now
        );
        existing.regressions.push({
          at: now.toISOString(),
          run_id: results.run.run_id,
          previous_state: prev,
        });
        regressed.push(existing.finding_id);
      }
      continue;
    }
    const e = newEntry(
      reg,
      {
        source: "baseline-scan",
        source_finding_id: f.id,
        rule_or_control: f.control_id,
        title: f.title,
        severity: f.severity,
        pillar: f.pillar,
        epistemic: f.epistemic,
        location: f.location,
        dedupe_key: digestOf([f.control_id, f.location, f.pop]).slice(0, 20),
        verification: verifyResultsFinding(f, results, repo),
        opened_in: results.run.run_id,
      },
      now,
      `Opened from scan ${results.run.run_id}${f.status === "ACCEPTED_RISK" ? " (a CT3 contract risk acceptance exists; v3.2 requires a signed acceptance via accept-risk)" : ""}.`
    );
    added.push(e.finding_id);
  }
  return { added, regressed };
}

/** Adds non-disproven findings of a change review. */
export function syncReview(reg: ClosureRegister, review: ChangeReview, now: Date): string[] {
  const added: string[] = [];
  for (const f of review.findings) {
    const existing = reg.entries.find((e) => e.source === "change-review" && e.dedupe_key === f.dedupe_key);
    if (existing) {
      if (existing.state === "VERIFIED_FIXED" || existing.state === "CLOSED") {
        const prev = existing.state;
        apply(
          reg,
          existing,
          "REGRESSED",
          SYSTEM,
          `Raised again by review ${review.review_id}.`,
          { run_id: review.review_id },
          now
        );
        existing.regressions.push({ at: now.toISOString(), run_id: review.review_id, previous_state: prev });
      }
      continue;
    }
    const e = newEntry(
      reg,
      {
        source: "change-review",
        source_finding_id: f.id,
        rule_or_control: f.rule_id,
        title: f.title,
        severity: f.severity,
        pillar: f.pillars[0] ?? "technology",
        epistemic: f.epistemic,
        location: `${f.location.path}${f.location.line !== null ? `:${f.location.line}` : ""}`,
        dedupe_key: f.dedupe_key,
        verification: f.verification,
        opened_in: review.review_id,
      },
      now,
      `Opened from change review ${review.review_id} (${f.verification.state}).`
    );
    added.push(e.finding_id);
  }
  return added;
}

/** A direct transition by a person or agent (ACKNOWLEDGED, IN_PROGRESS, DEFERRED, OPEN). */
export function manualTransition(
  reg: ClosureRegister,
  id: string,
  to: ClosureState,
  actor: Actor,
  reason: string,
  now: Date,
  extra: { owner?: string; revisit?: string } = {}
): Transition {
  if (!MANUAL.includes(to))
    throw usageError(
      `${to} cannot be set directly. Use: fix (FIX_PROPOSED/RETEST_REQUIRED), verify (VERIFIED_FIXED), close (CLOSED), accept-risk (ACCEPTED_RISK), reject (REJECTED_FALSE_POSITIVE).`
    );
  if (!reason.trim()) throw usageError("A transition needs --reason.");
  const e = entry(reg, id);
  if (to === "DEFERRED") {
    if (e.severity === "P0")
      throw usageError(`${id} is P0; a P0 cannot be deferred (it blocks release under CT3).`);
    if (!extra.owner || !extra.revisit || !isIsoDate(extra.revisit))
      throw usageError("DEFERRED needs --owner and --revisit YYYY-MM-DD.");
  }
  if (to === "IN_PROGRESS" && e.escalated && e.state !== "REGRESSED")
    throw usageError(
      `${id} reached the review-cycle limit and is escalated; a human must sign a "continue" decision (approve --scope continue:${id}) and then record the next fix.`
    );
  return apply(
    reg,
    e,
    to,
    actor,
    to === "DEFERRED" ? `${reason} (owner ${extra.owner}, revisit ${extra.revisit})` : reason,
    {},
    now
  );
}

/** Records a fix commit: IN_PROGRESS → FIX_PROPOSED → RETEST_REQUIRED. Never marks anything fixed. */
export function recordFix(
  reg: ClosureRegister,
  ids: string[],
  changeSha: string,
  actor: Actor,
  reproduction: CommandSpec[],
  policy: AssurancePolicy,
  now: Date
): FixRecord {
  if (!/^[0-9a-f]{40,64}$/.test(changeSha))
    throw usageError("fix needs the full commit SHA of the change (--sha).");
  if (ids.length === 0) throw usageError("fix needs at least one --finding.");
  const entries = ids.map((id) => entry(reg, id));
  for (const e of entries) {
    if (e.state !== "IN_PROGRESS")
      throw usageError(
        `${e.finding_id} is ${e.state}; move it to IN_PROGRESS first (transition --to IN_PROGRESS).`
      );
    if (e.escalated) {
      const t = tallyApprovals(
        reg.approvals,
        policy,
        {
          scopeType: "continue",
          ref: e.finding_id,
          sha: null,
          excluded: actor.type === "human" ? [] : [actor.id],
        },
        1
      );
      if (!t.satisfied)
        throw usageError(
          `${e.finding_id} is escalated after ${e.cycles} failed cycle(s); a signed human "continue" approval is required before another fix attempt.`
        );
    }
  }
  const fix: FixRecord = {
    fix_id: seqId("FX", reg.fixes.length + 1),
    finding_ids: ids,
    change_sha: changeSha,
    implemented_by: actor,
    status: "IMPLEMENTED_UNVERIFIED",
    reproduction,
    recorded_at: now.toISOString(),
  };
  reg.fixes.push(fix);
  for (const e of entries) {
    e.fix_ids.push(fix.fix_id);
    apply(
      reg,
      e,
      "FIX_PROPOSED",
      actor,
      `Fix ${fix.fix_id} submitted at ${changeSha.slice(0, 12)} (proposed, not verified).`,
      { fix_id: fix.fix_id },
      now
    );
    apply(
      reg,
      e,
      "RETEST_REQUIRED",
      SYSTEM,
      "A proposed fix needs targeted reproduction and regression against the exact commit.",
      { fix_id: fix.fix_id },
      now
    );
  }
  return fix;
}

/** Applies a verification run's outcome. */
export function applyVerification(
  reg: ClosureRegister,
  run: VerificationRun,
  now: Date,
  maxCycles: number = reg.settings.max_cycles
): { verified: string[]; failed: string[]; escalated: string[]; unchanged: string[] } {
  reg.settings.max_cycles = maxCycles;
  reg.verification_runs.push(run);
  const out = {
    verified: [] as string[],
    failed: [] as string[],
    escalated: [] as string[],
    unchanged: [] as string[],
  };
  const fix = reg.fixes.find((f) => f.fix_id === run.fix_id);
  for (const id of run.finding_ids) {
    const e = entry(reg, id);
    e.verification_ids.push(run.verification_id);
    const refs = {
      verification_id: run.verification_id,
      fix_id: run.fix_id,
      evidence_ids: run.after_evidence_ids,
    };
    if (run.result === "PASS" && e.state === "RETEST_REQUIRED") {
      apply(
        reg,
        e,
        "VERIFIED_FIXED",
        SYSTEM,
        `Verification ${run.verification_id} passed at ${run.exact_sha?.slice(0, 12) ?? "?"} (targeted + regression).`,
        refs,
        now
      );
      out.verified.push(id);
    } else if (run.result === "FAIL" && e.state === "RETEST_REQUIRED") {
      e.cycles++;
      apply(
        reg,
        e,
        "IN_PROGRESS",
        SYSTEM,
        `Verification ${run.verification_id} failed (cycle ${e.cycles}/${reg.settings.max_cycles}): ${run.reasons.join(" ")}`,
        refs,
        now
      );
      out.failed.push(id);
      if (e.cycles >= reg.settings.max_cycles) {
        e.escalated = true;
        out.escalated.push(id);
      }
    } else out.unchanged.push(id);
  }
  if (fix)
    fix.status =
      run.result === "PASS" ? "VERIFIED" : run.result === "FAIL" ? "IMPLEMENTED_UNVERIFIED" : fix.status;
  return out;
}

/** Adds signed approvals (deduplicated by ID). */
export function addApproval(reg: ClosureRegister, a: Approval): void {
  if (!reg.approvals.some((x) => x.approval_id === a.approval_id)) reg.approvals.push(a);
}

/** Closes a verified finding (invariant 3). */
export function closeFinding(
  reg: ClosureRegister,
  id: string,
  verificationId: string,
  actorId: string,
  policy: AssurancePolicy,
  now: Date
): RegisterEntry {
  const e = entry(reg, id);
  if (e.state !== "VERIFIED_FIXED")
    throw usageError(
      `${id} is ${e.state}; only VERIFIED_FIXED findings can be closed (missing verification never closes).`
    );
  const run = reg.verification_runs.find((r) => r.verification_id === verificationId);
  if (!run || !e.verification_ids.includes(verificationId))
    throw usageError(`${verificationId} is not a verification run of ${id}.`);
  const latest = e.verification_ids.at(-1);
  if (latest !== verificationId)
    throw usageError(`${verificationId} is not the latest verification of ${id} (${latest ?? "none"}).`);
  if (run.result !== "PASS" || run.exact_sha === null)
    throw usageError(`${verificationId} did not pass against an exact commit.`);
  const failedChecks = run.checks.filter((c) => c.role === "targeted" && c.status !== "PASS");
  if (failedChecks.length > 0)
    throw usageError(`Acceptance checks not satisfied: ${failedChecks.map((c) => c.check_id).join(", ")}.`);
  const gate = run.checks.find((c) => c.kind === "gate-recheck");
  if (gate && gate.status === "FAIL") throw usageError(`An associated hard gate still fails: ${gate.detail}`);
  const fix = reg.fixes.find((f) => f.fix_id === run.fix_id);
  const excluded = fix ? [fix.implemented_by.id] : [];
  const required = policy.risk.approvals[findingRisk(e.severity)];
  const tally = tallyApprovals(
    reg.approvals,
    policy,
    { scopeType: "closure", ref: id, sha: run.exact_sha, excluded },
    Math.max(1, required)
  );
  if (!tally.satisfied)
    throw usageError(
      `${id} needs ${Math.max(1, required)} valid signed human approval(s) for closure at ${run.exact_sha.slice(0, 12)}; found ${tally.validApprovers.length}.`,
      tally.evaluations.map((x) => `${x.approval_id} ${x.status}: ${x.reason}`).join("\n") ||
        `Sign one: product-check approve --scope closure:${id} --sha ${run.exact_sha} --approver <id> --key <private.pem>`
    );
  if (!tally.validApprovers.includes(actorId))
    throw usageError(
      `The closing actor (${actorId}) must be one of the accountable approvers: ${tally.validApprovers.join(", ")}.`
    );
  const approvalIds = tally.evaluations.filter((x) => x.status === "VALID").map((x) => x.approval_id);
  const actor: Actor = { id: actorId, type: "human" };
  const closureId = seqId("CL", reg.entries.filter((x) => x.closure !== null).length + 1);
  e.approval_ids.push(...approvalIds.filter((a) => !e.approval_ids.includes(a)));
  apply(
    reg,
    e,
    "CLOSED",
    actor,
    `Closed as ${closureId} on verification ${verificationId} with ${approvalIds.length} signed approval(s).`,
    {
      verification_id: verificationId,
      approval_ids: approvalIds,
      fix_id: run.fix_id,
      evidence_ids: run.after_evidence_ids,
    },
    now
  );
  e.closure = {
    closure_id: closureId,
    actor,
    at: now.toISOString(),
    verification_id: verificationId,
    approval_ids: approvalIds,
  };
  return e;
}

/** Records a v3.2 risk acceptance (invariant 4). */
export function acceptRisk(
  reg: ClosureRegister,
  input: Omit<RiskAcceptanceV32, "acceptance_id" | "approval_ids" | "created_at">,
  policy: AssurancePolicy,
  sha: string | null,
  now: Date
): RiskAcceptanceV32 {
  const e = entry(reg, input.finding_id);
  if (e.severity === "P0")
    throw usageError(
      `${e.finding_id} is P0; CT3 does not allow accepting P0 risk (it always blocks release).`
    );
  const missing = (["owner", "scope", "rationale", "closure_condition"] as const).filter(
    (k) => !input[k].trim()
  );
  if (input.compensating_controls.length === 0) missing.push("compensating_controls" as never);
  if (missing.length > 0) throw usageError(`Risk acceptance is missing: ${missing.join(", ")}.`);
  if (!isIsoDate(input.review_date) || !isIsoDate(input.expires))
    throw usageError("--review-date and --expires must be YYYY-MM-DD.");
  if (daysUntil(input.expires, now) < 0) throw usageError("The expiry date is in the past.");
  if (input.review_date > input.expires)
    throw usageError("The review date must not be after the expiry date.");
  const tally = tallyApprovals(
    reg.approvals,
    policy,
    { scopeType: "risk-acceptance", ref: e.finding_id, sha, excluded: [] },
    policy.risk.approvals[findingRisk(e.severity)]
  );
  if (!tally.satisfied)
    throw usageError(
      `Accepting ${e.finding_id} needs ${policy.risk.approvals[findingRisk(e.severity)]} signed human approval(s) (scope risk-acceptance:${e.finding_id}${sha ? `, sha ${sha.slice(0, 12)}` : ""}); found ${tally.validApprovers.length}.`
    );
  const acc: RiskAcceptanceV32 = {
    ...input,
    acceptance_id: seqId("RA", reg.risk_acceptances.length + 1),
    approval_ids: tally.evaluations.filter((x) => x.status === "VALID").map((x) => x.approval_id),
    created_at: now.toISOString(),
  };
  reg.risk_acceptances.push(acc);
  e.acceptance_id = acc.acceptance_id;
  apply(
    reg,
    e,
    "ACCEPTED_RISK",
    { id: input.owner, type: "human" },
    `Risk accepted as ${acc.acceptance_id} until ${acc.expires} (review ${acc.review_date}); not fixed, not closed.`,
    { approval_ids: acc.approval_ids },
    now
  );
  return acc;
}

/** Rejects a finding as a false positive; P0/P1 need signed human approval (secondary support). */
export function rejectFalsePositive(
  reg: ClosureRegister,
  id: string,
  rationale: string,
  actor: Actor,
  policy: AssurancePolicy,
  now: Date
): RegisterEntry {
  const e = entry(reg, id);
  if (!rationale.trim()) throw usageError("A false-positive rejection needs --reason.");
  let approvalIds: string[] = [];
  if (e.severity === "P0" || e.severity === "P1") {
    const tally = tallyApprovals(
      reg.approvals,
      policy,
      { scopeType: "false-positive", ref: id, sha: null, excluded: [] },
      1
    );
    if (!tally.satisfied && e.verification.state !== "DISPROVEN")
      throw usageError(
        `${id} is ${e.severity}; rejecting it as a false positive needs a signed human approval (scope false-positive:${id}) or a DISPROVEN verification.`
      );
    approvalIds = tally.evaluations.filter((x) => x.status === "VALID").map((x) => x.approval_id);
  }
  apply(reg, e, "REJECTED_FALSE_POSITIVE", actor, rationale, { approval_ids: approvalIds }, now);
  return e;
}

/** Re-opens accepted risks whose expiry passed (an expired acceptance never stays green). */
export function expireAcceptances(reg: ClosureRegister, now: Date): string[] {
  const reopened: string[] = [];
  for (const e of reg.entries.filter((x) => x.state === "ACCEPTED_RISK")) {
    const acc = reg.risk_acceptances.find((a) => a.acceptance_id === e.acceptance_id);
    if (acc && daysUntil(acc.expires, now) < 0) {
      apply(
        reg,
        e,
        "OPEN",
        SYSTEM,
        `Risk acceptance ${acc.acceptance_id} expired on ${acc.expires}.`,
        {},
        now
      );
      reopened.push(e.finding_id);
    }
  }
  return reopened;
}

/** Integrity: chain, transition legality, guarded-state invariants and referential integrity. */
export function checkRegister(reg: ClosureRegister): string[] {
  const errors: string[] = [];
  const all = reg.entries
    .flatMap((e) => e.transitions.map((t) => ({ e, t })))
    .sort((a, b) => a.t.seq - b.t.seq);
  let prev: string | null = null;
  all.forEach(({ e, t }, i) => {
    if (t.seq !== i + 1) errors.push(`transition seq ${t.seq} out of order (expected ${i + 1})`);
    if (t.prev_digest !== prev) errors.push(`${e.finding_id} seq ${t.seq}: broken chain link`);
    const { digest, ...body } = t;
    if (digestOf({ finding_id: e.finding_id, ...body }) !== digest)
      errors.push(`${e.finding_id} seq ${t.seq}: transition edited (digest mismatch)`);
    prev = t.digest;
  });
  if (reg.chain.length !== all.length || reg.chain.head_digest !== prev)
    errors.push("chain head does not match the last transition");
  const runs = new Map(reg.verification_runs.map((r) => [r.verification_id, r]));
  const fixes = new Map(reg.fixes.map((f) => [f.fix_id, f]));
  const approvals = new Set(reg.approvals.map((a) => a.approval_id));
  for (const e of reg.entries) {
    let state: ClosureState | null = null;
    for (const t of e.transitions) {
      const cur = state as ClosureState | null;
      if (t.from !== cur) errors.push(`${e.finding_id} seq ${t.seq}: from ${t.from} but state was ${cur}`);
      if (cur !== null && !TRANSITIONS[cur].includes(t.to))
        errors.push(`${e.finding_id} seq ${t.seq}: ${cur} → ${t.to} is not allowed`);
      if (t.to === "VERIFIED_FIXED") {
        const run = t.refs.verification_id ? runs.get(t.refs.verification_id) : undefined;
        const fix = t.refs.fix_id ? fixes.get(t.refs.fix_id) : undefined;
        if (!run || run.result !== "PASS")
          errors.push(`${e.finding_id}: VERIFIED_FIXED without a passing verification run`);
        else if (!fix || run.exact_sha !== fix.change_sha)
          errors.push(`${e.finding_id}: VERIFIED_FIXED not verified against the exact fix commit`);
        if (t.actor.type !== "system")
          errors.push(`${e.finding_id}: VERIFIED_FIXED set by ${t.actor.type}, not by a verification run`);
      }
      if (t.to === "CLOSED") {
        if (t.actor.type !== "human") errors.push(`${e.finding_id}: CLOSED by a non-human actor`);
        if (!t.refs.verification_id || !runs.has(t.refs.verification_id))
          errors.push(`${e.finding_id}: CLOSED without verification`);
        if (t.refs.approval_ids.length === 0) errors.push(`${e.finding_id}: CLOSED without approvals`);
      }
      if (
        t.to === "ACCEPTED_RISK" &&
        (!e.acceptance_id || !reg.risk_acceptances.some((a) => a.acceptance_id === e.acceptance_id))
      )
        errors.push(`${e.finding_id}: ACCEPTED_RISK without a recorded acceptance`);
      for (const a of t.refs.approval_ids)
        if (!approvals.has(a)) errors.push(`${e.finding_id}: unknown approval ${a}`);
      state = t.to;
    }
    if (state !== e.state)
      errors.push(`${e.finding_id}: state ${e.state} does not match its transitions (${state})`);
    for (const f of e.fix_ids) if (!fixes.has(f)) errors.push(`${e.finding_id}: unknown fix ${f}`);
    for (const v of e.verification_ids)
      if (!runs.has(v)) errors.push(`${e.finding_id}: unknown verification ${v}`);
  }
  for (const f of reg.fixes)
    for (const id of f.finding_ids)
      if (!reg.entries.some((e) => e.finding_id === id)) errors.push(`${f.fix_id}: unknown finding ${id}`);
  return errors;
}
