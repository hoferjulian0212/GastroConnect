// Authentication HTTP endpoints for the org/member layer.
// Login, logout, and password management are now handled by Clerk.
// This file retains: current-session lookup (/api/auth/me) and the
// teammate invite endpoint (sends the invited member to /sign-up).
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import type { Member, User } from "@shared/schema";
import { can } from "@shared/permissions";
import { generateToken, hashToken, INVITE_TTL_MS } from "./tokens";
import { requireAuth } from "./middleware";
import { sendEmail, renderNotificationEmail, isEmailConfigured } from "../emailService";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Zu viele Versuche. Bitte versuchen Sie es später erneut." },
  validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
});

function sanitizeMember(m: Member) {
  const { passwordHash, ...rest } = m;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

function clientIp(req: Request): string {
  return (req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()) || req.ip || "unknown";
}

function logAuthEvent(event: string, req: Request, extra: Record<string, unknown> = {}) {
  console.log(`[auth] ${event}`, JSON.stringify({ ip: clientIp(req), ...extra }));
}

export function registerAuthRoutes(app: Express) {
  // ── Current session ───────────────────────────────────────────────────────
  // Auth is now Clerk-based; member + org are resolved by loadAuth middleware
  // from the Clerk session. This endpoint surfaces the result to the client.
  app.get("/api/auth/me", (req, res) => {
    if (!req.auth) return res.json({ authenticated: false });
    res.json({
      authenticated: true,
      member: sanitizeMember(req.auth.member),
      org: req.auth.org,
    });
  });

  // ── Invite a teammate ──────────────────────────────────────────────────────
  // Creates an invitation record and emails the new member a link to /sign-up
  // so they can create a Clerk account with their invited email address.
  app.post("/api/members/:id/invite", requireAuth, async (req, res) => {
    try {
      const target = await storage.getMember(String(req.params.id));
      if (!target) return res.status(404).json({ error: "not_found", message: "Mitglied nicht gefunden." });
      if (req.auth!.organizationId !== target.organizationId || !can(req.auth!.role, "team.manage")) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
      }
      if (!target.email) {
        return res.status(400).json({ error: "no_email", message: "Für dieses Mitglied ist keine E-Mail hinterlegt." });
      }
      const { raw, hash } = generateToken();
      await storage.deleteInvitationsForMember(target.id);
      await storage.createInvitation({
        memberId: target.id,
        tokenHash: hash,
        invitedByMemberId: req.auth!.memberId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      let emailed = false;
      if (isEmailConfigured()) {
        emailed = await sendEmail({
          to: target.email,
          subject: "GastroConnect: Einladung zum Team",
          html: renderNotificationEmail({
            title: "Sie wurden zu GastroConnect eingeladen",
            message: `Hallo ${target.name},\n\nSie wurden zum Team von ${req.auth!.org.companyName ?? req.auth!.org.name} eingeladen. Erstellen Sie Ihr Konto, um loszulegen.`,
            linkPath: `/sign-up`,
          }),
        });
      }
      logAuthEvent("invite.sent", req, { memberId: target.id, emailed });
      res.json({ ok: true, emailed });
    } catch (error) {
      console.error("[auth] invite error", error);
      res.status(500).json({ error: "server_error", message: "Einladung fehlgeschlagen." });
    }
  });

  // ── Claim: inspect an invite token (kept for backwards compat with old links) ──
  // Old claim links in already-sent emails redirect users to /sign-up.
  app.get("/api/auth/claim", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) return res.status(400).json({ error: "invalid_token", message: "Ungültiger Link." });
    const invite = await storage.getInvitationByTokenHash(hashToken(token));
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "invalid_token", message: "Die Einladung ist ungültig oder abgelaufen." });
    }
    const member = await storage.getMember(invite.memberId);
    if (!member) return res.status(400).json({ error: "invalid_token", message: "Die Einladung ist ungültig oder abgelaufen." });
    const org = await storage.getUser(member.organizationId);
    res.json({ email: member.email, name: member.name, orgName: org?.companyName ?? org?.name ?? null });
  });
}
