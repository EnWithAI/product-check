import { type Approval, type ApprovalEvaluation, type AssurancePolicy } from "./types.js";
/** Key ID: first 16 hex chars of SHA-256 over the DER-encoded SPKI public key. */
export declare function keyId(publicKeyPem: string): string;
/** Generates an Ed25519 key pair (PEM). */
export declare function generateApproverKeys(): {
    privateKey: string;
    publicKey: string;
};
type Unsigned = Omit<Approval, "approval_id" | "signature">;
/** Creates and signs an approval with a private key (PEM). */
export declare function signApproval(input: Omit<Unsigned, "schema_version" | "kind">, privateKeyPem: string): Approval;
/** Records an unsigned claim (e.g. a name typed with --approver). It never counts as approval. */
export declare function unsignedClaim(input: Omit<Unsigned, "schema_version" | "kind">): Approval;
/** Evaluates one approval for a required scope and commit. */
export declare function evaluateApproval(a: Approval, policy: AssurancePolicy, want: {
    scopeType: Approval["scope"]["type"];
    ref: string;
    sha: string | null;
    excluded: string[];
}): ApprovalEvaluation;
/** Evaluates all approvals for a scope; counts distinct valid human approvers and checks domain owners. */
export declare function tallyApprovals(approvals: Approval[], policy: AssurancePolicy, want: {
    scopeType: Approval["scope"]["type"];
    ref: string;
    sha: string | null;
    excluded: string[];
}, required: number, owners?: string[]): {
    evaluations: ApprovalEvaluation[];
    validApprovers: string[];
    satisfied: boolean;
    missingOwners: string[];
    stale: number;
};
export {};
