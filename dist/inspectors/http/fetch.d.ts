import { type Observation } from "./observe.js";
/** Options for one probe run. */
export interface ProbeOptions {
    url: string;
    maxRequests: number;
    timeoutMs: number;
    exposureProbe: boolean;
    now: () => Date;
}
/** Result of a probe: observations, request count and per-request errors. */
export interface ProbeResult {
    observations: Observation[];
    requests: number;
    skipped: string[];
}
export declare const EXPOSURE_PATHS: string[];
/** Performs passive requests against the origin of `options.url`. */
export declare function probe(options: ProbeOptions): Promise<ProbeResult>;
