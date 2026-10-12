// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Lifecycle assurance tiers CT-T0…CT-T6, the mapping from declared lifecycle stage to tier, and tier-specific
 * verdict aliases. Tiers carry forward: a tier applies every control of its own and all earlier tiers.
 */
import type { LifecycleStage, Tier, Verdict } from "../types.js";
import { TIERS } from "../types.js";

/** Public tier descriptions (Product Check's own wording). */
export const TIER_INFO: Record<Tier, { name: string; focus: string }> = {
  "CT-T0": {
    name: "Foundation & Testability",
    focus:
      "Architecture boundaries, secrets, access control, data ownership, testability and recovery basics.",
  },
  "CT-T1": {
    name: "Experience & Product Usefulness",
    focus: "Onboarding, accessibility, core journeys and correct user-facing behaviour.",
  },
  "CT-T2": {
    name: "Pre-Launch Assurance",
    focus: "Integrated functionality, isolation, privacy, security hardening, regression and AI behaviour.",
  },
  "CT-T3": {
    name: "Launch Decision",
    focus:
      "Verified hard gates, outstanding blockers, risk acceptances and go/no-go evidence for an exact release candidate.",
  },
  "CT-T4": {
    name: "Launch Watch",
    focus: "Production monitoring and rapid detection of escaped defects (read-only).",
  },
  "CT-T5": {
    name: "Stabilization",
    focus: "Real customer behaviour, product value, incident and defect trends.",
  },
  "CT-T6": {
    name: "Continuous Assurance",
    focus: "Release-to-release regression, drift, privacy, security, resilience and scale.",
  },
};

/** Declared stage → primary tier. */
export const STAGE_TIER: Record<LifecycleStage, Tier> = {
  DISCOVERY_BUILD: "CT-T0",
  ALPHA: "CT-T1",
  BETA_PILOT: "CT-T2",
  PRE_LAUNCH: "CT-T2",
  LAUNCH_GATE: "CT-T3",
  JUST_LAUNCHED: "CT-T4",
  POST_LAUNCH: "CT-T5",
  PRODUCTION_SCALE: "CT-T6",
  MAJOR_CHANGE: "CT-T6",
};

export const STAGES = Object.keys(STAGE_TIER) as LifecycleStage[];

/** Index of a tier (0…6). */
export const tierIndex = (tier: Tier): number => TIERS.indexOf(tier);

/** The primary tier: the highest explicit tier, else the stage mapping. */
export function primaryTier(stage: LifecycleStage, explicit: Tier[] | null): Tier {
  if (explicit && explicit.length > 0)
    return [...explicit].sort((a, b) => tierIndex(a) - tierIndex(b)).at(-1) as Tier;
  return STAGE_TIER[stage];
}

/** Tiers applied with carry-forward: every tier up to and including the primary tier. */
export function appliedTiers(primary: Tier): Tier[] {
  return TIERS.slice(0, tierIndex(primary) + 1);
}

/** Tier-specific wording of the generic verdict, for readers used to stage-gate language. */
const ALIASES: Record<Tier, Record<Verdict, string>> = {
  "CT-T0": {
    READY: "READY FOR T1",
    READY_WITH_CONDITIONS: "READY WITH CONDITIONS",
    NOT_READY: "NOT READY",
    INCONCLUSIVE: "INSUFFICIENT EVIDENCE",
  },
  "CT-T1": {
    READY: "READY FOR T2",
    READY_WITH_CONDITIONS: "READY WITH UX REMEDIATION",
    NOT_READY: "NOT READY",
    INCONCLUSIVE: "INSUFFICIENT EVIDENCE",
  },
  "CT-T2": {
    READY: "READY FOR RELEASE CANDIDATE",
    READY_WITH_CONDITIONS: "CONDITIONAL",
    NOT_READY: "NOT READY",
    INCONCLUSIVE: "INSUFFICIENT EVIDENCE",
  },
  "CT-T3": {
    READY: "GO",
    READY_WITH_CONDITIONS: "GO WITH ACCEPTED RISK",
    NOT_READY: "NO-GO",
    INCONCLUSIVE: "NO DECISION: INSUFFICIENT EVIDENCE",
  },
  "CT-T4": {
    READY: "STABLE",
    READY_WITH_CONDITIONS: "STABLE WITH HOTFIXES",
    NOT_READY: "DEGRADED",
    INCONCLUSIVE: "INSUFFICIENT EVIDENCE",
  },
  "CT-T5": {
    READY: "STABLE FOR SCALE",
    READY_WITH_CONDITIONS: "STABLE WITH REMEDIATION",
    NOT_READY: "DO NOT SCALE YET",
    INCONCLUSIVE: "INSUFFICIENT EVIDENCE",
  },
  "CT-T6": {
    READY: "CONTINUOUSLY ASSURED",
    READY_WITH_CONDITIONS: "REMEDIATION REQUIRED",
    NOT_READY: "SCALE PAUSE",
    INCONCLUSIVE: "INSUFFICIENT EVIDENCE",
  },
};

/** Tier alias of a verdict. */
export const verdictAlias = (tier: Tier, verdict: Verdict): string => ALIASES[tier][verdict];
