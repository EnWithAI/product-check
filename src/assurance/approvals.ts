// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Accountable human approvals. An approval is a signed statement (Ed25519 over canonical JSON) by an approver the
 * policy lists with a public key. A name passed on the command line proves nothing: only a signature that verifies
 * against a policy key counts. Bots can sign records but never fill a human approval slot; an approval is bound
 * to the exact commit it reviewed and becomes STALE when the commit changes; the implementer of a fix cannot
 * approve its closure.
 *
 * Limit: Product Check proves possession of a registered key, not that a person pressed the key. Key custody is the
 * operator's control (see docs/vibe-code-assurance.md).
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { usageError } from "../errors.js";
import { stableId } from "../util/hash.js";
import {
  ASSURANCE_SCHEMA_VERSION,
  type Approval,
  type ApprovalEvaluation,
  type AssurancePolicy,
} from "./types.js";
import { canonicalJson } from "./util.js";

/** Key ID: first 16 hex chars of SHA-256 over the DER-encoded SPKI public key. */
export function keyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/** Generates an Ed25519 key pair (PEM). */
export function generateApproverKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

type Unsigned = Omit<Approval, "approval_id" | "signature">;

const payloadOf = (a: Unsigned | Approval): string =>
  canonicalJson({
    schema_version: a.schema_version,
    kind: a.kind,
    approver: a.approver,
    scope: a.scope,
    reviewed_sha: a.reviewed_sha,
    decision: a.decision,
    comment: a.comment,
    created_at: a.created_at,
  });

/** Creates and signs an approval with a private key (PEM). */
export function signApproval(
  input: Omit<Unsigned, "schema_version" | "kind">,
  privateKeyPem: string
): Approval {
  let key;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    throw usageError("The approver key is not a readable private key (PKCS#8 PEM).");
  }
  if (key.asymmetricKeyType !== "ed25519") throw usageError("Approver keys must be Ed25519.");
  const unsigned: Unsigned = { schema_version: ASSURANCE_SCHEMA_VERSION, kind: "approval", ...input };
  const payload = payloadOf(unsigned);
  const value = sign(null, Buffer.from(payload), key).toString("base64");
  const pub = createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
  return {
    ...unsigned,
    approval_id: stableId("AP", [payload], 12),
    signature: { algorithm: "ed25519", key_id: keyId(pub), value },
  };
}

/** Records an unsigned claim (e.g. a name typed with --approver). It never counts as approval. */
export function unsignedClaim(input: Omit<Unsigned, "schema_version" | "kind">): Approval {
  const unsigned: Unsigned = { schema_version: ASSURANCE_SCHEMA_VERSION, kind: "approval", ...input };
  return { ...unsigned, approval_id: stableId("AP", [payloadOf(unsigned), "unsigned"], 12), signature: null };
}

/** Verifies the approval's signature against the policy; returns null when valid, else the failing status. */
function signatureStatus(a: Approval, policy: AssurancePolicy): ApprovalEvaluation["status"] | null {
  const approver = policy.approvers.find((p) => p.id === a.approver.id);
  if (!approver) return "UNKNOWN_APPROVER";
  if (!a.signature) return "UNSIGNED";
  if (a.signature.key_id !== keyId(approver.public_key)) return "INVALID_SIGNATURE";
  try {
    const ok = verify(
      null,
      Buffer.from(payloadOf(a)),
      createPublicKey(approver.public_key),
      Buffer.from(a.signature.value, "base64")
    );
    if (!ok) return "INVALID_SIGNATURE";
  } catch {
    return "INVALID_SIGNATURE";
  }
  if (a.approval_id !== stableId("AP", [payloadOf(a)], 12)) return "INVALID_SIGNATURE";
  if (approver.type !== "human" || a.approver.type !== "human") return "NOT_HUMAN";
  return null;
}

/** Evaluates one approval for a required scope and commit. */
export function evaluateApproval(
  a: Approval,
  policy: AssurancePolicy,
  want: { scopeType: Approval["scope"]["type"]; ref: string; sha: string | null; excluded: string[] }
): ApprovalEvaluation {
  const res = (status: ApprovalEvaluation["status"], reason: string): ApprovalEvaluation => ({
    approval_id: a.approval_id,
    approver_id: a.approver.id,
    status,
    reason,
  });
  const sig = signatureStatus(a, policy);
  if (sig === "UNKNOWN_APPROVER") return res(sig, `${a.approver.id} is not an approver in the policy.`);
  if (sig === "UNSIGNED") return res(sig, "Unsigned claim: a typed name is not proof of approval.");
  if (sig === "INVALID_SIGNATURE")
    return res(sig, "The signature does not verify against the approver's policy key (edited or forged).");
  if (sig === "NOT_HUMAN")
    return res(sig, `${a.approver.id} is a bot; automated reviewers cannot fill a human approval slot.`);
  if (a.scope.type !== want.scopeType || a.scope.ref !== want.ref)
    return res(
      "WRONG_SCOPE",
      `Approval covers ${a.scope.type}:${a.scope.ref}, not ${want.scopeType}:${want.ref}.`
    );
  if (want.excluded.includes(a.approver.id))
    return res("SELF_APPROVAL", `${a.approver.id} implemented this change and cannot approve it.`);
  if (a.decision !== "approve")
    return res("REJECTED", `${a.approver.id} rejected: ${a.comment || "(no comment)"}`);
  if (want.sha !== null && a.reviewed_sha !== want.sha)
    return res(
      "STALE",
      `Reviewed ${a.reviewed_sha.slice(0, 12)}, but the current commit is ${want.sha.slice(0, 12)}; re-approval required.`
    );
  return res("VALID", `Signed by ${a.approver.id} for ${a.reviewed_sha.slice(0, 12)}.`);
}

/** Evaluates all approvals for a scope; counts distinct valid human approvers and checks domain owners. */
export function tallyApprovals(
  approvals: Approval[],
  policy: AssurancePolicy,
  want: { scopeType: Approval["scope"]["type"]; ref: string; sha: string | null; excluded: string[] },
  required: number,
  owners: string[] = []
): {
  evaluations: ApprovalEvaluation[];
  validApprovers: string[];
  satisfied: boolean;
  missingOwners: string[];
  stale: number;
} {
  const relevant = approvals.filter((a) => a.scope.type === want.scopeType && a.scope.ref === want.ref);
  const evaluations = relevant.map((a) => evaluateApproval(a, policy, want));
  const rejected = evaluations.some((e) => e.status === "REJECTED");
  const validApprovers = [
    ...new Set(evaluations.filter((e) => e.status === "VALID").map((e) => e.approver_id)),
  ].sort();
  const missingOwners = owners.filter((o) => !validApprovers.includes(o));
  return {
    evaluations,
    validApprovers,
    satisfied: !rejected && validApprovers.length >= required && missingOwners.length === 0,
    missingOwners,
    stale: evaluations.filter((e) => e.status === "STALE").length,
  };
}
