import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLocalSustainability,
  canManageProductSustainability,
  canReadProductSustainability,
  stampSupplierSustainability,
  sustainabilityWriteSchema,
} from "./localSustainability";

const snapshot = new Date("2026-08-15T12:00:00.000Z");
const freshEvidence = {
  sustainabilitySource: "supplier" as const,
  sustainabilityEvidenceNote: "Supplier certificate on file",
  sustainabilityVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
};

test("verified South Tyrol origin uses explicit IT postal boundary and enables badge", () => {
  const result = calculateLocalSustainability({
    originCountryCode: "IT",
    originPostalCode: "39100",
    seasonMonths: [8],
    ...freshEvidence,
  }, snapshot);
  assert.equal(result.calculationVersion, "local-product-v1.0.0");
  assert.equal(result.coverage, 0.8);
  assert.equal(result.score, 100);
  assert.equal(result.classification, "verified");
  assert.equal(result.provenance.originStatus, "verified_local");
  assert.equal(result.badgeVisible, true);
  assert.deepEqual(result.missingInputs, ["packagingType"]);
});

test("region alias without postal code is estimated and never receives local badge", () => {
  const result = calculateLocalSustainability({
    originCountryCode: "IT",
    originRegion: "Südtirol",
    seasonMonths: [8],
    packagingType: "recyclable",
    ...freshEvidence,
  }, snapshot);
  assert.equal(result.score, 95);
  assert.equal(result.classification, "estimated");
  assert.equal(result.provenance.originStatus, "estimated_local");
  assert.equal(result.badgeVisible, false);
});

test("explicit nonlocal origin is scored zero and stale evidence is estimated", () => {
  const result = calculateLocalSustainability({
    originCountryCode: "FR",
    seasonMonths: [8],
    packagingType: "returnable",
    sustainabilitySource: "supplier",
    sustainabilityEvidenceUrl: "https://example.test/evidence",
    sustainabilityVerifiedAt: new Date("2025-08-14T00:00:00.000Z"),
  }, snapshot);
  assert.equal(result.coverage, 1);
  assert.equal(result.score, null);
  assert.equal(result.scoreEligible, false);
  assert.equal(result.classification, "estimated");
  assert.equal(result.provenance.evidenceStatus, "stale");
  assert.equal(result.badgeVisible, false);
});

test("unknown factors remain unknown and do not invent a score", () => {
  const result = calculateLocalSustainability({}, snapshot);
  assert.equal(result.coverage, 0);
  assert.equal(result.score, null);
  assert.equal(result.classification, "unknown");
  assert.deepEqual(result.missingInputs, [
    "origin",
    "seasonMonths",
    "packagingType",
    "sustainabilitySource",
    "sustainabilityEvidence",
  ]);
});

test("supplier stamping changes only when sustainability metadata changes", () => {
  const now = new Date("2026-08-15T00:00:00.000Z");
  assert.deepEqual(stampSupplierSustainability({ name: "Apple" }, null, now), { name: "Apple" });
  assert.deepEqual(
    stampSupplierSustainability(
      { packagingType: "compostable" },
      { packagingType: "compostable", sustainabilityEvidenceNote: "Existing evidence" },
      now,
    ),
    { packagingType: "compostable" },
  );
  const stamped = stampSupplierSustainability(
    { packagingType: "compostable" },
    { packagingType: "recyclable", sustainabilityEvidenceNote: "Existing evidence" },
    now,
  );
  assert.equal(stamped.sustainabilitySource, "supplier");
  assert.equal(stamped.sustainabilityUpdatedAt, now);
  assert.equal(stamped.sustainabilityVerifiedAt, null);
  const oldVerification = new Date("2025-01-01T00:00:00.000Z");
  const metadataOnlyChange = stampSupplierSustainability(
    { packagingType: "returnable" },
    {
      packagingType: "recyclable",
      sustainabilityEvidenceNote: "Existing evidence",
      sustainabilityVerifiedAt: oldVerification,
    },
    now,
  );
  assert.equal(metadataOnlyChange.sustainabilityVerifiedAt, oldVerification);
  const cleared = stampSupplierSustainability(
    { sustainabilityEvidenceNote: null, sustainabilityEvidenceUrl: null },
    { sustainabilityEvidenceNote: "Old evidence" },
    now,
  );
  assert.equal(cleared.sustainabilityVerifiedAt, null);
});

test("sustainability write validation is strict", () => {
  assert.equal(sustainabilityWriteSchema.safeParse({ originCountryCode: "it" }).success, false);
  assert.equal(sustainabilityWriteSchema.safeParse({ originCountryCode: "ZZ" }).success, false);
  assert.equal(sustainabilityWriteSchema.safeParse({ seasonMonths: [1, 1] }).success, false);
  assert.equal(sustainabilityWriteSchema.safeParse({ packagingType: "plastic" }).success, false);
  assert.equal(sustainabilityWriteSchema.safeParse({ sustainabilityEvidenceUrl: "ftp://example.test/a" }).success, false);
  assert.equal(sustainabilityWriteSchema.safeParse({ sustainabilitySource: "supplier" }).success, false);
});

test("an empty season list remains unknown rather than out of season", () => {
  const result = calculateLocalSustainability({ seasonMonths: [] }, snapshot);
  assert.equal(result.factorBreakdown.currentSeason.known, false);
  assert.equal(result.classification, "unknown");
  assert.equal(result.score, null);
});

test("read and manage helpers fail closed for roles and cross-organization access", () => {
  assert.equal(canReadProductSustainability({
    actorOrganizationId: "supplier-a",
    actorOrganizationType: "supplier",
    productSupplierId: "supplier-b",
    hasViewCapability: true,
  }), false);
  assert.equal(canReadProductSustainability({
    actorOrganizationId: "restaurant-a",
    actorOrganizationType: "restaurant",
    productSupplierId: "supplier-b",
    hasViewCapability: true,
  }), true);
  assert.equal(canManageProductSustainability({
    actorOrganizationId: "supplier-a",
    actorOrganizationType: "supplier",
    productSupplierId: "supplier-a",
    hasProductsManage: true,
    hasSustainabilityManage: false,
  }), false);
  assert.equal(canManageProductSustainability({
    actorOrganizationId: "supplier-a",
    actorOrganizationType: "supplier",
    productSupplierId: "supplier-a",
    hasProductsManage: true,
    hasSustainabilityManage: true,
  }), true);
});