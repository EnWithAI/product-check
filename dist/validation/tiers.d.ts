/**
 * Lifecycle assurance tiers CT-T0…CT-T6, the mapping from declared lifecycle stage to tier, and tier-specific
 * verdict aliases. Tiers carry forward: a tier applies every control of its own and all earlier tiers.
 */
import type { LifecycleStage, Tier, Verdict } from "../types.js";
/** Public tier descriptions (Product Check's own wording). */
export declare const TIER_INFO: Record<Tier, {
    name: string;
    focus: string;
}>;
/** Declared stage → primary tier. */
export declare const STAGE_TIER: Record<LifecycleStage, Tier>;
export declare const STAGES: LifecycleStage[];
/** Index of a tier (0…6). */
export declare const tierIndex: (tier: Tier) => number;
/** The primary tier: the highest explicit tier, else the stage mapping. */
export declare function primaryTier(stage: LifecycleStage, explicit: Tier[] | null): Tier;
/** Tiers applied with carry-forward: every tier up to and including the primary tier. */
export declare function appliedTiers(primary: Tier): Tier[];
/** Tier alias of a verdict. */
export declare const verdictAlias: (tier: Tier, verdict: Verdict) => string;
