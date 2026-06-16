// Google "Sign in with Google" using the OAuth 2.0 / OpenID Connect
// authorization-code flow. No passport: identity is established in our own
// Postgres-backed session (same as email/password). Invite-only rules apply —
// a Google identity can only sign in if it already maps to an existing member
// (by linked oauth account or by verified email); there is no public signup.
import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
});

export function isGoogleOauthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Build the absolute callback URL from the incoming request so it matches
// whichever domain (dev or prod) the user reached the app on. This must be
// registered as an "Authorized redirect URI" in the Google Cloud console.
function callbackUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"]?.toString().split(",")[0]) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"]?.toString() || req.headers.host || "";
  return `${proto}://${host}/api/auth/oauth/google/callback`;
}

function decodeJwtPayload(jwt: string): Record<string, any> | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function establishSession(req: Request, memberId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.memberId = memberId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function fail(res: Response, code: string) {
  res.redirect(`/login?error=${encodeURIComponent(code)}`);
}

export function registerOauthRoutes(app: Express) {
  // Kick off the flow: stash a CSRF state in the session, redirect to Google.
  app.get("/api/auth/oauth/google/start", oauthLimiter, (req, res) => {
    if (!isGoogleOauthConfigured()) return fail(res, "oauth_unavailable");
    const state = randomBytes(24).toString("base64url");
    req.session.oauthState = state;
    req.session.save((err) => {
      if (err) {
        console.error("[auth] oauth state save failed", err);
        return fail(res, "oauth_failed");
      }
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: callbackUrl(req),
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "online",
        prompt: "select_account",
      });
      res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    });
  });

  // Handle the redirect back from Google.
  app.get("/api/auth/oauth/google/callback", oauthLimiter, async (req, res) => {
    try {
      if (!isGoogleOauthConfigured()) return fail(res, "oauth_unavailable");
      if (req.query.error) return fail(res, "oauth_denied");

      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const expectedState = req.session.oauthState;
      req.session.oauthState = undefined;
      if (!code || !state || !expectedState || state !== expectedState) {
        return fail(res, "oauth_state");
      }

      // Exchange the authorization code for tokens (server-to-server over TLS).
      const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackUrl(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResp.ok) {
        console.error("[auth] google token exchange failed", tokenResp.status, await tokenResp.text());
        return fail(res, "oauth_failed");
      }
      const tokens = (await tokenResp.json()) as { id_token?: string };
      const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
      const providerUserId = claims?.sub as string | undefined;
      const email = (claims?.email as string | undefined)?.toLowerCase();
      const emailVerified = claims?.email_verified === true || claims?.email_verified === "true";
      if (!providerUserId || !email) return fail(res, "oauth_failed");
      if (!emailVerified) return fail(res, "email_unverified");

      // Resolve to an existing member: first by linked oauth identity (stable
      // subject id), then by verified email (link on first use). Invite-only:
      // an unknown identity is rejected, never auto-registered.
      let member = undefined;
      const linked = await storage.getOauthAccount("google", providerUserId);
      if (linked) {
        member = await storage.getMember(linked.memberId);
      }
      if (!member) {
        const byEmail = await storage.getMemberByEmail(email);
        if (byEmail) {
          member = byEmail;
          if (!linked) {
            await storage.createOauthAccount({ memberId: byEmail.id, provider: "google", providerUserId });
          }
        }
      }
      if (!member) {
        console.log("[auth] oauth.not_invited", JSON.stringify({ email }));
        return fail(res, "not_invited");
      }

      await establishSession(req, member.id);
      await storage.updateMemberAuth(member.id, {
        lastLoginAt: new Date(),
        emailVerifiedAt: member.emailVerifiedAt ?? new Date(),
      });
      console.log("[auth] oauth.login.success", JSON.stringify({ memberId: member.id, provider: "google" }));
      res.redirect("/");
    } catch (error) {
      console.error("[auth] google callback error", error);
      fail(res, "oauth_failed");
    }
  });
}
