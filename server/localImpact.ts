import type { LocalImpact, LocalImpactFactor } from "@shared/localImpact";
import { unavailableLocalImpact } from "@shared/localImpact";
import {
  calculateLocalSustainability,
  type SustainabilityMetadata,
} from "./localSustainability";

type RestaurantLocationInput = {
  latitude?: number | string | null;
  longitude?: number | string | null;
};

function productOriginLabel(product: SustainabilityMetadata): string | null {
  const locality = product.originLocality?.trim();
  const region = product.originRegion?.trim();
  const country = product.originCountryCode?.trim();
  const postal = product.originPostalCode?.trim();
  const place = [postal, locality].filter(Boolean).join(" ");
  const parts = [place, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function factor(
  key: LocalImpactFactor["key"],
  label: string,
  value: number | null,
  missingReason: string,
): LocalImpactFactor {
  return value === null
    ? { key, label, value: null, available: false, missingReason }
    : { key, label, value, available: true };
}

/**
 * Adapts the approved Product Local methodology to the UI/report DTO.
 * Distance remains unavailable because the canonical origin contract does not
 * contain product coordinates.
 */
export function calculateLocalImpact(
  product: SustainabilityMetadata,
  _restaurant: RestaurantLocationInput = {},
  asOf = new Date(),
): LocalImpact {
  if (!product || Object.keys(product).length === 0) return unavailableLocalImpact();

  const calculation = calculateLocalSustainability(product, asOf);
  const originStatus = calculation.provenance.originStatus;
  const originValue = calculation.factorBreakdown.origin.value;
  const seasonalValue = calculation.factorBreakdown.currentSeason.value;
  const packagingValue = calculation.factorBreakdown.packaging.value;
  const isLocal = calculation.badgeVisible
    ? true
    : originStatus === "explicit_nonlocal" ? false : null;
  const isSeasonal = seasonalValue === null ? null : seasonalValue === 100;
  const lowWaste = packagingValue === null ? null : packagingValue >= 75;
  const packagingReusable = product.packagingType === null || product.packagingType === undefined
    ? null
    : product.packagingType === "returnable";
  const source = product.sustainabilitySource === "supplier"
    ? "supplier"
    : product.sustainabilitySource === "erp" || product.sustainabilitySource === "admin"
      ? "system"
      : "unknown";

  return {
    calculationVersion: calculation.calculationVersion,
    classification: calculation.classification,
    source,
    coverage: calculation.coverage,
    missingInputs: [...calculation.missingInputs],
    isLocal,
    isSeasonal,
    lowWaste,
    originLabel: productOriginLabel(product),
    seasonMonths: Array.isArray(product.seasonMonths) && product.seasonMonths.length > 0
      ? [...product.seasonMonths]
      : null,
    packagingType: product.packagingType ?? null,
    packagingKnown: product.packagingType !== null && product.packagingType !== undefined,
    packagingReusable,
    distanceKm: null,
    distanceClassification: "unknown",
    score: calculation.score,
    scoreBreakdown: [
      factor("local", "Local", originValue, "Keine bestätigte Herkunft"),
      factor("seasonal", "Saison", seasonalValue, "Keine Saisonmonate hinterlegt"),
      factor("packaging", "Verpackung", packagingValue, "Keine Verpackungsangabe"),
    ],
    signal: calculation.badgeVisible
      ? "local"
      : isSeasonal === true ? "seasonal" : lowWaste === true ? "lowWaste" : null,
  };
}