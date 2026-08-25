/**
 * Client-safe Local impact DTOs and aggregation.
 *
 * Product scoring itself stays server-side in the canonical sustainability
 * calculator. Consumers must not turn missing inputs into zero.
 */

export const LOCAL_IMPACT_CALCULATION_VERSION = "local-product-v1.0.0";

export type ImpactClassification = "verified" | "estimated" | "unknown";
export type ImpactSource = "supplier" | "system" | "unknown";

export type LocalImpactFactor = {
  key: "local" | "seasonal" | "packaging";
  value: number | null;
  available: boolean;
  label: string;
  missingReason?: string;
};

export type LocalImpact = {
  calculationVersion: string;
  classification: ImpactClassification;
  source: ImpactSource;
  coverage: number;
  missingInputs: string[];
  isLocal: boolean | null;
  isSeasonal: boolean | null;
  lowWaste: boolean | null;
  originLabel: string | null;
  seasonMonths: number[] | null;
  packagingType: string | null;
  /** Safe compact signal: packaging data exists, without exposing its details. */
  packagingKnown: boolean;
  packagingReusable: boolean | null;
  distanceKm: number | null;
  distanceClassification: ImpactClassification;
  score: number | null;
  scoreBreakdown: LocalImpactFactor[];
  signal: "local" | "seasonal" | "lowWaste" | null;
};

export function unavailableLocalImpact(): LocalImpact {
  return {
    calculationVersion: LOCAL_IMPACT_CALCULATION_VERSION,
    classification: "unknown",
    source: "unknown",
    coverage: 0,
    missingInputs: ["origin", "seasonMonths", "packagingType", "sustainabilitySource", "sustainabilityEvidence"],
    isLocal: null,
    isSeasonal: null,
    lowWaste: null,
    originLabel: null,
    seasonMonths: null,
    packagingType: null,
    packagingKnown: false,
    packagingReusable: null,
    distanceKm: null,
    distanceClassification: "unknown",
    score: null,
    scoreBreakdown: [
      { key: "local", value: null, available: false, label: "Local", missingReason: "Keine bestätigte Herkunft" },
      { key: "seasonal", value: null, available: false, label: "Saison", missingReason: "Keine Saisonmonate hinterlegt" },
      { key: "packaging", value: null, available: false, label: "Verpackung", missingReason: "Keine Verpackungsangabe" },
    ],
    signal: null,
  };
}

export type LocalImpactSummary = {
  calculationVersion: string;
  classification: ImpactClassification;
  coverage: number;
  itemCount: number;
  localItemCount: number | null;
  seasonalItemCount: number | null;
  lowWasteItemCount: number | null;
  packagingItemCount: number | null;
  score: number | null;
  missingInputs: string[];
};

export function summarizeLocalImpact(
  impacts: Array<{ impact: LocalImpact; quantity: number }>,
): LocalImpactSummary {
  const count = impacts.length;
  const withLocal = impacts.filter(({ impact }) => impact.isLocal !== null);
  const withSeason = impacts.filter(({ impact }) => impact.isSeasonal !== null);
  const withWaste = impacts.filter(({ impact }) => impact.lowWaste !== null);
  const withPackaging = impacts.filter(({ impact }) => impact.packagingKnown);
  const scored = impacts.filter(({ impact }) => impact.score !== null);
  const scoredQuantity = scored.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const weightedScore = scoredQuantity > 0
    ? Math.round(scored.reduce(
      (sum, item) => sum + (item.impact.score ?? 0) * Math.max(0, item.quantity),
      0,
    ) / scoredQuantity)
    : null;
  const missingInputs = Array.from(new Set(impacts.flatMap(({ impact }) => impact.missingInputs)));
  const coverage = count > 0 ? scored.length / count : 0;
  return {
    calculationVersion: impacts[0]?.impact.calculationVersion ?? LOCAL_IMPACT_CALCULATION_VERSION,
    classification: weightedScore === null
      ? "unknown"
      : impacts.every(({ impact }) => impact.classification === "verified") ? "verified" : "estimated",
    coverage,
    itemCount: count,
    localItemCount: withLocal.length === count
      ? withLocal.filter(({ impact }) => impact.isLocal === true).length
      : null,
    seasonalItemCount: withSeason.length === count
      ? withSeason.filter(({ impact }) => impact.isSeasonal === true).length
      : null,
    lowWasteItemCount: withWaste.length === count
      ? withWaste.filter(({ impact }) => impact.lowWaste === true).length
      : null,
    packagingItemCount: withPackaging.length === count ? withPackaging.length : null,
    score: weightedScore,
    missingInputs,
  };
}