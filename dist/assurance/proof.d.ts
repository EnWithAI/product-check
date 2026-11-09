import { type ExecPermission } from "../exec/process.js";
import type { EvidenceLog } from "./evidence-log.js";
import { type AssurancePolicy, type CommandExecution, type CommandSpec, type EnvironmentRecord, type VerificationCheckResult, type VerificationRun } from "./types.js";
/** Scripts a repository declares that could serve as checks (suggestions only). */
export declare function detectCheckSuggestions(repo: string): {
    id: string;
    argv: string[];
    purpose: CommandSpec["purpose"];
}[];
/** Runs commands, records each execution in the evidence log, returns executions and checks. */
export declare function runCommands(specs: CommandSpec[], role: VerificationCheckResult["role"], ctx: {
    repo: string;
    permission: ExecPermission;
    policy: AssurancePolicy;
    env: EnvironmentRecord;
    sha: string | null;
    log: EvidenceLog;
    now: () => Date;
}): {
    executions: CommandExecution[];
    checks: VerificationCheckResult[];
};
/** Overall result from checks: any FAIL → FAIL; anything not run → INCONCLUSIVE; else PASS. */
export declare function overall(checks: VerificationCheckResult[]): VerificationRun["result"];
/** VC-P1: executes the policy's required checks at the current commit. */
export declare function authorProof(input: {
    repo: string;
    policy: AssurancePolicy;
    permission: ExecPermission;
    env: EnvironmentRecord;
    sha: string | null;
    clean: boolean | null;
    log: EvidenceLog;
    now: () => Date;
}): VerificationRun;
