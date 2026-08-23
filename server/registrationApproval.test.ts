// Regression coverage for the public Clerk registration approval gate.
//
// Public registrations are email-verified, but remain unauthorized until a
// platform admin approves their organization. Invited/bootstrap members are a
// separate path and must continue to work.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { members, users, invitations } from "../shared/schema";
import { storage } from "./storage";
import { requireAuth, resolveClerkAuth } from "./auth/middleware";

const RUN = crypto.randomBytes(4).toString("hex");
let registrationNumber = 0;
const orgIds: string[] = [];
const memberIds: string[] = [];
const invitationIds: string[] = [];

async function createPublicRegistration(role: "restaurant" | "supplier") {
  const suffix = `${RUN}-${++registrationNumber}`;
  const [org] = await db.insert(users).values({
    role,
    name: `${role} applicant ${suffix}`,
    companyName: `${role} applicant ${suffix}`,
    email: `${role}-${suffix}@registration.invalid`,
    verifiedAt: new Date(),
    approvalStatus: "pending",
  }).returning();
  const [member] = await db.insert(members).values({
    organizationId: org.id,
    name: `${role} contact`,
    email: org.email,
    role: "admin",
    // Public Clerk registrations have no local password.
    passwordHash: null,
    emailVerifiedAt: new Date(),
  }).returning();
  orgIds.push(org.id);
  memberIds.push(member.id);
  return { org, member };
}

function assertUnauthorized() {
  let status = 0;
  let payload: unknown;
  const req = {} as Request;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as Response;
  let nextCalled = false;
  requireAuth(req, res, (() => { nextCalled = true; }) as NextFunction);
  assert.equal(status, 401);
  assert.deepEqual(payload, {
    error: "unauthenticated",
    message: "Bitte melden Sie sich an.",
  });
  assert.equal(nextCalled, false);
}

describe("public registration approval gate", () => {
  test("restaurant and supplier registrations stay blocked after Clerk email verification", async () => {
    for (const role of ["restaurant", "supplier"] as const) {
      const { member } = await createPublicRegistration(role);
      assert.equal(await resolveClerkAuth(member.email!), null);
      // A denied AuthContext must also be rejected by every protected route.
      assertUnauthorized();
    }
  });

  test("approval unlocks the verified registration", async () => {
    const { org, member } = await createPublicRegistration("restaurant");
    await storage.markOrganizationVerified(org.id);

    const auth = await resolveClerkAuth(member.email!);
    assert.ok(auth);
    assert.equal(auth.organizationId, org.id);
    assert.equal(auth.role, "admin");
  });

  test("rejection remains blocked even after email verification", async () => {
    const { org, member } = await createPublicRegistration("supplier");
    await storage.rejectOrganization(org.id);

    assert.equal(await resolveClerkAuth(member.email!), null);
    assertUnauthorized();
  });

  test("accepted invited members and approved demo-style members are not caught by the public gate", async () => {
    const [org] = await db.insert(users).values({
      role: "supplier",
      name: `invited org ${RUN}`,
      email: `invited-org-${RUN}@registration.invalid`,
      verifiedAt: new Date(),
      approvalStatus: "approved",
    }).returning();
    const [member] = await db.insert(members).values({
      organizationId: org.id,
      name: "Invited member",
      email: `invited-${RUN}@registration.invalid`,
      role: "admin",
      passwordHash: "demo-only-hash",
      emailVerifiedAt: new Date(),
    }).returning();
    const [invitation] = await db.insert(invitations).values({
      memberId: member.id,
      tokenHash: crypto.randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: new Date(),
    }).returning();
    orgIds.push(org.id);
    memberIds.push(member.id);
    invitationIds.push(invitation.id);

    assert.ok(await resolveClerkAuth(member.email!));
  });
});

after(async () => {
  if (invitationIds.length) await db.delete(invitations).where(inArray(invitations.id, invitationIds));
  if (memberIds.length) await db.delete(members).where(inArray(members.id, memberIds));
  if (orgIds.length) await db.delete(users).where(inArray(users.id, orgIds));
});