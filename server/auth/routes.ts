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
import { getAuth } from "@clerk/express";
import { sendEmail, renderNotificationEmail, isEmailConfigured } from "../emailService";
import { geocodeAddress } from "../geocoding";
import {
  registrationCompletionSchema,
} from "@shared/registrationValidation";

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

function getClerkEmail(req: Request): string | undefined {
  try {
    const clerkAuth = getAuth(req);
    return (clerkAuth?.sessionClaims?.email as string | undefined)?.toLowerCase();
  } catch (error) {
    // Some route-level tests and non-Clerk health/degraded contexts can invoke
    // these handlers without clerkMiddleware. Treat that as unauthenticated
    // instead of turning a session probe into a 500.
    return undefined;
  }
}

export function registerAuthRoutes(app: Express) {
  // ── Current session ───────────────────────────────────────────────────────
  // Auth is now Clerk-based; member + org are resolved by loadAuth middleware
  // from the Clerk session. This endpoint surfaces the result to the client.
  app.get("/api/auth/me", (req, res) => {
    if (!req.auth) {
      const email = getClerkEmail(req);
      if (email) {
        storage.getMemberByEmail(email.toLowerCase()).then(async (member) => {
          const org = member ? await storage.getUser(member.organizationId) : undefined;
          if (member && org && (org.approvalStatus === "pending" || org.approvalStatus === "denied")) {
            return res.json({ authenticated: false, registrationStatus: org.approvalStatus, org: { id: org.id, name: org.name, companyName: org.companyName } });
          }
          return res.json({ authenticated: false });
        }).catch(() => res.json({ authenticated: false }));
        return;
      }
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      member: sanitizeMember(req.auth.member),
      org: req.auth.org,
    });
  });

  app.post("/api/auth/registration/geocode", authLimiter, async (req, res) => {
    const parsed = z.object({
      address: z.string().trim().min(3).max(200),
      city: z.string().trim().min(2).max(100),
      postalCode: z.string().trim().min(3).max(20),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_address",
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const coordinates = await geocodeAddress(parsed.data);
      if (!coordinates) {
        return res.status(422).json({
          error: "address_not_found",
          message: "Diese Adresse wurde nicht gefunden. Bitte prüfen Sie Straße, PLZ und Ort.",
        });
      }
      return res.json({ coordinates });
    } catch (error) {
      console.error("[auth] registration geocoding error", error);
      return res.status(502).json({
        error: "geocoding_unavailable",
        message: "Die Adresse konnte gerade nicht geprüft werden. Bitte versuchen Sie es erneut.",
      });
    }
  });

  // Completes the GastroConnect-only public onboarding after Clerk has
  // verified the email with its code-based flow.
  app.post("/api/auth/registration/complete", authLimiter, async (req, res) => {
    try {
      const email = getClerkEmail(req);
      if (!email) return res.status(401).json({ error: "unauthenticated" });
      if (!z.string().email().safeParse(email).success) {
        return res.status(401).json({ error: "invalid_verified_email" });
      }
      const parsed = registrationCompletionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid_registration", fields: parsed.error.flatten().fieldErrors });
      const existing = await storage.getMemberByEmail(email);
      if (existing) {
        const existingOrg = await storage.getUser(existing.organizationId);
        if (existingOrg) return res.json({ ok: true, status: existingOrg.approvalStatus });
      }
      const d = parsed.data;
      const created = await storage.createBusinessSignup({
        org: {
          role: d.role, name: d.companyName, companyName: d.companyName, email,
          phone: d.phone, address: d.address, city: d.city, postalCode: d.postalCode,
          latitude: String(d.latitude),
          longitude: String(d.longitude),
          description: d.profile, verifiedAt: new Date(), approvalStatus: "pending",
        },
        admin: {
          name: d.contactName, email, role: "admin", emailVerifiedAt: new Date(),
          passwordHash: undefined as never,
        },
      });
      logAuthEvent("registration.completed", req, { organizationId: created.org.id, role: d.role });
      res.status(201).json({ ok: true, status: "pending" });
    } catch (error) {
      console.error("[auth] registration completion error", error);
      res.status(500).json({ error: "server_error" });
    }
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
