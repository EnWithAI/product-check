import { type AssurancePolicy } from "./types.js";
/** Defaults: no checks declared, nobody may approve, HIGH needs two humans, three review cycles. */
export declare function defaultPolicy(): AssurancePolicy;
/** Applies defaults, validates against the schema and checks every approver key parses. */
export declare function parsePolicy(raw: unknown, label: string): AssurancePolicy;
/** Loads a policy file, or the defaults when no path is given. */
export declare function loadPolicy(path: string | undefined): {
    policy: AssurancePolicy;
    digest: string | null;
};
