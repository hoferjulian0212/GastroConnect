// Authentication & authorization middleware.
// Member identity comes from Clerk (getAuth). `loadAuth` resolves the Clerk
// session to a full AuthContext (member + org + role) on every request without
// rejecting; `requireAuth` and `requireCapability` enforce.
// Admin impersonation still lives in the express-session (adminId /
// impersonatedMemberId) because the platform-admin layer uses its own
// cookie-based session, separate from Clerk.
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
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
 * Loads the authenticated member/org/role from the Clerk session if present.
 * Never rejects — protected routes opt in via requireAuth/requireCapability.
 *
 * Impersonation: if a platform-admin session has set `impersonatedMemberId`,
 * that member's context is loaded instead of the Clerk-authenticated member.
 */
export async function loadAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    // Impersonation: platform admin acting as a member (express-session).
    const impersonatedId = req.session?.impersonatedMemberId;
    const adminId = req.session?.adminId;
    if (impersonatedId && adminId) {
      const [adminRecord, member] = await Promise.all([
        storage.getPlatformAdmin(adminId),
        storage.getMember(impersonatedId),
      ]);
      const adminStillApproved = adminRecord?.status === "approved";
      if (!adminStillApproved) {
        req.session.adminId = undefined;
        req.session.impersonatedMemberId = undefined;
        // Fall through to Clerk-based member auth below.
      } else {
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
        req.session.impersonatedMemberId = undefined;
      }
    }

    // Normal member auth: resolved from the Clerk session token.
    // IMPORTANT: @clerk/express sets req.auth to its own ClerkAuthObject on
    // every request (even unauthenticated ones). We read from it via getAuth()
    // then immediately replace it with our AuthContext or undefined so that
    // route handlers can reliably check `if (!req.auth)`.
    const clerkAuth = getAuth(req);
    (req as any).auth = undefined; // reset Clerk's auth object
    const email = clerkAuth?.sessionClaims?.email as string | undefined;
    if (email) {
      req.auth = await resolveClerkAuth(email) ?? undefined;
    }
  } catch (err) {
    console.error("[auth] loadAuth failed:", err);
  }
  next();
}

/**
 * Resolves a Clerk-authenticated email address to a full AuthContext.
 *
 * Invitation enforcement (invite-only model):
 * - If the member has a valid pending invitation: accept it atomically and
 *   verify the org if it is still pending.
 * - If there is NO pending invitation and the org is NOT yet verified: deny
 *   access (null) — a Clerk account alone cannot activate an unverified org.
 * - If there is NO pending invitation and the org IS already verified: allow
 *   (the member was previously on-boarded; their invitation was already
 *   consumed on an earlier sign-in, or the org was pre-verified e.g. by demo
 *   bootstrap).
 *
 * Returns null when access should be denied (req.auth stays undefined →
 * requireAuth returns 401).
 *
 * Exported so it can be tested directly without a live HTTP server.
 */
export async function resolveClerkAuth(email: string): Promise<AuthContext | null> {
  const member = await storage.getMemberByEmail(email.toLowerCase());
  if (!member) return null;
  let org = await storage.getUser(member.organizationId);
  if (!org) return null;

  // Every member must have gone through the invitation flow at least once.
  // Check whether this member already has a previously accepted invitation
  // (i.e. has signed in before and consumed their invite on an earlier request).
  const acceptedInvitation = await storage.getAcceptedInvitationByMemberId(member.id);
  if (acceptedInvitation) {
    // Member is already on-boarded — fast path, no further checks needed.
    return {
      member,
      org,
      memberId: member.id,
      organizationId: member.organizationId,
      role: member.role,
    };
  }

  // No accepted invitation yet — look for a valid pending one. A Clerk account
  // alone (even with a matching email) is not sufficient: the member must
  // consume a pending invitation to gain first access. This binds sign-up to
  // the exact invited email and prevents access via expired, deleted, or
  // never-issued invitations.
  const pendingInvitation = await storage.getPendingInvitationByMemberId(member.id);
  if (!pendingInvitation) {
    // No accepted and no valid pending invitation — deny.
    return null;
  }

  // Consume the pending invitation atomically; verify the org if still pending.
  await storage.markInvitationAccepted(pendingInvitation.id);
  if (!org.verifiedAt) {
    await storage.markOrganizationVerified(org.id);
    org = { ...org, verifiedAt: new Date() };
  }

  return {
    member,
    org,
    memberId: member.id,
    organizationId: member.organizationId,
    role: member.role,
  };
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
 */
export function assertOrgAccess(req: Request, allowedOrgIds: string | string[]): boolean {
  if (!req.auth) return false;
  const allowed = Array.isArray(allowedOrgIds) ? allowedOrgIds : [allowedOrgIds];
  return allowed.includes(req.auth.organizationId);
}

/**
 * Loads the platform-admin identity from the express-session. Never rejects.
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
