/**
 * Agent-ready fix packets (VC-P4) for verified, high-priority findings. Each packet traces to source lines and/or
 * runtime paths through evidence, states the root-cause hypothesis and its certainty, the smallest systemic change,
 * acceptance conditions, regression and negative tests, a change-scope guard and a rollback plan. Test commands are
 * never invented: a command appears only when the operator's policy declares it; reproduction commands are declared
 * by the implementer when recording the fix. Packets are proposals: applying one needs permission, and a packet's
 * implementation is not a fix until verify passes.
 */
import type { Results } from "../types.js";
import { type AssurancePolicy, type ChangeReview, type ClosureRegister, type FixPacket } from "./types.js";
/** Packets for active, verified P0–P2 entries of the register. */
export declare function buildFixPackets(reg: ClosureRegister, results: Results | null, reviews: ChangeReview[], policy: AssurancePolicy): FixPacket[];
