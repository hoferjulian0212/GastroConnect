import test from "node:test";
import assert from "node:assert/strict";
import { calculateLocalImpact } from "./localImpact";
import {
  LOCAL_IMPACT_CALCULATION_VERSION,
  summarizeLocalImpact,
} from "../shared/localImpact";

test("missing Local metadata remains explicitly unavailable", () => {
  const impact = calculateLocalImpact({}, {}, new Date("2026-08-01T00:00:00Z"));
  assert.equal(impact.score, null);
  assert.equal(impact.isLocal, null);
  assert.equal(impact.distanceKm, null);
  assert.equal(impact.classification, "unknown");
  assert.ok(impact.missingInputs.includes("origin"));
  assert.ok(impact.missingInputs.includes("sustainabilityEvidence"));
});

test("explicit metadata produces one compact signal and an evidence score", () => {
  const impact = calculateLocalImpact({
    originCountryCode: "IT",
    originPostalCode: "39100",
    originLocality: "Bozen",
    originRegion: "Südtirol",
    seasonMonths: [6, 7, 8, 9],
    packagingType: "returnable",
    sustainabilitySource: "supplier",
    sustainabilityEvidenceNote: "Supplier certificate on file",
    sustainabilityVerifiedAt: new Date("2026-08-01T00:00:00Z"),
  }, {}, new Date("2026-08-15T00:00:00Z"));

  assert.equal(impact.calculationVersion, LOCAL_IMPACT_CALCULATION_VERSION);
  assert.equal(impact.signal, "local");
  assert.equal(impact.isSeasonal, true);
  assert.equal(impact.classification, "verified");
  assert.equal(impact.source, "supplier");
  assert.equal(impact.distanceKm, null);
  assert.ok(impact.score !== null && impact.score > 0);
});

test("stale evidence cannot produce a verified Local signal", () => {
  const stale = calculateLocalImpact({
    originCountryCode: "IT",
    originPostalCode: "39100",
    seasonMonths: [8],
    packagingType: "returnable",
    sustainabilitySource: "admin",
    sustainabilityEvidenceNote: "Reviewed evidence",
    sustainabilityVerifiedAt: new Date("2024-01-01T00:00:00Z"),
  }, {}, new Date("2026-08-01T00:00:00Z"));
  assert.equal(stale.classification, "estimated");
  assert.equal(stale.isLocal, null);
  assert.notEqual(stale.signal, "local");
  assert.equal(stale.score, null);
});

test("aggregate counts stay unavailable when any product lacks that input", () => {
  const known = calculateLocalImpact({
    originCountryCode: "IT",
    originPostalCode: "39100",
    seasonMonths: [8],
    packagingType: "recyclable",
    sustainabilitySource: "supplier",
    sustainabilityEvidenceNote: "Certificate",
    sustainabilityVerifiedAt: new Date("2026-07-01T00:00:00Z"),
  }, {}, new Date("2026-08-01T00:00:00Z"));
  const unknown = calculateLocalImpact({}, {}, new Date("2026-08-01T00:00:00Z"));
  const summary = summarizeLocalImpact([
    { impact: known, quantity: 2 },
    { impact: unknown, quantity: 3 },
  ]);
  assert.equal(summary.localItemCount, null);
  assert.equal(summary.seasonalItemCount, null);
  assert.equal(summary.lowWasteItemCount, null);
  assert.equal(summary.itemCount, 2);
});