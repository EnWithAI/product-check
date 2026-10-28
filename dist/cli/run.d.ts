import type { Verdict } from "../types.js";
/** I/O seams so the CLI can run in-process in tests. */
export interface CliIO {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    cwd: string;
    now?: () => Date;
}
/** Text printed by `product-check --help`. */
export declare const HELP: string;
/** Runs the CLI and returns the process exit code. Never throws. */
export declare function run(argv: string[], io: CliIO): Promise<number>;
export type { Verdict };
