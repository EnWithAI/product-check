import type { CommandExecution, CommandSpec } from "../assurance/types.js";
/** Result of a git read. */
export interface GitResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}
/** Runs a read-only git subcommand in `repo`. */
export declare function gitRead(repo: string, args: string[], maxBuffer?: number): GitResult;
/** Authorization for command execution, decided once per CLI invocation. */
export interface ExecPermission {
    allowed: boolean;
    reason: string;
}
/** Inputs to one execution. */
export interface ExecInput {
    spec: CommandSpec;
    repo: string;
    permission: ExecPermission;
    envAllowlist: readonly string[];
    maxOutputBytes: number;
    environmentId: string;
    commitSha: string | null;
    now: () => Date;
}
/** Executes one declared command (argv, no shell). Never throws for command failures. */
export declare function execCommand(input: ExecInput): CommandExecution;
