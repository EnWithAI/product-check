import type { Results, ScanContract } from "../types.js";
import type { ExecPermission } from "../exec/process.js";
import type { EvidenceLog } from "./evidence-log.js";
import { type AssurancePolicy, type ClosureRegister, type EnvironmentRecord, type VerificationRun } from "./types.js";
export interface VerifyInput {
    register: ClosureRegister;
    findingIds: string[];
    repo: string;
    head: string;
    clean: boolean | null;
    baseline: {
        results: Results;
        sha256: string;
    };
    contract: ScanContract | null;
    extraTestResults: string[];
    policy: AssurancePolicy;
    permission: ExecPermission;
    env: EnvironmentRecord;
    log: EvidenceLog;
    now: () => Date;
    baseDir: string;
    writeAfterResults: (verificationId: string, results: Results) => string;
}
/** Runs one verification and returns the run (the caller applies it to the register). */
export declare function verifyFindings(input: VerifyInput): Promise<VerificationRun>;
