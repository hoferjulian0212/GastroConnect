// Authentication & authorization middleware. `loadAuth` resolves the session
// member into a full AuthContext (member + org + role) on every request without
// rejecting; `requireAuth` and `requireCapability` enforce. The session-derived
// identity replaces the previously client-supplied (spoofable) ids.
// `loadAdminAuth` does the same for the platform-admin session layer.
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { can, type Capability } from "@shared/permissions";
import type { Member, User, MemberRole, PlatformAdmin } from "@shared/schema";

export interface AuthContext {
  member: Member;
  org: User;
  memberId: string;
  organizationId: string;
  role: MemberRole;
  /** True when a platform admin is impersonating this member. */
  isImpersonated?: boolean;
}

export interface AdminContext {
  admin: PlatformAdmin;
  adminId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      platformAdmin?: AdminContext;
    }
  }
}

/**
 * Loads the authenticated member/org/role from the session if present. Never
 * rejects — protected routes opt in via requireAuth/requireCapability. Stale
 * sessions (member deleted) are cleared.
 *
 * Impersonation: if a platform-admin session has set `impersonatedMemberId`,
 * that member's context is loaded instead of the real session member.
 */
export async function loadAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    // Impersonation: platform admin acting as a member.
    const impersonatedId = req.session?.impersonatedMemberId;
    const adminId = req.session?.adminId;
    if (impersonatedId && adminId) {
      const member = await storage.getMember(impersonatedId);
      const org = member ? await storage.getUser(member.organizationId) : undefined;
      if (member && org) {
        req.auth = {
          member,
          org,
          memberId: member.id,
          organizationId: member.organizationId,
          role: member.role,
          isImpersonated: true,
        };
        return next();
      }
      // Impersonated member no longer exists — clear impersonation.
      req.session.impersonatedMemberId = undefined;
    }

    // Normal member session.
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

/**
 * Loads the platform-admin identity from the session. Never rejects; protected
 * admin routes opt in via requirePlatformAdmin.
 */
export async function loadAdminAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const adminId = req.session?.adminId;
    if (adminId) {
      const admin = await storage.getPlatformAdmin(adminId);
      if (admin && admin.status === "approved") {
        req.platformAdmin = { admin, adminId: admin.id };
      } else if (!admin) {
        req.session.adminId = undefined;
      }
    }
  } catch (err) {
    console.error("[admin] loadAdminAuth failed:", err);
  }
  next();
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.platformAdmin) {
    return res.status(401).json({ error: "unauthenticated", message: "Admin-Sitzung erforderlich." });
  }
  next();
}
