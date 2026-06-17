// Server-side sessions stored in Postgres (connect-pg-simple) behind a signed,
// HTTP-only, secure, same-site cookie. The session payload holds only the
// member id; the full member/org/role is loaded per-request by `loadAuth`.
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db";

declare module "express-session" {
  interface SessionData {
    memberId?: string;
    // Short-lived CSRF state for the member OAuth authorization-code round trip.
    oauthState?: string;
    // Platform admin session (separate from member sessions).
    adminId?: string;
    // When set, the admin is impersonating this member.
    impersonatedMemberId?: string;
    // CSRF state for the admin Replit OAuth round trip.
    adminOauthState?: string;
    // PKCE code verifier for the admin Replit OAuth round trip.
    adminOauthCodeVerifier?: string;
  }
}

const PgStore = connectPgSimple(session);

export function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set — refusing to start the auth/session layer.",
    );
  }
  const isProd = process.env.NODE_ENV === "production";
  return session({
    name: "gc.sid",
    store: new PgStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 60, // prune expired rows hourly
    }),
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProd, // requires HTTPS in production (Replit terminates TLS)
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      path: "/",
    },
  });
}
