import { z } from "zod";
import { ISO_ALPHA_2_COUNTRY_CODES } from "@shared/schema";
import type { ProductPackagingType, SustainabilitySource as SchemaSustainabilitySource } from "@shared/schema";

export const LOCAL_SUSTAINABILITY_CALCULATION_VERSION = "local-product-v1.0.0";
export const SUSTAINABILITY_WRITE_FIELDS = [
  "originCountryCode",
  "originRegion",
  "originLocality",
  "originPostalCode",
  "seasonMonths",
  "packagingType",
  "sustainabilityEvidenceUrl",
  "sustainabilityEvidenceNote",
] as const;

export type SustainabilityWriteField = typeof SUSTAINABILITY_WRITE_FIELDS[number];
export type PackagingType = ProductPackagingType;
export type SustainabilitySource = SchemaSustainabilitySource;

export const sustainabilityWriteSchema = z.object({
  originCountryCode: z.string().regex(/^[A-Z]{2}$/, "Must be an uppercase ISO alpha-2 country code")
    .refine((code) => ISO_ALPHA_2_COUNTRY_CODES.has(code), "Must be a valid ISO alpha-2 country code")
    .nullable().optional(),
  originRegion: z.string().trim().min(1).max(200).nullable().optional(),
  originLocality: z.string().trim().min(1).max(200).nullable().optional(),
  originPostalCode: z.string().trim().min(1).max(20).nullable().optional(),
  seasonMonths: z.array(z.number().int().min(1).max(12)).max(12)
    .refine((months) => new Set(months).size === months.length, "Season months must be unique")
    .nullable().optional(),
  packagingType: z.enum(["none", "returnable", "recyclable", "compostable", "single_use", "mixed"]).nullable().optional(),
  sustainabilityEvidenceUrl: z.string().url().max(2000)
    .refine((value) => /^https?:\/\//.test(value), "Evidence URL must use HTTP(S)")
    .nullable().optional(),
  sustainabilityEvidenceNote: z.string().trim().min(1).max(5000).nullable().optional(),
}).strict();

export interface SustainabilityMetadata {
  originCountryCode?: string | null;
  originRegion?: string | null;
  originLocality?: string | null;
  originPostalCode?: string | null;
  seasonMonths?: number[] | null;
  packagingType?: PackagingType | null;
  sustainabilitySource?: SustainabilitySource | null;
  sustainabilityEvidenceUrl?: string | null;
  sustainabilityEvidenceNote?: string | null;
  sustainabilityVerifiedAt?: Date | string | null;
  sustainabilityUpdatedAt?: Date | string | null;
}

export function hasSustainabilityWrite(input: Record<string, unknown>): boolean {
  return SUSTAINABILITY_WRITE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(input, field));
}

export function stampSupplierSustainability<T extends Record<string, unknown>>(
  input: T,
  existing: SustainabilityMetadata | null,
  now: Date,
): T & Partial<SustainabilityMetadata> {
  if (!hasSustainabilityWrite(input)) return input;
  const changed = SUSTAINABILITY_WRITE_FIELDS.some((field) => {
    if (!Object.prototype.hasOwnProperty.call(input, field)) return false;
    const incoming = input[field];
    const current = existing?.[field] ?? null;
    if (Array.isArray(incoming) || Array.isArray(current)) {
      return JSON.stringify(incoming ?? null) !== JSON.stringify(current ?? null);
    }
    return (incoming ?? null) !== current;
  });
  if (!changed) return input;
  const evidenceUrl = Object.prototype.hasOwnProperty.call(input, "sustainabilityEvidenceUrl")
    ? input.sustainabilityEvidenceUrl
    : existing?.sustainabilityEvidenceUrl;
  const evidenceNote = Object.prototype.hasOwnProperty.call(input, "sustainabilityEvidenceNote")
    ? input.sustainabilityEvidenceNote
    : existing?.sustainabilityEvidenceNote;
  const hasEvidence = (typeof evidenceUrl === "string" && evidenceUrl.length > 0)
    || (typeof evidenceNote === "string" && evidenceNote.length > 0);
  const evidenceChanged = ["sustainabilityEvidenceUrl", "sustainabilityEvidenceNote"].some((field) => {
    if (!Object.prototype.hasOwnProperty.call(input, field)) return false;
    return (input[field] ?? null) !== (existing?.[field as keyof SustainabilityMetadata] ?? null);
  });
  return {
    ...input,
    sustainabilitySource: "supplier",
    sustainabilityUpdatedAt: now,
    sustainabilityVerifiedAt: !hasEvidence
      ? null
      : evidenceChanged || !existing
        ? now
        : existing.sustainabilityVerifiedAt ?? null,
  };
}

export function canReadProductSustainability(input: {
  actorOrganizationId: string;
  actorOrganizationType: "supplier" | "restaurant";
  productSupplierId: string;
  hasViewCapability: boolean;
}): boolean {
  if (!input.hasViewCapability) return false;
  return input.actorOrganizationType === "restaurant"
    || input.actorOrganizationId === input.productSupplierId;
}

export function canManageProductSustainability(input: {
  actorOrganizationId: string;
  actorOrganizationType: "supplier" | "restaurant";
  productSupplierId: string;
  hasProductsManage: boolean;
  hasSustainabilityManage: boolean;
}): boolean {
  return input.actorOrganizationType === "supplier"
    && input.actorOrganizationId === input.productSupplierId
    && input.hasProductsManage
    && input.hasSustainabilityManage;
}

type Factor = {
  weight: number;
  known: boolean;
  value: number | null;
  weightedValue: number | null;
  basis: string;
};

function normalizedRegion(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function originFactor(metadata: SustainabilityMetadata): {
  factor: Factor;
  status: "verified_local" | "estimated_local" | "explicit_nonlocal" | "unknown";
} {
  const country = metadata.originCountryCode ?? null;
  const postal = metadata.originPostalCode?.trim() || null;
  const region = normalizedRegion(metadata.originRegion);
  const alias = region === "alto adige" || region === "sudtirol" || region === "south tyrol";

  if (country && country !== "IT") {
    return { status: "explicit_nonlocal", factor: { weight: 0.5, known: true, value: 0, weightedValue: 0, basis: "explicit_non_it_origin" } };
  }
  if (country === "IT" && postal && /^\d{5}$/.test(postal)) {
    const local = Number(postal) >= 39000 && Number(postal) <= 39999;
    return {
      status: local ? "verified_local" : "explicit_nonlocal",
      factor: { weight: 0.5, known: true, value: local ? 100 : 0, weightedValue: local ? 50 : 0, basis: local ? "it_postal_39000_39999" : "it_postal_outside_boundary" },
    };
  }
  if (!postal && alias && (!country || country === "IT")) {
    return { status: "estimated_local", factor: { weight: 0.5, known: true, value: 100, weightedValue: 50, basis: "south_tyrol_region_alias_without_postal" } };
  }
  return { status: "unknown", factor: { weight: 0.5, known: false, value: null, weightedValue: null, basis: "insufficient_explicit_origin" } };
}

const PACKAGING_VALUES: Record<PackagingType, number> = {
  none: 100,
  returnable: 100,
  recyclable: 75,
  compostable: 75,
  mixed: 40,
  single_use: 0,
};

export function calculateLocalSustainability(metadata: SustainabilityMetadata, snapshot = new Date()) {
  if (!Number.isFinite(snapshot.getTime())) throw new Error("Invalid sustainability snapshot");
  const origin = originFactor(metadata);
  const month = snapshot.getUTCMonth() + 1;
  const seasonKnown = Array.isArray(metadata.seasonMonths) && metadata.seasonMonths.length > 0;
  const seasonValue = seasonKnown ? (metadata.seasonMonths!.includes(month) ? 100 : 0) : null;
  const season: Factor = {
    weight: 0.3,
    known: seasonKnown,
    value: seasonValue,
    weightedValue: seasonValue === null ? null : seasonValue * 0.3,
    basis: seasonKnown ? (seasonValue === 100 ? "snapshot_month_in_season" : "snapshot_month_out_of_season") : "season_months_unknown",
  };
  const packagingKnown = metadata.packagingType != null;
  const packagingValue = packagingKnown ? PACKAGING_VALUES[metadata.packagingType!] : null;
  const packaging: Factor = {
    weight: 0.2,
    known: packagingKnown,
    value: packagingValue,
    weightedValue: packagingValue === null ? null : packagingValue * 0.2,
    basis: packagingKnown ? `packaging_${metadata.packagingType}` : "packaging_unknown",
  };
  const factors = { origin: origin.factor, currentSeason: season, packaging };
  const known = Object.values(factors).filter((factor) => factor.known);
  const coverage = known.reduce((sum, factor) => sum + factor.weight, 0);
  const weighted = known.reduce((sum, factor) => sum + (factor.weightedValue ?? 0), 0);
  const verifiedAt = metadata.sustainabilityVerifiedAt
    ? new Date(metadata.sustainabilityVerifiedAt)
    : null;
  const evidenceAge = verifiedAt ? snapshot.getTime() - verifiedAt.getTime() : NaN;
  const evidenceFresh = verifiedAt !== null
    && Number.isFinite(verifiedAt.getTime())
    && evidenceAge >= 0
    && evidenceAge <= 365 * 24 * 60 * 60 * 1000;
  const hasEvidenceReference = Boolean(metadata.sustainabilityEvidenceUrl || metadata.sustainabilityEvidenceNote);
  const hasSource = metadata.sustainabilitySource != null;
  const scoreEligible = coverage >= 0.8 && evidenceFresh && hasEvidenceReference && hasSource;
  const score = scoreEligible ? Math.round((weighted / coverage) * 100) / 100 : null;
  const classification = known.length === 0
    ? "unknown"
    : evidenceFresh && hasEvidenceReference && hasSource && origin.status !== "estimated_local"
      ? "verified"
      : "estimated";
  const missingInputs: string[] = [];
  if (!origin.factor.known) missingInputs.push("origin");
  if (!season.known) missingInputs.push("seasonMonths");
  if (!packaging.known) missingInputs.push("packagingType");
  if (!hasSource) missingInputs.push("sustainabilitySource");
  if (!hasEvidenceReference) missingInputs.push("sustainabilityEvidence");
  else if (!evidenceFresh) missingInputs.push("freshSustainabilityEvidence");

  return {
    factorBreakdown: factors,
    provenance: {
      source: metadata.sustainabilitySource ?? null,
      originStatus: origin.status,
      evidenceStatus: !hasEvidenceReference || !verifiedAt
        ? "missing"
        : evidenceFresh ? "fresh" : "stale",
      verifiedAt: verifiedAt && Number.isFinite(verifiedAt.getTime()) ? verifiedAt.toISOString() : null,
      updatedAt: metadata.sustainabilityUpdatedAt ? new Date(metadata.sustainabilityUpdatedAt).toISOString() : null,
    },
    snapshotPeriod: {
      month: snapshot.toISOString().slice(0, 7),
      snapshotAt: snapshot.toISOString(),
    },
    calculationVersion: LOCAL_SUSTAINABILITY_CALCULATION_VERSION,
    coverage: Math.round(coverage * 100) / 100,
    missingInputs,
    classification,
    score,
    scoreEligible,
    badgeVisible: origin.status === "verified_local"
      && evidenceFresh
      && hasEvidenceReference
      && hasSource,
  } as const;
}

export function sustainabilityMetadataFromProduct(product: SustainabilityMetadata) {
  return Object.fromEntries([
    ...SUSTAINABILITY_WRITE_FIELDS.map((field) => [field, product[field] ?? null]),
    ["sustainabilitySource", product.sustainabilitySource ?? null],
    ["sustainabilityVerifiedAt", product.sustainabilityVerifiedAt ?? null],
    ["sustainabilityUpdatedAt", product.sustainabilityUpdatedAt ?? null],
  ]);
}