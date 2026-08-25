import type { MemberRole } from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// Preset-role permission model (single source of truth).
//
// This is both a UX control AND part of the server-side security boundary. The
// acting identity (member + organization + role) is resolved from the server
// session, never from client-supplied ids, and protected routes enforce these
// capabilities (see server/auth/middleware.ts and the route guards in
// server/routes.ts). The same matrix gates the UI for consistency.
// ─────────────────────────────────────────────────────────────────────────────

export type Capability =
  | "team.view"             // see the team / org page
  | "team.manage"           // add / remove / change role / promote members
  | "org.edit"              // edit organization (business) details & seat limit
  | "orders.create"         // place orders (restaurant) / create direct orders
  | "orders.manage"         // confirm / cancel / change status of orders
  | "products.manage"       // manage catalog, inventory, prices
  | "sustainability.view"   // view product sustainability metadata and claims
  | "sustainability.manage" // manage product sustainability metadata
  | "promotions.manage"     // create / edit / delete promotions
  | "inventory_risk.create" // create a risk record + edit own
  | "inventory_risk.manage" // edit any record, change status, link promotions
  | "vertreter.assign"      // assign Betriebe (restaurants) to a Vertreter
  | "chat"                  // send chat messages
  | "deliveries.manage"     // office: assign/unassign drivers, oversee deliveries
  | "deliveries.drive"      // driver: work own assigned deliveries, post location
  | "impact.analytics";     // restaurant manager/admin: aggregated impact reporting

export const MEMBER_ROLE_VALUES: MemberRole[] = ["admin", "manager", "staff", "vertreter", "warehouse", "driver"];

// Role → capabilities it is allowed to perform.
const ROLE_CAPABILITIES: Record<MemberRole, Capability[]> = {
  admin: [
    "team.view",
    "team.manage",
    "org.edit",
    "orders.create",
    "orders.manage",
    "products.manage",
    "sustainability.view",
    "sustainability.manage",
    "promotions.manage",
    "inventory_risk.create",
    "inventory_risk.manage",
    "vertreter.assign",
    "chat",
    "deliveries.manage",
    "impact.analytics",
  ],
  manager: [
    "team.view",
    "orders.create",
    "orders.manage",
    "products.manage",
    "sustainability.view",
    "sustainability.manage",
    "promotions.manage",
    "inventory_risk.create",
    "inventory_risk.manage",
    "chat",
    "deliveries.manage",
    "impact.analytics",
  ],
  staff: [
    "team.view",
    "orders.create",
    "chat",
  ],
  vertreter: [
    "team.view",
    "orders.manage",
    "promotions.manage",
    "inventory_risk.create",
    "inventory_risk.manage",
    "chat",
  ],
  warehouse: [
    "team.view",
    "inventory_risk.create",
  ],
  driver: [
    "chat",
    "deliveries.drive",
  ],
};

/** Returns true if the given preset role may perform the capability. */
export function can(role: MemberRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Warehouse API surface — server-side hard limit.
//
// The warehouse role is intentionally minimal: members only view stock and flag
// at-risk inventory (capabilities: team.view, inventory_risk.create). The app UI
// hides everything else, but the UI is not a security boundary. To guarantee the
// limit holds at the API layer, a warehouse session is restricted to an explicit
// allow-list of endpoints that map to its capabilities plus the shared app shell
// (session/auth, own account + profile upload, team view, notifications, push,
// heartbeat, error reporting). EVERY other /api route is denied.
//
// Failing closed (deny-by-default) means a newly added supplier route — orders,
// pricing, documents, stats, chat, etc. — cannot accidentally leak to warehouse
// members just because its author forgot a capability check.
// ─────────────────────────────────────────────────────────────────────────────
type WarehouseRouteRule = { methods: "*" | readonly string[]; pattern: RegExp };

const WAREHOUSE_ALLOWED_ROUTES: readonly WarehouseRouteRule[] = [
  // Session / authentication (login, logout, me, password, oauth).
  { methods: "*", pattern: /^\/api\/auth(\/|$)/ },
  // Own account: profile, settings, notification prefs, status, dashboard, etc.
  // Cross-org reads here return public profiles only; writes are self-/capability
  // gated inside each route.
  { methods: "*", pattern: /^\/api\/users(\/|$)/ },
  // Profile-picture upload (request a presigned URL).
  { methods: ["POST"], pattern: /^\/api\/uploads(\/|$)/ },
  // Team view (membership list). Team writes stay capability-gated per route.
  { methods: "*", pattern: /^\/api\/orgs(\/|$)/ },
  { methods: "*", pattern: /^\/api\/members(\/|$)/ },
  // Presence heartbeat.
  { methods: ["POST"], pattern: /^\/api\/heartbeat$/ },
  // Notification feed + read state.
  { methods: "*", pattern: /^\/api\/notifications(\/|$)/ },
  // Web-push subscription management.
  { methods: "*", pattern: /^\/api\/push(\/|$)/ },
  // Stock list: read-only product catalog of the member's own supplier org.
  { methods: ["GET"], pattern: /^\/api\/supplier\/products$/ },
  // Inventory-risk flagging (create + edit own + read). Status changes and the
  // "turn into promotion" action stay gated by inventory_risk.manage in-route.
  { methods: "*", pattern: /^\/api\/inventory-risks(\/|$)/ },
  // Company-internal chat (office + warehouse + drivers of the same org).
  { methods: "*", pattern: /^\/api\/internal-chat(\/|$)/ },
  // Best-effort client error reporting.
  { methods: ["POST"], pattern: /^\/api\/client-errors$/ },
];

/**
 * Returns true if a member with the `warehouse` role may reach the given API
 * endpoint. Deny-by-default: anything not explicitly allow-listed is rejected.
 * This is the server-side enforcement of the warehouse page limits — the route
 * middleware must respond 403 when this returns false. `path` should be the
 * request path without its query string (e.g. Express `req.path`).
 */
export function isWarehousePathAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return WAREHOUSE_ALLOWED_ROUTES.some(
    (rule) =>
      (rule.methods === "*" || rule.methods.includes(m)) && rule.pattern.test(path),
  );
}

/** Bilingual labels for each preset role (DE / IT), matching the app's t(de, it) convention. */
export const ROLE_LABELS: Record<MemberRole, { de: string; it: string }> = {
  admin: { de: "Administrator", it: "Amministratore" },
  manager: { de: "Manager", it: "Manager" },
  staff: { de: "Mitarbeiter", it: "Personale" },
  vertreter: { de: "Vertreter", it: "Rappresentante" },
  warehouse: { de: "Lagermitarbeiter", it: "Magazziniere" },
  driver: { de: "Fahrer", it: "Autista" },
};

export function roleLabel(role: MemberRole, lang: "de" | "it"): string {
  return ROLE_LABELS[role]?.[lang] ?? role;
}

/**
 * Warehouse members belong to a supplier org (URL prefix stays `/supplier`) but
 * only get a focused, mobile-first subset of pages. This is the single source of
 * truth for that allow-list: `WarehouseRouter` in `client/src/App.tsx` builds its
 * routes from this list, and anything NOT listed here falls through to a redirect
 * back to `/supplier`.
 */
export const WAREHOUSE_ALLOWED_PATHS = [
  "/supplier",
  "/supplier/inventory-risk",
  "/supplier/inventory",
  "/supplier/team-chat",
  "/supplier/settings",
  "/supplier/profile",
  "/supplier/team",
  "/supplier/help",
] as const;

export type WarehouseAllowedPath = (typeof WAREHOUSE_ALLOWED_PATHS)[number];

/** True if a warehouse member is allowed to view the given path (query string ignored). */
export function isWarehouseAllowedPath(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return (WAREHOUSE_ALLOWED_PATHS as readonly string[]).includes(clean);
}

/** Derives the `isWarehouse` flag from a member's role. */
export function isWarehouseRole(role: MemberRole | null | undefined): boolean {
  return role === "warehouse";
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver API surface — server-side hard limit (mirrors the warehouse pattern).
//
// A driver ("Fahrer") only works their own assigned deliveries, posts their GPS
// position, chats with restaurants about active deliveries, and uses the
// company-internal chat. Deny-by-default: every /api route NOT allow-listed
// here is rejected for a driver session, so newly added supplier routes
// (pricing, stats, documents, ERP, …) can never accidentally leak to drivers.
// ─────────────────────────────────────────────────────────────────────────────
type DriverRouteRule = { methods: "*" | readonly string[]; pattern: RegExp };

const DRIVER_ALLOWED_ROUTES: readonly DriverRouteRule[] = [
  // Session / authentication.
  { methods: "*", pattern: /^\/api\/auth(\/|$)/ },
  // Own account: profile, settings, notification prefs, presence.
  { methods: "*", pattern: /^\/api\/users(\/|$)/ },
  // Photo / attachment upload (proof of delivery, chat photos).
  { methods: ["POST"], pattern: /^\/api\/uploads(\/|$)/ },
  // Team view.
  { methods: "*", pattern: /^\/api\/orgs(\/|$)/ },
  { methods: "*", pattern: /^\/api\/members(\/|$)/ },
  // Presence heartbeat.
  { methods: ["POST"], pattern: /^\/api\/heartbeat$/ },
  // Notification feed + read state.
  { methods: "*", pattern: /^\/api\/notifications(\/|$)/ },
  // Web-push subscription management.
  { methods: "*", pattern: /^\/api\/push(\/|$)/ },
  // Driver module: own deliveries, route planning, live location.
  { methods: "*", pattern: /^\/api\/driver(\/|$)/ },
  // Company-internal chat.
  { methods: "*", pattern: /^\/api\/internal-chat(\/|$)/ },
  // Chat with restaurants about deliveries (org-level conversation system).
  { methods: "*", pattern: /^\/api\/conversations(\/|$)/ },
  { methods: "*", pattern: /^\/api\/messages(\/|$)/ },
  // Best-effort client error reporting.
  { methods: ["POST"], pattern: /^\/api\/client-errors$/ },
];

/**
 * Returns true if a member with the `driver` role may reach the given API
 * endpoint. Deny-by-default — the route middleware must respond 403 when this
 * returns false. `path` is the request path without query string (req.path).
 */
export function isDriverPathAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return DRIVER_ALLOWED_ROUTES.some(
    (rule) =>
      (rule.methods === "*" || rule.methods.includes(m)) && rule.pattern.test(path),
  );
}

/**
 * Driver client pages (URL prefix stays `/supplier` like warehouse members).
 * `DriverRouter` in `client/src/App.tsx` builds its routes from this list;
 * anything else redirects back to the driver home. `:id` segments are matched
 * as wildcards by isDriverAllowedPath.
 */
export const DRIVER_ALLOWED_PATHS = [
  "/supplier",
  "/supplier/delivery/:id",
  "/supplier/route",
  "/supplier/map",
  "/supplier/history",
  "/supplier/team-chat",
  "/supplier/inbox",
  "/supplier/settings",
  "/supplier/profile",
  "/supplier/help",
] as const;

export type DriverAllowedPath = (typeof DRIVER_ALLOWED_PATHS)[number];

/** True if a driver member is allowed to view the given path (query ignored). */
export function isDriverAllowedPath(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return (DRIVER_ALLOWED_PATHS as readonly string[]).some((p) => {
    if (!p.includes(":")) return p === clean;
    const regex = new RegExp(
      "^" + p.replace(/:[^/]+/g, "[^/]+") + "$",
    );
    return regex.test(clean);
  });
}

/** Derives the `isDriver` flag from a member's role. */
export function isDriverRole(role: MemberRole | null | undefined): boolean {
  return role === "driver";
}
