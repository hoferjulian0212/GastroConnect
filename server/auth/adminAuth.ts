// Platform-admin authentication (email + password) and admin panel API routes.
// These are strictly for the GastroConnect system owners — completely separate
// from the org-level member/role system.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requirePlatformAdmin, loadAdminAuth } from "./middleware";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "./passwords";
import { generateToken, INVITE_TTL_MS } from "./tokens";
import { sendEmail, renderNotificationEmail, isEmailConfigured } from "../emailService";
import type { PlatformAdmin } from "@shared/schema";

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
});

// Bootstrap the owner platform-admin from configuration. Idempotent — run on
// every startup after the table migration. When PLATFORM_ADMIN_EMAIL and
// PLATFORM_ADMIN_PASSWORD are set, the matching admin is created (or its
// password reset) and marked approved. Changing the secret resets the password.
export async function bootstrapPlatformAdmin(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[admin] bootstrap skipped — set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD to provision the owner admin.");
    return;
  }
  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    console.error(`[admin] bootstrap failed — PLATFORM_ADMIN_PASSWORD too weak: ${policyError}`);
    return;
  }
  try {
    const passwordHash = await hashPassword(password);
    const name = process.env.PLATFORM_ADMIN_NAME?.trim() || "Owner";
    const existing = await storage.getPlatformAdminByEmail(email);
    if (existing) {
      await storage.updatePlatformAdmin(existing.id, {
        passwordHash,
        status: "approved",
        approvedBy: existing.approvedBy ?? "bootstrap",
        approvedAt: existing.approvedAt ?? new Date(),
      });
      console.log(`[admin] bootstrap: owner admin updated (${email}).`);
    } else {
      await storage.createPlatformAdmin({
        email,
        name,
        passwordHash,
        status: "approved",
        approvedBy: "bootstrap",
        approvedAt: new Date(),
      });
      console.log(`[admin] bootstrap: owner admin created (${email}).`);
    }
  } catch (err) {
    console.error("[admin] bootstrap error:", err);
  }
}

// Strip sensitive fields (password hash) before returning a platform-admin row
// to any client. Never send the bcrypt hash over the wire or into response logs.
function sanitizePlatformAdmin<T extends { passwordHash?: string | null }>(
  admin: T,
): Omit<T, "passwordHash"> {
  const { passwordHash: _omit, ...safe } = admin;
  return safe;
}

// Rotate the session ID on privileged admin-login (prevents session fixation).
// Any existing member session (memberId) is captured before regeneration and
// written back so an admin who is also a member stays logged into the app.
async function establishAdminSession(req: Request, adminId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingMemberId = req.session.memberId;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.adminId = adminId;
      if (existingMemberId) req.session.memberId = existingMemberId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

async function sendApprovalConfirmationEmail(admin: PlatformAdmin): Promise<void> {
  if (!admin.email) return;
  await sendEmail({
    to: admin.email,
    subject: "GastroConnect Admin: Ihr Zugriff wurde genehmigt",
    html: renderNotificationEmail({
      title: "Ihr Admin-Zugriff wurde genehmigt",
      message: `Hallo ${admin.name},\n\nIhr Antrag als Platform-Admin bei GastroConnect wurde genehmigt. Sie können sich jetzt im Admin-Panel anmelden.`,
      linkPath: "/admin/login",
    }),
  });
}

export function registerAdminAuthRoutes(app: Express) {
  // Apply loadAdminAuth to all /api/admin/* routes so req.platformAdmin is set.
  app.use("/api/admin", loadAdminAuth);

  // ── Email + password login ─────────────────────────────────────────────────
  app.post("/api/admin/auth/login", adminLimiter, async (req, res) => {
    try {
      const { email, password } = z
        .object({ email: z.string().email(), password: z.string().min(1).max(256) })
        .parse(req.body);
      const normalizedEmail = email.toLowerCase();
      const admin = await storage.getPlatformAdminByEmail(normalizedEmail);
      if (!admin || !admin.passwordHash || !(await verifyPassword(password, admin.passwordHash))) {
        console.log(`[admin] login.failed ${normalizedEmail} ip=${req.ip}`);
        return res.status(401).json({ error: "invalid_credentials", message: "E-Mail oder Passwort ist falsch." });
      }
      if (admin.status !== "approved") {
        console.log(`[admin] login.not_approved ${normalizedEmail} status=${admin.status}`);
        return res.status(403).json({ error: "not_approved", message: "Dieses Admin-Konto ist nicht freigegeben." });
      }
      await establishAdminSession(req, admin.id);
      await storage.updatePlatformAdmin(admin.id, { lastLoginAt: new Date() });
      console.log(`[admin] login: ${normalizedEmail} ip=${req.ip}`);
      res.json({ authenticated: true, admin: sanitizePlatformAdmin(admin) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[admin] login error:", err);
      res.status(500).json({ error: "server_error", message: "Anmeldung fehlgeschlagen." });
    }
  });

  // ── Create a new business (invite-only onboarding) ─────────────────────────
  // Creates a pending organization + its first admin member (no password yet)
  // and emails that admin a claim link to set their password. Claiming the
  // account also verifies (activates) the organization.
  app.post("/api/admin/orgs", requirePlatformAdmin, async (req, res) => {
    try {
      const { role, companyName, adminName, adminEmail, language } = z
        .object({
          role: z.enum(["restaurant", "supplier"]),
          companyName: z.string().trim().min(2).max(160),
          adminName: z.string().trim().min(2).max(160),
          adminEmail: z.string().email().max(256),
          language: z.enum(["de", "it", "en"]).optional(),
        })
        .parse(req.body);

      const email = adminEmail.trim().toLowerCase();
      const [existingMember, existingOrg] = await Promise.all([
        storage.getMemberByEmail(email),
        storage.getUserByEmail(email),
      ]);
      if (existingMember || existingOrg) {
        return res.status(409).json({ error: "email_taken", message: "Für diese E-Mail-Adresse besteht bereits ein Konto." });
      }

      const { org, member } = await storage.createBusinessWithAdmin({
        org: { role, name: companyName, companyName, email, language: language ?? "de" },
        admin: { name: adminName, email, role: "admin" },
      });

      const { raw, hash } = generateToken();
      await storage.createInvitation({
        memberId: member.id,
        tokenHash: hash,
        invitedByMemberId: null,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });

      let emailed = false;
      if (isEmailConfigured()) {
        emailed = await sendEmail({
          to: email,
          subject: "GastroConnect: Konto aktivieren",
          html: renderNotificationEmail({
            title: "Willkommen bei GastroConnect",
            message: `Hallo ${adminName},\n\nfür ${companyName} wurde ein Konto bei GastroConnect erstellt. Aktivieren Sie es, indem Sie ein Passwort festlegen. Der Link ist 7 Tage gültig.`,
            linkPath: `/auth/claim?token=${raw}`,
          }),
        });
      }
      const actor = req.platformAdmin!.admin.email ?? req.platformAdmin!.admin.name;
      console.log(`[admin] org.created name=${companyName} role=${role} by=${actor} emailed=${emailed} ip=${req.ip}`);
      res.json({ ok: true, orgId: org.id, emailed });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[admin] create org error:", err);
      res.status(500).json({ error: "server_error", message: "Erstellung fehlgeschlagen." });
    }
  });

  // ── Current admin session ─────────────────────────────────────────────────
  app.get("/api/admin/auth/me", (req, res) => {
    if (!req.platformAdmin) return res.json({ authenticated: false });
    res.json({ authenticated: true, admin: sanitizePlatformAdmin(req.platformAdmin.admin) });
  });

  // ── Admin logout ──────────────────────────────────────────────────────────
  app.post("/api/admin/auth/logout", (req, res) => {
    req.session.adminId = undefined;
    req.session.impersonatedMemberId = undefined;
    req.session.save(() => res.json({ ok: true }));
  });

  // ── Impersonation status (lightweight, polled by the banner) ──────────────
  app.get("/api/admin/impersonation-status", (req, res) => {
    const impersonatedId = req.session?.impersonatedMemberId;
    const adminId = req.session?.adminId;
    if (!impersonatedId || !adminId) {
      return res.json({ impersonating: false });
    }
    // Resolve the impersonated member asynchronously.
    storage.getMember(impersonatedId).then(async (member) => {
      if (!member) return res.json({ impersonating: false });
      const org = await storage.getUser(member.organizationId);
      res.json({
        impersonating: true,
        memberId: member.id,
        memberName: member.name,
        orgName: org?.companyName ?? org?.name ?? "Unknown",
        orgRole: org?.role,
      });
    }).catch(() => res.json({ impersonating: false }));
  });

  // ── Start impersonation ───────────────────────────────────────────────────
  // Invariant: impersonated sessions cannot impersonate further. An admin
  // must exit the current impersonation before starting a new one.
  app.post("/api/admin/impersonate/:memberId", requirePlatformAdmin, async (req, res) => {
    try {
      if (req.session.impersonatedMemberId) {
        return res.status(409).json({
          error: "already_impersonating",
          message: "Beenden Sie die aktuelle Impersonierung bevor Sie eine neue starten.",
        });
      }
      const member = await storage.getMember(String(req.params.memberId));
      if (!member) return res.status(404).json({ error: "not_found" });
      const org = await storage.getUser(member.organizationId);
      if (!org) return res.status(404).json({ error: "org_not_found" });
      req.session.impersonatedMemberId = member.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ error: "session_error" });
        console.log(`[admin] impersonate start: admin=${req.platformAdmin!.admin.replitUsername} member=${member.id} orgRole=${org.role}`);
        res.json({ ok: true, memberId: member.id, orgRole: org.role });
      });
    } catch (err) {
      console.error("[admin] impersonate error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Exit impersonation ────────────────────────────────────────────────────
  app.post("/api/admin/impersonate/exit", (req, res) => {
    const prev = req.session.impersonatedMemberId;
    req.session.impersonatedMemberId = undefined;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "session_error" });
      console.log(`[admin] impersonate exit: adminId=${req.session.adminId} prevMember=${prev}`);
      res.json({ ok: true });
    });
  });

  // ── List all platform admins ──────────────────────────────────────────────
  app.get("/api/admin/admins", requirePlatformAdmin, async (req, res) => {
    try {
      const admins = await storage.getPlatformAdmins();
      res.json(admins.map(sanitizePlatformAdmin));
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Approve a pending admin ───────────────────────────────────────────────
  app.post("/api/admin/admins/:id/approve", requirePlatformAdmin, async (req, res) => {
    try {
      const target = await storage.getPlatformAdmin(String(req.params.id));
      if (!target) return res.status(404).json({ error: "not_found" });
      if (target.status === "approved") return res.json(sanitizePlatformAdmin(target));
      const updated = await storage.updatePlatformAdmin(target.id, {
        status: "approved",
        approvedBy: req.platformAdmin!.admin.replitUserId,
        approvedAt: new Date(),
      });
      sendApprovalConfirmationEmail(updated!).catch(err =>
        console.error("[admin] approval confirmation email failed:", err)
      );
      console.log(`[admin] approve: admin=${req.platformAdmin!.admin.replitUsername} target=${target.replitUsername}`);
      res.json(sanitizePlatformAdmin(updated!));
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Deny a pending admin ──────────────────────────────────────────────────
  app.post("/api/admin/admins/:id/deny", requirePlatformAdmin, async (req, res) => {
    try {
      const target = await storage.getPlatformAdmin(String(req.params.id));
      if (!target) return res.status(404).json({ error: "not_found" });
      // Prevent self-denial.
      if (target.id === req.platformAdmin!.adminId) {
        return res.status(400).json({ error: "cannot_self_deny" });
      }
      const updated = await storage.updatePlatformAdmin(target.id, { status: "denied" });
      console.log(`[admin] deny: admin=${req.platformAdmin!.admin.replitUsername} target=${target.replitUsername}`);
      res.json(sanitizePlatformAdmin(updated!));
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Revoke an approved admin ──────────────────────────────────────────────
  app.post("/api/admin/admins/:id/revoke", requirePlatformAdmin, async (req, res) => {
    try {
      const target = await storage.getPlatformAdmin(String(req.params.id));
      if (!target) return res.status(404).json({ error: "not_found" });
      if (target.id === req.platformAdmin!.adminId) {
        return res.status(400).json({ error: "cannot_self_revoke" });
      }
      const updated = await storage.updatePlatformAdmin(target.id, { status: "denied" });
      console.log(`[admin] revoke: admin=${req.platformAdmin!.admin.replitUsername} target=${target.replitUsername}`);
      res.json(sanitizePlatformAdmin(updated!));
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Pending-org count (badge) ─────────────────────────────────────────────
  app.get("/api/admin/orgs/pending-count", requirePlatformAdmin, async (req, res) => {
    try {
      const count = await storage.getPendingOrgCount();
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── List all organizations ────────────────────────────────────────────────
  app.get("/api/admin/orgs", requirePlatformAdmin, async (req, res) => {
    try {
      const orgs = await storage.getAllOrgsWithMemberCount();
      res.json(orgs);
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── List members of an organization ──────────────────────────────────────
  app.get("/api/admin/orgs/:id/members", requirePlatformAdmin, async (req, res) => {
    try {
      const org = await storage.getUser(String(req.params.id));
      if (!org) return res.status(404).json({ error: "not_found" });
      const orgMembers = await storage.getMembers(org.id);
      res.json({ org, members: orgMembers });
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Manually approve (verify) a pending organisation ─────────────────────
  app.patch("/api/admin/orgs/:id/verify", requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = String(req.params.id);
      const org = await storage.getUser(orgId);
      if (!org) return res.status(404).json({ error: "not_found" });
      if (org.verifiedAt) return res.status(409).json({ error: "already_verified" });

      // Verify the org and all its members that have a password but are still unverified.
      await storage.markOrganizationVerified(orgId);
      const orgMembers = await storage.getMembers(orgId);
      await Promise.all(
        orgMembers
          .filter(m => m.passwordHash && !m.emailVerifiedAt)
          .map(m => storage.updateMemberAuth(m.id, { emailVerifiedAt: new Date() }))
      );

      const adminName = req.platformAdmin?.admin.name ?? req.platformAdmin?.admin.replitUsername ?? "admin";
      console.log(`[admin] org.verified orgId=${orgId} by=${adminName} ip=${req.ip}`);

      // Fire-and-forget welcome email — must not block the response or surface a 500.
      if (isEmailConfigured() && org.email) {
        const roleLabel = org.role === "restaurant" ? "Restaurant" : "Lieferant";
        const companyName = org.companyName || org.name;
        sendEmail({
          to: org.email,
          subject: "Ihr GastroConnect-Konto wurde freigeschaltet",
          html: renderNotificationEmail({
            title: "Willkommen bei GastroConnect!",
            message: `Hallo,\n\nIhr ${roleLabel}-Konto für ${companyName} wurde von unserem Team überprüft und freigeschaltet. Sie können sich ab sofort anmelden und GastroConnect in vollem Umfang nutzen.`,
            linkPath: "/auth/login",
          }),
        }).catch(err => console.error("[admin] welcome email failed", err));
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[admin] org verify error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Delete (reject) a pending organisation ───────────────────────────────
  app.delete("/api/admin/orgs/:id", requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = String(req.params.id);
      const org = await storage.getUser(orgId);
      if (!org) return res.status(404).json({ error: "not_found" });
      if (org.verifiedAt) return res.status(409).json({ error: "org_already_verified", message: "Verified organisations cannot be deleted via this endpoint." });

      await storage.deleteOrganizationAndMembers(orgId);
      const adminName = req.platformAdmin?.admin.name ?? req.platformAdmin?.admin.replitUsername ?? "admin";
      console.log(`[admin] org.deleted orgId=${orgId} name=${org.name} by=${adminName} ip=${req.ip}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin] org delete error", err);
      res.status(500).json({ error: "server_error" });
    }
  });
}
