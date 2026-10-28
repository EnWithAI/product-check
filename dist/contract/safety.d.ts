import type { ScanContract } from "../types.js";
/** What the run is allowed to do. */
export interface RunPermissions {
    network: boolean;
    exposureProbe: boolean;
    origin: string | null;
    /** Why the deployed application will not be probed (null when it will be, or when there is no URL). */
    appBlockedReason: string | null;
}
/** Applies the safety rules. `networkFlag` is true when --allow-network or --authorize was given. */
export declare function decidePermissions(contract: ScanContract, networkFlag: boolean, contractFromFile: boolean): RunPermissions;
