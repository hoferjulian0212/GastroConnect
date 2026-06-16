// Authentication & authorization middleware. `loadAuth` resolves the session
// member into a full AuthContext (member + org + role) on every request without
// rejecting; `requireAuth` and `requireCapability` enforce. The session-derived
// identity replaces the previously client-supplied (spoofable) ids.
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { can, type Capability } from "@shared/permissions";
import type { Member, User, MemberRole } from "@shared/schema";

export interface AuthContext {
  member: Member;
  org: User;
  memberId: string;
  organizationId: string;
  role: MemberRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Loads the authenticated member/org/role from the session if present. Never
 * rejects — protected routes opt in via requireAuth/requireCapability. Stale
 * sessions (member deleted) are cleared.
 */
export async function loadAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const memberId = req.session?.memberId;
    if (memberId) {
      const member = await storage.getMember(memberId);
      const org = member ? await storage.getUser(member.organizationId) : undefined;
      if (member && org) {
        req.auth = {
          member,
          org,
          memberId: member.id,
          organizationId: member.organizationId,
          role: member.role,
        };
      } else {
        // Member or org no longer exists — drop the stale session.
        req.session.memberId = undefined;
      }
    }
  } catch (err) {
    console.error("[auth] loadAuth failed:", err);
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res
      .status(401)
      .json({ error: "unauthenticated", message: "Bitte melden Sie sich an." });
  }
  next();
}

export function requireCapability(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res
        .status(401)
        .json({ error: "unauthenticated", message: "Bitte melden Sie sich an." });
    }
    if (!can(req.auth.role, capability)) {
      return res
        .status(403)
        .json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
    }
    next();
  };
}

/**
 * Ensures the authenticated member belongs to one of the allowed organizations.
 * Use to enforce per-resource ownership once the target org id is known.
 */
export function assertOrgAccess(req: Request, allowedOrgIds: string | string[]): boolean {
  if (!req.auth) return false;
  const allowed = Array.isArray(allowedOrgIds) ? allowedOrgIds : [allowedOrgIds];
  return allowed.includes(req.auth.organizationId);
}
