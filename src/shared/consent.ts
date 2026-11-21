/**
 * Consent decision logic, kept pure so it can be tested without a browser.
 *
 * Graduated consent: the first Allow creates a standing grant for that
 * AI app + profile pair, so later messages share without another click. An
 * explicit "Always ask" preference (or enterprise policy) wins over any grant.
 */
import type { AccessLevel } from "./types";

export interface ConsentContext {
  access: AccessLevel;
  hasStandingGrant: boolean;
  requireApproval: boolean;
}

/** Whether the wallet may share silently without showing the permission card. */
export function canAutoApprove({ access, hasStandingGrant, requireApproval }: ConsentContext): boolean {
  if (requireApproval) return false;
  // An explicit deny is stronger than a stale grant: revocation must win.
  if (access === "deny") return false;
  return access === "allow" || hasStandingGrant;
}

/** Duration of the first approval that created a standing grant, for the receipt. */
export function grantLabel(duration: "once" | "session" | "always"): string {
  switch (duration) {
    case "always":
      return "Future messages won't ask again";
    case "session":
      return "Until you close this browser";
    default:
      return "This message only";
  }
}
