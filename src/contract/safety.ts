// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * The safety gate. Decides what a run may do and refuses (exit 4) anything unsafe or unauthorized:
 * - prohibited action classes are never authorized, whatever the contract says;
 * - network access needs `passive-http` in the contract, a written attestation, the target origin in scope,
 *   and (when the contract came from a file) the explicit --allow-network flag;
 * - the exposure probe additionally needs `exposure-probe`;
 * - URLs with embedded credentials are refused.
 */
import { safetyError } from "../errors.js";
import type { ScanContract } from "../types.js";
import { ALWAYS_PROHIBITED } from "./contract.js";

/** What the run is allowed to do. */
export interface RunPermissions {
  network: boolean;
  exposureProbe: boolean;
  origin: string | null;
  /** Why the deployed application will not be probed (null when it will be, or when there is no URL). */
  appBlockedReason: string | null;
}

/** Applies the safety rules. `networkFlag` is true when --allow-network or --authorize was given. */
export function decidePermissions(
  contract: ScanContract,
  networkFlag: boolean,
  contractFromFile: boolean
): RunPermissions {
  const requested = contract.authorization.authorized_actions as string[];
  const forbidden = requested.filter((a) => (ALWAYS_PROHIBITED as readonly string[]).includes(a));
  if (forbidden.length > 0)
    throw safetyError(
      `The contract authorizes prohibited actions: ${forbidden.join(", ")}. Product Check never performs them.`
    );
  const missingProhibitions = ALWAYS_PROHIBITED.filter(
    (p) => !contract.authorization.prohibited_actions.includes(p)
  );
  if (missingProhibitions.length > 0) {
    throw safetyError(
      `The contract removes standing prohibitions: ${missingProhibitions.join(", ")}.`,
      "prohibited_actions must keep every default entry; they cannot be lifted."
    );
  }
  const app = contract.target.application;
  const wantsNetwork = requested.includes("passive-http");
  const wantsExposure = requested.includes("exposure-probe");
  if (wantsExposure && !wantsNetwork) throw safetyError("exposure-probe requires passive-http as well.");
  if (!app) {
    if (wantsNetwork) throw safetyError("Network actions are authorized but no application URL is declared.");
    return { network: false, exposureProbe: false, origin: null, appBlockedReason: null };
  }
  let url: URL;
  try {
    url = new URL(app.url);
  } catch {
    throw safetyError(`Invalid application URL: ${app.url}`);
  }
  if (url.username || url.password)
    throw safetyError(
      "Application URLs must not contain credentials.",
      "Product Check never authenticates; remove user:password@ from the URL."
    );
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw safetyError("Only http(s) application URLs are supported.");
  const recorded = contract.imports.observations !== null || contract.imports.har !== null;
  if (!wantsNetwork) {
    if (recorded) return { network: false, exposureProbe: false, origin: url.origin, appBlockedReason: null };
    if (contract.mode === "APPLICATION" || contract.mode === "HYBRID") {
      throw safetyError(
        `${contract.mode} mode needs authorization to request ${url.origin}.`,
        "Only scan what you own or are authorized to test, then add `--authorize passive-http` (or put passive-http and an attestation in the contract). Or supply recorded observations with --observations/--har."
      );
    }
    return {
      network: false,
      exposureProbe: false,
      origin: url.origin,
      appBlockedReason: "Requests to the application were not authorized (passive-http not granted).",
    };
  }
  if (contract.authorization.attestation === null)
    throw safetyError(
      "passive-http requires an authorization attestation (who authorized the assessment, and when)."
    );
  if (!contract.authorization.scope.origins.includes(url.origin))
    throw safetyError(
      `${url.origin} is not in the authorized scope (${contract.authorization.scope.origins.join(", ") || "empty"}).`
    );
  if (recorded) return { network: false, exposureProbe: false, origin: url.origin, appBlockedReason: null };
  if (contractFromFile && !networkFlag) {
    throw safetyError(
      "The contract authorizes network requests; confirm by adding --allow-network.",
      "This prevents a contract file you did not write from triggering requests silently."
    );
  }
  return { network: true, exposureProbe: wantsExposure, origin: url.origin, appBlockedReason: null };
}
