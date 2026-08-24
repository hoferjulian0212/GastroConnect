import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { getClerkEmail } from "./auth/routes";

test("registration routes retain the Clerk email captured before app auth replaces req.auth", () => {
  const req = {
    clerkEmail: "Applicant@Example.com",
    // This resembles the application AuthContext that loadAuth stores after it
    // reads Clerk's own request auth object.
    auth: undefined,
  } as Request;

  assert.equal(getClerkEmail(req), "Applicant@Example.com");
});