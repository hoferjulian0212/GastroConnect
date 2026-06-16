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
  | "team.view"        // see the team / org page
  | "team.manage"      // add / remove / change role / promote members
  | "org.edit"         // edit organization (business) details & seat limit
  | "orders.create"    // place orders (restaurant) / create direct orders
  | "orders.manage"    // confirm / cancel / change status of orders
  | "products.manage"  // manage catalog, inventory, promotions, prices
  | "vertreter.assign" // assign Betriebe (restaurants) to a Vertreter
  | "chat";            // send chat messages

export const MEMBER_ROLE_VALUES: MemberRole[] = ["admin", "manager", "staff", "vertreter"];

// Role → capabilities it is allowed to perform.
const ROLE_CAPABILITIES: Record<MemberRole, Capability[]> = {
  admin: [
    "team.view",
    "team.manage",
    "org.edit",
    "orders.create",
    "orders.manage",
    "products.manage",
    "vertreter.assign",
    "chat",
  ],
  manager: [
    "team.view",
    "orders.create",
    "orders.manage",
    "products.manage",
    "chat",
  ],
  staff: [
    "team.view",
    "orders.create",
    "chat",
  ],
  vertreter: [
    "team.view",
    "orders.manage",
    "chat",
  ],
};

/** Returns true if the given preset role may perform the capability. */
export function can(role: MemberRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

/** Bilingual labels for each preset role (DE / IT), matching the app's t(de, it) convention. */
export const ROLE_LABELS: Record<MemberRole, { de: string; it: string }> = {
  admin: { de: "Administrator", it: "Amministratore" },
  manager: { de: "Manager", it: "Manager" },
  staff: { de: "Mitarbeiter", it: "Personale" },
  vertreter: { de: "Vertreter", it: "Rappresentante" },
};

export function roleLabel(role: MemberRole, lang: "de" | "it"): string {
  return ROLE_LABELS[role]?.[lang] ?? role;
}
