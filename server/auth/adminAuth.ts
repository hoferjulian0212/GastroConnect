// Platform-admin authentication via Replit OIDC and admin panel API routes.
// These are strictly for the two GastroConnect system owners — completely
// separate from the org-level member/role system.
import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requirePlatformAdmin, loadAdminAuth } from "./middleware";
import { sendEmail, renderNotificationEmail } from "../emailService";
import type { PlatformAdmin } from "@shared/schema";

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
});

// Usernames in this env var are auto-approved on first Replit login.
function getAutoApprovedUsernames(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_REPLIT_USERNAMES ?? "";
  const names = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return new Set(names);
}

export function isReplitOauthConfigured(): boolean {
  return Boolean(process.env.REPLIT_CLIENT_ID && process.env.REPLIT_CLIENT_SECRET);
}

// Cache the OIDC discovery document so we only fetch it once per process.
let oidcDiscovery: { authorization_endpoint: string; token_endpoint: string } | null = null;
async function getOidcDiscovery(): Promise<{ authorization_endpoint: string; token_endpoint: string } | null> {
  if (oidcDiscovery) return oidcDiscovery;
  try {
    const resp = await fetch("https://replit.com/oidc/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const doc = await resp.json() as { authorization_endpoint?: string; token_endpoint?: string };
    if (!doc.authorization_endpoint || !doc.token_endpoint) return null;
    oidcDiscovery = { authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint };
    return oidcDiscovery;
  } catch (err) {
    console.error("[admin] OIDC discovery failed:", err);
    return null;
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function callbackUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"]?.toString().split(",")[0]) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"]?.toString() || req.headers.host || "";
  return `${proto}://${host}/api/admin/auth/callback`;
}

function fail(res: Response, code: string, to = "/admin/login") {
  res.redirect(`${to}?error=${encodeURIComponent(code)}`);
}

async function establishAdminSession(req: Request, adminId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.adminId = adminId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

async function sendApprovalRequestEmails(newAdmin: PlatformAdmin): Promise<void> {
  const approvedAdmins = await storage.getApprovedPlatformAdmins();
  for (const admin of approvedAdmins) {
    if (!admin.email) continue;
    await sendEmail({
      to: admin.email,
      subject: "GastroConnect Admin: Neuer Zugriffsantrag",
      html: renderNotificationEmail({
        title: "Neuer Platform-Admin-Antrag",
        message: `${newAdmin.name} (@${newAdmin.replitUsername}) möchte als Platform-Admin zugelassen werden.\n\nBitte melden Sie sich im Admin-Panel an, um den Antrag zu genehmigen oder abzulehnen.`,
        linkPath: "/admin/admins",
      }),
    });
  }
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
  // Log configured auto-approved username count at startup for audit visibility.
  const autoApprovedNames = getAutoApprovedUsernames();
  console.log(`[admin] auto-approved Replit usernames configured: ${autoApprovedNames.size}`);

  // Apply loadAdminAuth to all /api/admin/* routes so req.platformAdmin is set.
  app.use("/api/admin", loadAdminAuth);

  // ── Replit OIDC: start ─────────────────────────────────────────────────────
  app.get("/api/admin/auth/start", adminLimiter, async (req, res) => {
    if (!isReplitOauthConfigured()) return fail(res, "oauth_unavailable");
    const discovery = await getOidcDiscovery();
    if (!discovery) return fail(res, "oauth_unavailable");

    const state = randomBytes(24).toString("base64url");
    req.session.adminOauthState = state;
    req.session.save((err) => {
      if (err) {
        console.error("[admin] oauth state save failed", err);
        return fail(res, "oauth_failed");
      }
      const params = new URLSearchParams({
        client_id: process.env.REPLIT_CLIENT_ID!,
        redirect_uri: callbackUrl(req),
        response_type: "code",
        scope: "openid profile email",
        state,
        prompt: "select_account",
      });
      res.redirect(`${discovery.authorization_endpoint}?${params.toString()}`);
    });
  });

  // ── Replit OIDC: callback ──────────────────────────────────────────────────
  app.get("/api/admin/auth/callback", adminLimiter, async (req, res) => {
    try {
      if (!isReplitOauthConfigured()) return fail(res, "oauth_unavailable");
      if (req.query.error) return fail(res, "oauth_denied");

      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const expectedState = req.session.adminOauthState;
      req.session.adminOauthState = undefined;
      if (!code || !state || !expectedState || state !== expectedState) {
        return fail(res, "oauth_state");
      }

      const discovery = await getOidcDiscovery();
      if (!discovery) return fail(res, "oauth_unavailable");

      const tokenResp = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.REPLIT_CLIENT_ID!,
          client_secret: process.env.REPLIT_CLIENT_SECRET!,
          redirect_uri: callbackUrl(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResp.ok) {
        console.error("[admin] replit token exchange failed", tokenResp.status, await tokenResp.text());
        return fail(res, "oauth_failed");
      }
      const tokens = (await tokenResp.json()) as { id_token?: string };
      const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
      const replitUserId = claims?.sub as string | undefined;
      const replitUsername = (claims?.preferred_username ?? claims?.username ?? claims?.name ?? "") as string;
      const name = (claims?.name ?? replitUsername) as string;
      const email = (claims?.email as string | undefined)?.toLowerCase();
      if (!replitUserId || !replitUsername) return fail(res, "oauth_failed");

      const autoApproved = getAutoApprovedUsernames();
      const isAutoApproved = autoApproved.has(replitUsername.toLowerCase());

      // Look up existing admin record.
      let admin = await storage.getPlatformAdminByReplitUserId(replitUserId);

      if (!admin) {
        // First login — create record.
        const status = isAutoApproved ? "approved" : "pending";
        // approvedBy stores the approver's replitUserId for audit integrity.
        // The sentinel "auto" marks username-allowlist auto-approval.
        admin = await storage.createPlatformAdmin({
          replitUserId,
          replitUsername,
          name: name || replitUsername,
          email: email ?? null,
          status,
          approvedBy: isAutoApproved ? "auto" : null,
          approvedAt: isAutoApproved ? new Date() : null,
          lastLoginAt: new Date(),
        });
        console.log(`[admin] new admin registered: @${replitUsername} status=${status}`);
        if (isAutoApproved) {
          await establishAdminSession(req, admin.id);
          return res.redirect("/admin");
        }
        // Send approval request to existing approved admins (fire-and-forget).
        sendApprovalRequestEmails(admin).catch(err =>
          console.error("[admin] approval request email failed:", err)
        );
        return res.redirect("/admin/login?status=pending");
      }

      // Existing record — update login time + sync username/email in case they changed.
      await storage.updatePlatformAdmin(admin.id, {
        replitUsername,
        name: name || replitUsername,
        email: email ?? admin.email,
        lastLoginAt: new Date(),
        // Auto-approve if username is now in the allow-list (e.g. added after first login).
        ...(isAutoApproved && admin.status === "pending" ? {
          status: "approved",
          approvedBy: "auto",
          approvedAt: new Date(),
        } : {}),
      });
      admin = (await storage.getPlatformAdmin(admin.id))!;

      if (admin.status === "denied") {
        return res.redirect("/admin/login?status=denied");
      }
      if (admin.status === "pending") {
        return res.redirect("/admin/login?status=pending");
      }
      // Approved — establish session.
      await establishAdminSession(req, admin.id);
      console.log(`[admin] login: @${replitUsername}`);
      res.redirect("/admin");
    } catch (err) {
      console.error("[admin] callback error:", err);
      fail(res, "oauth_failed");
    }
  });

  // ── Current admin session ─────────────────────────────────────────────────
  app.get("/api/admin/auth/me", (req, res) => {
    const configured = isReplitOauthConfigured();
    if (!req.platformAdmin) return res.json({ authenticated: false, configured });
    res.json({ authenticated: true, admin: req.platformAdmin.admin, configured });
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
      req.session.impersonatedMemberId = member.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ error: "session_error" });
        console.log(`[admin] impersonate start: admin=${req.platformAdmin!.admin.replitUsername} member=${member.id}`);
        res.json({ ok: true, memberId: member.id });
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
      res.json(admins);
    } catch (err) {
      res.status(500).json({ error: "server_error" });
    }
  });

  // ── Approve a pending admin ───────────────────────────────────────────────
  app.post("/api/admin/admins/:id/approve", requirePlatformAdmin, async (req, res) => {
    try {
      const target = await storage.getPlatformAdmin(String(req.params.id));
      if (!target) return res.status(404).json({ error: "not_found" });
      if (target.status === "approved") return res.json(target);
      const updated = await storage.updatePlatformAdmin(target.id, {
        status: "approved",
        approvedBy: req.platformAdmin!.admin.replitUserId,
        approvedAt: new Date(),
      });
      sendApprovalConfirmationEmail(updated!).catch(err =>
        console.error("[admin] approval confirmation email failed:", err)
      );
      console.log(`[admin] approve: admin=${req.platformAdmin!.admin.replitUsername} target=${target.replitUsername}`);
      res.json(updated);
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
      res.json(updated);
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
      res.json(updated);
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
}
