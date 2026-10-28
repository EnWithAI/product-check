import { type ObservationSet } from "../inspectors/http/observe.js";
/** Converts parsed HAR JSON into an observation set for `origin`. */
export declare function harToObservations(har: unknown, origin: string, label: string): ObservationSet;
