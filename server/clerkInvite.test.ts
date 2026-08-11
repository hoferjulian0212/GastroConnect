// Integration tests for Clerk invitation-based auth flow.
//
// Tests `resolveClerkAuth` — the function that maps a Clerk-authenticated
// email to a full AuthContext while enforcing the invite-only model:
//
//  1. Unknown email (no member row) → null (deny)
//  2. Member with valid pending invitation + unverified org → access granted,
//     invitation consumed, org activated
//  3. Member with valid pending invitation + verified org → access granted,
//     invitation consumed
//  4. Member with NO invitation at all (pending org) → null (deny)
//  5. Member with NO invitation at all (verified org) → null (deny)
//     [the key case: verified-org bypass is not allowed]
//  6. Member with expired invitation + unverified org → null (deny)
//  7. Member with expired invitation + verified org → null (deny)
//  8. Member whose invitation was previously accepted (returning user) → access
//     granted (fast-path via accepted-invitation record)
//
// `resolveClerkAuth` is exported from server/auth/middleware.ts and operates
// directly against the dev DB — no HTTP server required.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { users, members, invitations } from "../shared/schema";
import { resolveClerkAuth } from "./auth/middleware";

// ── Utilities ─────────────────────────────────────────────────────────────────

const RUN = crypto.randomBytes(4).toString("hex");

function orgEmail(suffix: string) {
  return `org-${suffix}-${RUN}@clerktest.invalid`;
}
function memberEmail(suffix: string) {
  return `member-${suffix}-${RUN}@clerktest.invalid`;
}

async function insertOrg(suffix: string, verified: boolean) {
  const [org] = await db
    .insert(users)
    .values({
      role: "supplier" as const,
      name: `Test Org ${suffix} ${RUN}`,
      email: orgEmail(suffix),
      companyName: `Test Org ${suffix} ${RUN}`,
      language: "de" as const,
      verifiedAt: verified ? new Date() : null,
    })
    .returning();
  return org;
}

async function insertMember(suffix: string, orgId: string) {
  const [m] = await db
    .insert(members)
    .values({
      name: `Test Member ${suffix} ${RUN}`,
      email: memberEmail(suffix),
      role: "admin" as const,
      organizationId: orgId,
    })
    .returning();
  return m;
}

async function insertInvitation(
  memberId: string,
  opts: { accepted?: boolean; expiresAt?: Date } = {},
) {
  const hash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [inv] = await db
    .insert(invitations)
    .values({
      memberId,
      tokenHash: hash,
      invitedByMemberId: null,
      expiresAt,
      acceptedAt: opts.accepted ? new Date(Date.now() - 60_000) : null,
    })
    .returning();
  return inv;
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

const memberIds: string[] = [];
const orgIds: string[] = [];

after(async () => {
  if (memberIds.length) {
    await db.delete(invitations).where(
      // delete invitations seeded by this run
      eq(invitations.memberId, memberIds[0]), // placeholder — real cleanup below
    ).catch(() => {});
  }
  for (const id of memberIds) {
    await db.delete(invitations).where(eq(invitations.memberId, id)).catch(() => {});
    await db.delete(members).where(eq(members.id, id)).catch(() => {});
  }
  for (const id of orgIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveClerkAuth — invite-only enforcement", () => {
  test("1. unknown email → null (deny)", async () => {
    const result = await resolveClerkAuth(`nobody-${RUN}@clerktest.invalid`);
    assert.strictEqual(result, null);
  });

  test("2. valid pending invitation + unverified org → access granted, invitation consumed, org activated", async () => {
    const org = await insertOrg("case2", false);
    orgIds.push(org.id);
    const member = await insertMember("case2", org.id);
    memberIds.push(member.id);
    await insertInvitation(member.id);

    const result = await resolveClerkAuth(member.email!);
    assert.ok(result, "must grant access");
    assert.strictEqual(result.memberId, member.id);
    assert.ok(result.org.verifiedAt, "org must be verified");

    // Invitation must be consumed.
    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.memberId, member.id), isNotNull(invitations.acceptedAt)));
    assert.ok(inv, "invitation must have acceptedAt set");
  });

  test("3. valid pending invitation + verified org → access granted, invitation consumed", async () => {
    const org = await insertOrg("case3", true);
    orgIds.push(org.id);
    const member = await insertMember("case3", org.id);
    memberIds.push(member.id);
    await insertInvitation(member.id);

    const result = await resolveClerkAuth(member.email!);
    assert.ok(result, "must grant access");
    assert.strictEqual(result.memberId, member.id);

    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.memberId, member.id), isNotNull(invitations.acceptedAt)));
    assert.ok(inv, "invitation must be consumed");
  });

  test("4. no invitation at all + unverified org → null (deny)", async () => {
    const org = await insertOrg("case4", false);
    orgIds.push(org.id);
    const member = await insertMember("case4", org.id);
    memberIds.push(member.id);
    // No invitation created.

    const result = await resolveClerkAuth(member.email!);
    assert.strictEqual(result, null, "must deny: no invitation, unverified org");
  });

  test("5. no invitation at all + verified org → null (deny) [no bypass via org verification]", async () => {
    const org = await insertOrg("case5", true);
    orgIds.push(org.id);
    const member = await insertMember("case5", org.id);
    memberIds.push(member.id);
    // No invitation created — email match alone is not enough.

    const result = await resolveClerkAuth(member.email!);
    assert.strictEqual(result, null, "must deny: verified org but no invitation");
  });

  test("6. expired invitation + unverified org → null (deny)", async () => {
    const org = await insertOrg("case6", false);
    orgIds.push(org.id);
    const member = await insertMember("case6", org.id);
    memberIds.push(member.id);
    await insertInvitation(member.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await resolveClerkAuth(member.email!);
    assert.strictEqual(result, null, "must deny: expired invitation");
  });

  test("7. expired invitation + verified org → null (deny)", async () => {
    const org = await insertOrg("case7", true);
    orgIds.push(org.id);
    const member = await insertMember("case7", org.id);
    memberIds.push(member.id);
    await insertInvitation(member.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await resolveClerkAuth(member.email!);
    assert.strictEqual(result, null, "must deny: expired invitation even in verified org");
  });

  test("8. previously accepted invitation (returning user) → access granted via fast path", async () => {
    const org = await insertOrg("case8", true);
    orgIds.push(org.id);
    const member = await insertMember("case8", org.id);
    memberIds.push(member.id);
    await insertInvitation(member.id, { accepted: true });

    const result = await resolveClerkAuth(member.email!);
    assert.ok(result, "returning user must get access");
    assert.strictEqual(result.memberId, member.id);

    // Re-auth must also succeed.
    const result2 = await resolveClerkAuth(member.email!);
    assert.ok(result2, "second call must also succeed");
  });
});
