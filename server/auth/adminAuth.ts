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
import { updateErrorLogStatusSchema } from "@shared/schema";

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

// Demo warehouse-worker login for the "Frische Produkte" supplier (owner: Hans
// Müller). Seeded team members have no password and therefore cannot log in, so
// this provisions one real, working login with the restricted `warehouse` role
// to let us inspect the warehouse dashboard. Idempotent — runs on every startup
// AFTER seeding, re-creating the member and resetting its password so it always
// works even after a reseed.
//
// SECURITY: this is a development-only convenience and is a known, fixed
// credential. It must NEVER exist in a deployed app or it would be a standing
// backdoor that breaks the invite-only trust model. It is therefore gated to
// non-production and refuses to touch an account that belongs to another org.
export const DEMO_WAREHOUSE_EMAIL = "lager@frische-produkte.de";
export const DEMO_WAREHOUSE_PASSWORD = "Lager2026Demo";

/**
 * Ensures a demo/bootstrap member has an accepted invitation so they pass the
 * `resolveClerkAuth` invitation gate. Idempotent — no-ops when one already
 * exists. Only called from dev-only bootstrap functions (all guarded by the
 * `NODE_ENV !== 'production'` check in their respective callers).
 */
async function ensureDemoInvitationAccepted(memberId: string): Promise<void> {
  const existing = await storage.getAcceptedInvitationByMemberId(memberId);
  if (existing) return; // already on-boarded, nothing to do
  const { hash } = generateToken();
  const inv = await storage.createInvitation({
    memberId,
    tokenHash: hash,
    invitedByMemberId: null,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  });
  await storage.markInvitationAccepted(inv.id);
}

export async function bootstrapDemoWarehouseMember(): Promise<void> {
  // Hard production guard — never provision known credentials in prod.
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const HANS_ORG_EMAIL = "hans@frische-produkte.de";
  const DEMO_NAME = "Lukas Lager";
  try {
    const org = await storage.getUserByEmail(HANS_ORG_EMAIL);
    if (!org || org.role !== "supplier") {
      console.log("[demo] warehouse member skipped — Frische Produkte org not found.");
      return;
    }
    const passwordHash = await hashPassword(DEMO_WAREHOUSE_PASSWORD);
    const existing = await storage.getMemberByEmail(DEMO_WAREHOUSE_EMAIL);
    if (existing) {
      // Never silently migrate/hijack an account that belongs to a different
      // org — if the demo email collides with a real member elsewhere, abort.
      if (existing.organizationId !== org.id) {
        console.error(
          `[demo] warehouse member skipped — ${DEMO_WAREHOUSE_EMAIL} already belongs to another org; refusing to reassign.`,
        );
        return;
      }
      await storage.updateMember(existing.id, {
        name: DEMO_NAME,
        role: "warehouse",
      });
      await storage.updateMemberAuth(existing.id, { passwordHash, emailVerifiedAt: new Date() });
      await ensureDemoInvitationAccepted(existing.id);
      console.log(`[demo] warehouse member updated (${DEMO_WAREHOUSE_EMAIL}).`);
    } else {
      const member = await storage.createMember({
        organizationId: org.id,
        name: DEMO_NAME,
        email: DEMO_WAREHOUSE_EMAIL,
        role: "warehouse",
      });
      await storage.updateMemberAuth(member.id, { passwordHash, emailVerifiedAt: new Date() });
      await ensureDemoInvitationAccepted(member.id);
      console.log(`[demo] warehouse member created (${DEMO_WAREHOUSE_EMAIL}).`);
    }
  } catch (err) {
    console.error("[demo] warehouse member bootstrap error:", err);
  }
}

// Demo driver ("Fahrer") logins for Hans's supplier org — same pattern and the
// same hard production guard as the demo warehouse member above. Two drivers so
// the office assignment picker and the live-map overview have real choices.
export const DEMO_DRIVER_EMAIL = "fahrer@frische-produkte.de";
export const DEMO_DRIVER_PASSWORD = "Fahrer2026Demo";

export async function bootstrapDemoDriverMembers(): Promise<void> {
  // Hard production guard — never provision known credentials in prod.
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const HANS_ORG_EMAIL = "hans@frische-produkte.de";
  const drivers = [
    { email: DEMO_DRIVER_EMAIL, name: "Markus Brunner" },
    { email: "fahrer2@frische-produkte.de", name: "Stefan Oberhofer" },
  ];
  try {
    const org = await storage.getUserByEmail(HANS_ORG_EMAIL);
    if (!org || org.role !== "supplier") {
      console.log("[demo] driver members skipped — Frische Produkte org not found.");
      return;
    }
    const passwordHash = await hashPassword(DEMO_DRIVER_PASSWORD);
    for (const d of drivers) {
      const existing = await storage.getMemberByEmail(d.email);
      if (existing) {
        if (existing.organizationId !== org.id) {
          console.error(`[demo] driver member skipped — ${d.email} already belongs to another org; refusing to reassign.`);
          continue;
        }
        await storage.updateMember(existing.id, { name: d.name, role: "driver" });
        await storage.updateMemberAuth(existing.id, { passwordHash, emailVerifiedAt: new Date() });
        await ensureDemoInvitationAccepted(existing.id);
      } else {
        const member = await storage.createMember({
          organizationId: org.id,
          name: d.name,
          email: d.email,
          role: "driver",
        });
        await storage.updateMemberAuth(member.id, { passwordHash, emailVerifiedAt: new Date() });
        await ensureDemoInvitationAccepted(member.id);
      }
    }
    console.log(`[demo] driver members ready (${drivers.map((d) => d.email).join(", ")}).`);
  } catch (err) {
    console.error("[demo] driver member bootstrap error:", err);
  }
}

// Demo logins for every team role — gives one seeded member per role a fixed,
// known password so each role's view can be tested without the invite/claim
// flow. Same pattern and the same hard production guard as the demo warehouse
// member above. Unlike that bootstrap, these members already exist from the
// seed — we only set their password and never change name/role/org here.
export const DEMO_ROLE_LOGINS: ReadonlyArray<{
  email: string;
  password: string;
  role: string;
  orgEmail: string;
}> = [
  // Restaurant "Gasthof Alpenblick"
  { email: "klaus@gasthof-alpenblick.de", password: "Admin2026Demo", role: "admin", orgEmail: "klaus@gasthof-alpenblick.de" },
  { email: "sepp@gasthof-alpenblick.de", password: "Manager2026Demo", role: "manager", orgEmail: "klaus@gasthof-alpenblick.de" },
  { email: "anita@gasthof-alpenblick.de", password: "Staff2026Demo", role: "staff", orgEmail: "klaus@gasthof-alpenblick.de" },
  // Supplier "Frische Produkte" (has no seeded staff member; warehouse/driver
  // demo logins for this org are provisioned by the bootstraps above)
  { email: "hans@frische-produkte.de", password: "Admin2026Demo", role: "admin", orgEmail: "hans@frische-produkte.de" },
  { email: "sabine@frische-produkte.de", password: "Manager2026Demo", role: "manager", orgEmail: "hans@frische-produkte.de" },
  { email: "markus@frische-produkte.de", password: "Vertreter2026Demo", role: "vertreter", orgEmail: "hans@frische-produkte.de" },
];

export async function bootstrapDemoRoleMembers(): Promise<void> {
  // Hard production guard — never provision known credentials in prod.
  if (process.env.NODE_ENV === "production") {
    return;
  }
  try {
    const ready: string[] = [];
    for (const login of DEMO_ROLE_LOGINS) {
      const member = await storage.getMemberByEmail(login.email);
      if (!member) {
        console.log(`[demo] role login skipped — ${login.email} not found (seed missing?).`);
        continue;
      }
      if (member.role !== login.role) {
        console.error(
          `[demo] role login skipped — ${login.email} has role "${member.role}", expected "${login.role}"; refusing to touch.`,
        );
        continue;
      }
      // Never reset the password of a member that belongs to a different org
      // than the expected seeded one (mirrors the warehouse/driver guards).
      const org = await storage.getUserByEmail(login.orgEmail);
      if (!org || member.organizationId !== org.id) {
        console.error(
          `[demo] role login skipped — ${login.email} does not belong to the expected demo org; refusing to touch.`,
        );
        continue;
      }
      const passwordHash = await hashPassword(login.password);
      await storage.updateMemberAuth(member.id, { passwordHash, emailVerifiedAt: new Date() });
      await ensureDemoInvitationAccepted(member.id);
      ready.push(login.email);
    }
    if (ready.length) {
      console.log(`[demo] role logins ready (${ready.join(", ")}).`);
    }
  } catch (err) {
    console.error("[demo] role login bootstrap error:", err);
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
            message: `Hallo ${adminName},\n\nfür ${companyName} wurde ein Konto bei GastroConnect erstellt. Erstellen Sie jetzt Ihr Konto, um loszulegen.`,
            linkPath: `/sign-up`,
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

  // ── Platform analytics: overview KPIs ─────────────────────────────────────
  app.get("/api/admin/stats/overview", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getPlatformOverview());
    } catch (err) {
      console.error("[admin] stats overview error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform analytics: 6-month time series ───────────────────────────────
  app.get("/api/admin/stats/timeseries", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getPlatformTimeSeries());
    } catch (err) {
      console.error("[admin] stats timeseries error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform analytics: health summary (action items) ─────────────────────
  app.get("/api/admin/stats/health", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getPlatformHealth());
    } catch (err) {
      console.error("[admin] stats health error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform analytics: recent activity feed ──────────────────────────────
  app.get("/api/admin/stats/activity", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getPlatformRecentActivity(12));
    } catch (err) {
      console.error("[admin] stats activity error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform analytics: top organizations ─────────────────────────────────
  app.get("/api/admin/stats/top-orgs", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getTopOrganizations());
    } catch (err) {
      console.error("[admin] stats top-orgs error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform analytics: open complaints across all orgs ───────────────────
  app.get("/api/admin/complaints", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAdminOpenComplaints());
    } catch (err) {
      console.error("[admin] complaints list error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform analytics: low-stock products across all suppliers ───────────
  app.get("/api/admin/low-stock", requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAdminLowStockProducts());
    } catch (err) {
      console.error("[admin] low-stock list error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── List all organizations (enriched with activity metrics) ───────────────
  app.get("/api/admin/orgs", requirePlatformAdmin, async (req, res) => {
    try {
      const orgs = await storage.getAllOrgsWithStats();
      res.json(orgs);
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Per-organization statistics ───────────────────────────────────────────
  app.get("/api/admin/orgs/:id/stats", requirePlatformAdmin, async (req, res) => {
    try {
      const stats = await storage.getAdminOrgStats(String(req.params.id));
      if (!stats) return res.status(404).json({ error: "not_found" });
      res.json(stats);
    } catch (err) {
      console.error("[admin] org stats error", err);
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

  // ── Verify / unverify a single member of an organisation ──────────────────
  app.patch("/api/admin/orgs/:id/members/:memberId/verify", requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = String(req.params.id);
      const memberId = String(req.params.memberId);
      const verified = req.body?.verified !== false; // default true
      const org = await storage.getUser(orgId);
      if (!org) return res.status(404).json({ error: "not_found" });
      const updated = await storage.setMemberVerified(memberId, orgId, verified);
      if (!updated) return res.status(404).json({ error: "member_not_found" });
      const adminName = req.platformAdmin?.admin.name ?? "admin";
      console.log(`[admin] member.${verified ? "verified" : "unverified"} memberId=${memberId} orgId=${orgId} by=${adminName} ip=${req.ip}`);
      res.json(updated);
    } catch (err) {
      console.error("[admin] member verify error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Org notes: list / create / delete ────────────────────────────────────
  app.get("/api/admin/orgs/:id/notes", requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = String(req.params.id);
      const org = await storage.getUser(orgId);
      if (!org) return res.status(404).json({ error: "not_found" });
      res.json(await storage.getOrgNotes(orgId));
    } catch (err) {
      console.error("[admin] org notes list error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/orgs/:id/notes", requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = String(req.params.id);
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!body) return res.status(400).json({ error: "empty_note" });
      if (body.length > 5000) return res.status(400).json({ error: "note_too_long" });
      const org = await storage.getUser(orgId);
      if (!org) return res.status(404).json({ error: "not_found" });
      const adminName = req.platformAdmin?.admin.name ?? "Admin";
      const adminId = req.platformAdmin?.adminId ?? null;
      const note = await storage.createOrgNote({
        organizationId: orgId,
        authorAdminId: adminId,
        authorName: adminName,
        body,
      });
      res.status(201).json(note);
    } catch (err) {
      console.error("[admin] org note create error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.delete("/api/admin/orgs/:id/notes/:noteId", requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = String(req.params.id);
      const noteId = String(req.params.noteId);
      await storage.deleteOrgNote(noteId, orgId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin] org note delete error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Platform error logs: list / clear ────────────────────────────────────
  app.get("/api/admin/error-logs", requirePlatformAdmin, async (req, res) => {
    try {
      const level = typeof req.query.level === "string" ? req.query.level : undefined;
      const source = typeof req.query.source === "string" ? req.query.source : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(await storage.getErrorLogs({ level, source, status, limit }));
    } catch (err) {
      console.error("[admin] error-logs list error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Update a single log's workflow status (new | in_progress | closed).
  app.patch("/api/admin/error-logs/:id", requirePlatformAdmin, async (req, res) => {
    try {
      const parsed = updateErrorLogStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_status" });
      }
      await storage.updateErrorLogStatus(String(req.params.id), parsed.data.status);
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin] error-logs status update error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // Bulk-close: mark every non-closed log as closed (checked / complete).
  app.post("/api/admin/error-logs/close-all", requirePlatformAdmin, async (req, res) => {
    try {
      const count = await storage.closeAllErrorLogs();
      const adminName = req.platformAdmin?.admin.name ?? "admin";
      console.log(`[admin] error-logs.close-all count=${count} by=${adminName} ip=${req.ip}`);
      res.json({ ok: true, count });
    } catch (err) {
      console.error("[admin] error-logs close-all error", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.delete("/api/admin/error-logs", requirePlatformAdmin, async (req, res) => {
    try {
      await storage.clearErrorLogs();
      const adminName = req.platformAdmin?.admin.name ?? "admin";
      console.log(`[admin] error-logs.cleared by=${adminName} ip=${req.ip}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin] error-logs clear error", err);
      res.status(500).json({ error: "server_error" });
    }
  });
}
