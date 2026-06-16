// Authentication & onboarding HTTP endpoints: email/password login, logout,
// current-session lookup, password reset, and the invite/claim flow. Identity is
// established server-side in the session; the client never supplies it.
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import type { Member, User } from "@shared/schema";
import { can } from "@shared/permissions";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "./passwords";
import { generateToken, hashToken, INVITE_TTL_MS, RESET_TTL_MS, VERIFY_TTL_MS } from "./tokens";
import { requireAuth } from "./middleware";
import { registerOauthRoutes, isGoogleOauthConfigured } from "./oauth";
import { sendEmail, renderNotificationEmail, isEmailConfigured } from "../emailService";

// Strict throttle for credential-guessing surfaces (login, reset request,
// claim/reset confirm). Tighter than the global API limiter.
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

// Regenerates the session (prevents fixation) and binds it to the member.
function establishSession(req: Request, memberId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.memberId = memberId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function destroySession(req: Request, res: Response): Promise<void> {
  return new Promise((resolve) => {
    req.session.destroy(() => {
      res.clearCookie("gc.sid", { path: "/" });
      resolve();
    });
  });
}

export function registerAuthRoutes(app: Express) {
  registerOauthRoutes(app);

  // ── Current session ───────────────────────────────────────────────────────
  app.get("/api/auth/me", (req, res) => {
    const providers = { google: isGoogleOauthConfigured() };
    if (!req.auth) return res.json({ authenticated: false, providers });
    res.json({ authenticated: true, member: sanitizeMember(req.auth.member), org: req.auth.org, providers });
  });

  // ── Email/password login ──────────────────────────────────────────────────
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { email, password } = z
        .object({ email: z.string().email(), password: z.string().min(1).max(256) })
        .parse(req.body);
      const member = await storage.getMemberByEmail(email);
      // Constant-ish behaviour: always reply with the same generic error.
      if (!member || !member.passwordHash || !(await verifyPassword(password, member.passwordHash))) {
        logAuthEvent("login.failed", req, { email: email.toLowerCase() });
        return res.status(401).json({ error: "invalid_credentials", message: "E-Mail oder Passwort ist falsch." });
      }
      const org = await storage.getUser(member.organizationId);
      if (!org) {
        return res.status(401).json({ error: "invalid_credentials", message: "E-Mail oder Passwort ist falsch." });
      }
      // Self-signed-up owners hold a password before confirming their email.
      // Block login until the email link is clicked. Invited/claimed/reset
      // members always have emailVerifiedAt set alongside their password, so
      // this only ever gates pending owner signups.
      if (!member.emailVerifiedAt) {
        logAuthEvent("login.unverified", req, { memberId: member.id });
        return res.status(403).json({ error: "email_unverified", message: "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse über den Link, den wir Ihnen gesendet haben." });
      }
      await establishSession(req, member.id);
      await storage.updateMemberAuth(member.id, { lastLoginAt: new Date() });
      logAuthEvent("login.success", req, { memberId: member.id, orgId: org.id });
      res.json({ authenticated: true, member: sanitizeMember(member), org });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[auth] login error", error);
      res.status(500).json({ error: "server_error", message: "Anmeldung fehlgeschlagen." });
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  app.post("/api/auth/logout", async (req, res) => {
    const memberId = req.session?.memberId;
    await destroySession(req, res);
    logAuthEvent("logout", req, { memberId });
    res.json({ ok: true });
  });

  // ── Password reset: request ───────────────────────────────────────────────
  app.post("/api/auth/password-reset/request", authLimiter, async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const member = await storage.getMemberByEmail(email);
      // Always 200 to avoid leaking which emails exist.
      if (member) {
        const { raw, hash } = generateToken();
        await storage.deletePasswordResetsForMember(member.id);
        await storage.createPasswordReset({
          memberId: member.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        });
        if (member.email && isEmailConfigured()) {
          await sendEmail({
            to: member.email,
            subject: "GastroConnect: Passwort zurücksetzen",
            html: renderNotificationEmail({
              title: "Passwort zurücksetzen",
              message: `Hallo ${member.name},\n\nsetzen Sie Ihr Passwort über den folgenden Link zurück. Der Link ist 1 Stunde gültig. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.`,
              linkPath: `/auth/reset?token=${raw}`,
            }),
          });
        }
        logAuthEvent("password_reset.requested", req, { memberId: member.id });
      }
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      res.status(500).json({ error: "server_error", message: "Anfrage fehlgeschlagen." });
    }
  });

  // ── Password reset: confirm ───────────────────────────────────────────────
  app.post("/api/auth/password-reset/confirm", authLimiter, async (req, res) => {
    try {
      const { token, password } = z
        .object({ token: z.string().min(10).max(512), password: z.string().max(256) })
        .parse(req.body);
      const policyError = validatePasswordPolicy(password);
      if (policyError) return res.status(400).json({ error: "weak_password", message: policyError });

      const record = await storage.getPasswordResetByTokenHash(hashToken(token));
      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ error: "invalid_token", message: "Der Link ist ungültig oder abgelaufen." });
      }
      const member = await storage.getMember(record.memberId);
      if (!member) {
        return res.status(400).json({ error: "invalid_token", message: "Der Link ist ungültig oder abgelaufen." });
      }
      await storage.updateMemberAuth(member.id, {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: member.emailVerifiedAt ?? new Date(),
      });
      await storage.markPasswordResetUsed(record.id);
      await establishSession(req, member.id);
      const org = await storage.getUser(member.organizationId);
      logAuthEvent("password_reset.confirmed", req, { memberId: member.id });
      const fresh = await storage.getMember(member.id);
      res.json({ authenticated: true, member: fresh ? sanitizeMember(fresh) : sanitizeMember(member), org });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[auth] reset confirm error", error);
      res.status(500).json({ error: "server_error", message: "Zurücksetzen fehlgeschlagen." });
    }
  });

  // ── Business self-signup: register a brand-new organization + admin owner ──
  // Public, rate-limited. Creates a pending org (verifiedAt null) plus its first
  // admin member (password set, email NOT yet verified) and emails a
  // verification link. The owner cannot log in until the link is confirmed.
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { role, companyName, name, email, password, language } = z
        .object({
          role: z.enum(["restaurant", "supplier"]),
          companyName: z.string().trim().min(2).max(160),
          name: z.string().trim().min(2).max(160),
          email: z.string().email().max(256),
          password: z.string().max(256),
          language: z.enum(["de", "it", "en"]).optional(),
        })
        .parse(req.body);

      const policyError = validatePasswordPolicy(password);
      if (policyError) return res.status(400).json({ error: "weak_password", message: policyError });

      const normalizedEmail = email.trim().toLowerCase();

      // Self-signup reveals email existence by design (B2B owner onboarding).
      // Conflict on either an existing login email (member) or org email.
      const existingMember = await storage.getMemberByEmail(normalizedEmail);
      const existingOrg = await storage.getUserByEmail(normalizedEmail);
      if (existingMember || existingOrg) {
        logAuthEvent("register.conflict", req, { email: normalizedEmail });
        return res.status(409).json({ error: "email_taken", message: "Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an." });
      }

      const { org, member } = await storage.createBusinessSignup({
        org: {
          role,
          name: companyName,
          companyName,
          email: normalizedEmail,
          language: language ?? "de",
        },
        admin: {
          name,
          email: normalizedEmail,
          role: "admin",
          passwordHash: await hashPassword(password),
        },
      });

      const { raw, hash } = generateToken();
      await storage.createEmailVerification({
        memberId: member.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      });

      let emailed = false;
      if (isEmailConfigured()) {
        emailed = await sendEmail({
          to: normalizedEmail,
          subject: "GastroConnect: E-Mail bestätigen",
          html: renderNotificationEmail({
            title: "Bestätigen Sie Ihre E-Mail-Adresse",
            message: `Hallo ${name},\n\nwillkommen bei GastroConnect! Bestätigen Sie Ihre E-Mail-Adresse über den folgenden Link, um Ihr Geschäftskonto für ${companyName} zu aktivieren. Der Link ist 24 Stunden gültig.`,
            linkPath: `/auth/verify?token=${raw}`,
          }),
        });
      }
      logAuthEvent("register.requested", req, { memberId: member.id, orgId: org.id, role, emailed });
      res.json({ ok: true, emailed });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[auth] register error", error);
      res.status(500).json({ error: "server_error", message: "Registrierung fehlgeschlagen." });
    }
  });

  // ── Business self-signup: confirm the email link, activate org + admin ─────
  app.post("/api/auth/verify-email", authLimiter, async (req, res) => {
    try {
      const { token } = z.object({ token: z.string().min(10).max(512) }).parse(req.body);
      const record = await storage.getEmailVerificationByTokenHash(hashToken(token));
      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ error: "invalid_token", message: "Der Bestätigungslink ist ungültig oder abgelaufen." });
      }
      const member = await storage.getMember(record.memberId);
      if (!member) {
        return res.status(400).json({ error: "invalid_token", message: "Der Bestätigungslink ist ungültig oder abgelaufen." });
      }
      await storage.updateMemberAuth(member.id, { emailVerifiedAt: member.emailVerifiedAt ?? new Date() });
      await storage.markOrganizationVerified(member.organizationId);
      await storage.markEmailVerificationUsed(record.id);
      await establishSession(req, member.id);
      const org = await storage.getUser(member.organizationId);
      const fresh = await storage.getMember(member.id);
      logAuthEvent("verify_email.confirmed", req, { memberId: member.id, orgId: member.organizationId });
      res.json({ authenticated: true, member: fresh ? sanitizeMember(fresh) : sanitizeMember(member), org });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[auth] verify-email error", error);
      res.status(500).json({ error: "server_error", message: "Bestätigung fehlgeschlagen." });
    }
  });

  // ── Business self-signup: resend the verification email ────────────────────
  // Always 200 to avoid leaking which emails exist. Only re-sends for a pending
  // owner account (has a password but no confirmed email yet).
  app.post("/api/auth/verify-email/resend", authLimiter, async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email().max(256) }).parse(req.body);
      const member = await storage.getMemberByEmail(email);
      if (member && member.passwordHash && !member.emailVerifiedAt) {
        const { raw, hash } = generateToken();
        await storage.deleteEmailVerificationsForMember(member.id);
        await storage.createEmailVerification({
          memberId: member.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        });
        const org = await storage.getUser(member.organizationId);
        if (member.email && isEmailConfigured()) {
          await sendEmail({
            to: member.email,
            subject: "GastroConnect: E-Mail bestätigen",
            html: renderNotificationEmail({
              title: "Bestätigen Sie Ihre E-Mail-Adresse",
              message: `Hallo ${member.name},\n\nbestätigen Sie Ihre E-Mail-Adresse über den folgenden Link, um Ihr Geschäftskonto${org?.companyName ? ` für ${org.companyName}` : ""} zu aktivieren. Der Link ist 24 Stunden gültig.`,
              linkPath: `/auth/verify?token=${raw}`,
            }),
          });
        }
        logAuthEvent("verify_email.resent", req, { memberId: member.id });
      }
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      res.status(500).json({ error: "server_error", message: "Anfrage fehlgeschlagen." });
    }
  });

  // ── Invite a teammate (or re-invite a seeded member to claim) ──────────────
  app.post("/api/members/:id/invite", requireAuth, async (req, res) => {
    try {
      const target = await storage.getMember(String(req.params.id));
      if (!target) return res.status(404).json({ error: "not_found", message: "Mitglied nicht gefunden." });
      // Authorization: inviter must be in the same org and able to manage the team.
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
            message: `Hallo ${target.name},\n\nSie wurden zum Team von ${req.auth!.org.companyName ?? req.auth!.org.name} eingeladen. Aktivieren Sie Ihr Konto und legen Sie ein Passwort fest. Der Link ist 7 Tage gültig.`,
            linkPath: `/auth/claim?token=${raw}`,
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

  // ── Claim: inspect an invite token (for the activation screen) ─────────────
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

  // ── Claim: activate the account by setting a password ──────────────────────
  app.post("/api/auth/claim", authLimiter, async (req, res) => {
    try {
      const { token, password } = z
        .object({ token: z.string().min(10).max(512), password: z.string().max(256) })
        .parse(req.body);
      const policyError = validatePasswordPolicy(password);
      if (policyError) return res.status(400).json({ error: "weak_password", message: policyError });

      const invite = await storage.getInvitationByTokenHash(hashToken(token));
      if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ error: "invalid_token", message: "Die Einladung ist ungültig oder abgelaufen." });
      }
      const member = await storage.getMember(invite.memberId);
      if (!member) return res.status(400).json({ error: "invalid_token", message: "Die Einladung ist ungültig oder abgelaufen." });

      await storage.updateMemberAuth(member.id, {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: member.emailVerifiedAt ?? new Date(),
      });
      await storage.markInvitationAccepted(invite.id);
      await establishSession(req, member.id);
      const org = await storage.getUser(member.organizationId);
      const fresh = await storage.getMember(member.id);
      logAuthEvent("claim.completed", req, { memberId: member.id });
      res.json({ authenticated: true, member: fresh ? sanitizeMember(fresh) : sanitizeMember(member), org });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "invalid_input", message: "Ungültige Eingabe." });
      }
      console.error("[auth] claim error", error);
      res.status(500).json({ error: "server_error", message: "Aktivierung fehlgeschlagen." });
    }
  });
}
