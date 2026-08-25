import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { generateAndStoreMonthlyReport } from "./monthlyReportService";
import { storage } from "./storage";
import {
  orders,
  products,
  users,
  type Product,
  type ProductPackagingType,
} from "@shared/schema";

/**
 * Targeted development-only demo data. The note deliberately makes clear that
 * this is curated UI verification data, not a claim received from a supplier.
 */
export const SUSTAINABILITY_DEMO_NOTE_PREFIX = "GastroConnect demo/test sustainability dataset v1";

type DemoScenario =
  | "local-seasonal-returnable"
  | "local-out-of-season"
  | "regional-seasonal"
  | "regional-out-of-season"
  | "nonlocal-seasonal"
  | "nonlocal-out-of-season"
  | "higher-packaging-impact";

type SustainabilityDemoProduct = {
  name: string;
  scenario: DemoScenario;
  originCountryCode: string;
  originRegion: string;
  originLocality: string;
  originPostalCode: string;
  seasonMonths: number[];
  packagingType: ProductPackagingType;
};

const local = (
  name: string,
  scenario: Extract<DemoScenario, "local-seasonal-returnable" | "local-out-of-season">,
  locality: string,
  postalCode: string,
  seasonMonths: number[],
  packagingType: ProductPackagingType,
): SustainabilityDemoProduct => ({
  name,
  scenario,
  originCountryCode: "IT",
  originRegion: "South Tyrol",
  originLocality: locality,
  originPostalCode: postalCode,
  seasonMonths,
  packagingType,
});

const regional = (
  name: string,
  scenario: Extract<DemoScenario, "regional-seasonal" | "regional-out-of-season">,
  region: string,
  locality: string,
  postalCode: string,
  seasonMonths: number[],
  packagingType: ProductPackagingType,
): SustainabilityDemoProduct => ({
  name,
  scenario,
  originCountryCode: "IT",
  originRegion: region,
  originLocality: locality,
  originPostalCode: postalCode,
  seasonMonths,
  packagingType,
});

const nonLocal = (
  name: string,
  scenario: Extract<DemoScenario, "nonlocal-seasonal" | "nonlocal-out-of-season" | "higher-packaging-impact">,
  countryCode: string,
  region: string,
  locality: string,
  postalCode: string,
  seasonMonths: number[],
  packagingType: ProductPackagingType,
): SustainabilityDemoProduct => ({
  name,
  scenario,
  originCountryCode: countryCode,
  originRegion: region,
  originLocality: locality,
  originPostalCode: postalCode,
  seasonMonths,
  packagingType,
});

/**
 * These products deliberately span positive, mixed, and poor sustainability
 * outcomes in the existing Frische Produkte GmbH demo catalog.
 */
export const SUSTAINABILITY_DEMO_PRODUCTS: readonly SustainabilityDemoProduct[] = [
  local("Bio Äpfel", "local-seasonal-returnable", "Meran", "39012", [8, 9, 10, 11], "returnable"),
  local("Karotten", "local-seasonal-returnable", "Lana", "39011", [7, 8, 9, 10], "recyclable"),
  local("Kartoffeln", "local-seasonal-returnable", "Mals", "39024", [8, 9, 10, 11], "none"),
  local("Basilikum", "local-seasonal-returnable", "Bozen", "39100", [5, 6, 7, 8, 9], "returnable"),
  local("Petersilie", "local-seasonal-returnable", "Eppan", "39057", [4, 5, 6, 7, 8, 9, 10], "none"),
  local("Rosmarin", "local-seasonal-returnable", "Kaltern", "39052", [5, 6, 7, 8, 9], "recyclable"),
  local("Zwiebeln", "local-seasonal-returnable", "Vinschgau", "39020", [8, 9, 10, 11], "recyclable"),
  local("Apfelsaft", "local-seasonal-returnable", "Brixen", "39042", [8, 9, 10, 11], "returnable"),
  local("Bio Gurken", "local-out-of-season", "Terlan", "39018", [5, 6, 7], "returnable"),
  local("Bio Spinat", "local-out-of-season", "Bozen", "39100", [3, 4, 5], "compostable"),
  local("Bio Tomaten", "local-out-of-season", "Leifers", "39055", [6, 7], "recyclable"),

  regional("Zucchini", "regional-seasonal", "Trentino", "Trento", "38122", [6, 7, 8, 9], "compostable"),
  regional("Auberginen", "regional-seasonal", "Veneto", "Padua", "35121", [6, 7, 8, 9], "recyclable"),
  regional("Brokkoli", "regional-seasonal", "Trentino", "Rovereto", "38068", [7, 8, 9, 10], "recyclable"),
  regional("Champignons", "regional-seasonal", "Veneto", "Verona", "37121", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "returnable"),
  regional("Lauch", "regional-seasonal", "Trentino", "Pergine Valsugana", "38057", [8, 9, 10, 11], "recyclable"),
  regional("Eisbergsalat", "regional-seasonal", "Veneto", "Rovigo", "45100", [5, 6, 7, 8, 9], "recyclable"),
  regional("Bio Knoblauch", "regional-seasonal", "Veneto", "Chioggia", "30015", [7, 8, 9], "recyclable"),
  regional("Blumenkohl", "regional-out-of-season", "Veneto", "Treviso", "31100", [10, 11, 12, 1, 2], "recyclable"),
  regional("Paprika rot", "regional-out-of-season", "Trentino", "Arco", "38062", [6, 7], "mixed"),
  regional("Spargel weiß", "regional-out-of-season", "Veneto", "Bassano del Grappa", "36061", [4, 5, 6], "recyclable"),
  regional("Mineralwasser", "regional-seasonal", "Trentino", "Levico Terme", "38056", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "returnable"),

  nonLocal("Mozzarella di Bufala", "nonlocal-seasonal", "IT", "Campania", "Caserta", "81100", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "returnable"),
  nonLocal("Burrata", "nonlocal-seasonal", "IT", "Puglia", "Bari", "70121", [5, 6, 7, 8, 9], "returnable"),
  nonLocal("Avocado", "nonlocal-out-of-season", "ES", "Andalusia", "Málaga", "29001", [1, 2, 3], "single_use"),
  nonLocal("Bananen", "nonlocal-out-of-season", "EC", "Pichincha", "Quito", "170150", [1, 2, 3], "single_use"),
  nonLocal("Hähnchenbrust", "higher-packaging-impact", "DE", "Bavaria", "Munich", "80331", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "mixed"),
  nonLocal("Bratwurst", "higher-packaging-impact", "DE", "Bavaria", "Augsburg", "86150", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "single_use"),
  nonLocal("Schweineschnitzel", "higher-packaging-impact", "DE", "Bavaria", "Rosenheim", "83022", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "mixed"),
  nonLocal("Pils Premium", "nonlocal-out-of-season", "DE", "North Rhine-Westphalia", "Dortmund", "44135", [1, 2, 3], "returnable"),
  nonLocal("Marokk. Minze", "nonlocal-out-of-season", "MA", "Marrakesh-Safi", "Marrakesh", "40000", [1, 2, 3], "single_use"),
] as const;

const ORDER_PLANS = [
  { key: "local-seasonal", productNames: ["Bio Äpfel", "Karotten", "Basilikum"], quantities: [8, 6, 4] },
  { key: "mixed-impact", productNames: ["Bio Tomaten", "Zucchini", "Avocado"], quantities: [6, 4, 3] },
  { key: "nonlocal-impact", productNames: ["Bananen", "Hähnchenbrust", "Bratwurst"], quantities: [5, 3, 2] },
  { key: "regional-impact", productNames: ["Mozzarella di Bufala", "Eisbergsalat", "Mineralwasser"], quantities: [6, 5, 2] },
] as const;

function evidenceNote(fixture: SustainabilityDemoProduct): string {
  return `${SUSTAINABILITY_DEMO_NOTE_PREFIX} — ${fixture.scenario}; curated development fixture for UI verification, not a supplier-origin claim.`;
}

function hasAnySustainabilityData(product: Product): boolean {
  return [
    product.originCountryCode,
    product.originRegion,
    product.originLocality,
    product.originPostalCode,
    product.seasonMonths,
    product.packagingType,
    product.sustainabilitySource,
    product.sustainabilityEvidenceUrl,
    product.sustainabilityEvidenceNote,
    product.sustainabilityVerifiedAt,
    product.sustainabilityUpdatedAt,
  ].some((value) => value !== null && value !== undefined);
}

function isSeedOwned(product: Product): boolean {
  return product.sustainabilityEvidenceNote?.startsWith(SUSTAINABILITY_DEMO_NOTE_PREFIX) ?? false;
}

export type SustainabilityDemoSeedResult = {
  updatedProducts: number;
  alreadySeededProducts: number;
  createdOrders: number;
  existingOrders: number;
  reportMonth: string;
  reportScore: number | null;
  reportItemCount: number;
};

/**
 * Safe, idempotent development seed. It only touches explicitly named products
 * that have no metadata yet or already carry this seed's provenance marker.
 */
export async function seedSustainabilityDemoData(): Promise<SustainabilityDemoSeedResult> {
  const [supplier] = await db.select().from(users)
    .where(and(eq(users.role, "supplier"), eq(users.companyName, "Frische Produkte GmbH")))
    .limit(1);
  const [restaurant] = await db.select().from(users)
    .where(and(eq(users.role, "restaurant"), eq(users.companyName, "Gasthof Alpenblick")))
    .limit(1);
  if (!supplier || !restaurant) {
    throw new Error("Required GastroConnect demo organizations are missing");
  }

  const targetNames = SUSTAINABILITY_DEMO_PRODUCTS.map((fixture) => fixture.name);
  const catalog = await db.select().from(products).where(and(
    eq(products.supplierId, supplier.id),
    inArray(products.name, targetNames),
  ));
  const catalogByName = new Map(catalog.map((product) => [product.name, product] as const));
  const missingProducts = targetNames.filter((name) => !catalogByName.has(name));
  if (missingProducts.length > 0) {
    throw new Error(`Sustainability demo seed is incomplete; missing products: ${missingProducts.join(", ")}`);
  }
  const duplicateTargetNames = targetNames.filter((name) => catalog.filter((product) => product.name === name).length > 1);
  if (duplicateTargetNames.length > 0) {
    throw new Error(`Sustainability demo seed requires unique product names; duplicates found: ${duplicateTargetNames.join(", ")}`);
  }

  const conflicts = SUSTAINABILITY_DEMO_PRODUCTS
    .map((fixture) => catalogByName.get(fixture.name)!)
    .filter((product) => hasAnySustainabilityData(product) && !isSeedOwned(product))
    .map((product) => product.name);
  if (conflicts.length > 0) {
    throw new Error(`Refusing to overwrite non-demo sustainability metadata for: ${conflicts.join(", ")}`);
  }

  const now = new Date();
  let updatedProducts = 0;
  let alreadySeededProducts = 0;
  await db.transaction(async (tx) => {
    for (const fixture of SUSTAINABILITY_DEMO_PRODUCTS) {
      const product = catalogByName.get(fixture.name)!;
      if (isSeedOwned(product)) {
        alreadySeededProducts++;
        continue;
      }
      await tx.update(products).set({
        originCountryCode: fixture.originCountryCode,
        originRegion: fixture.originRegion,
        originLocality: fixture.originLocality,
        originPostalCode: fixture.originPostalCode,
        seasonMonths: fixture.seasonMonths,
        packagingType: fixture.packagingType,
        sustainabilitySource: "admin",
        sustainabilityEvidenceUrl: null,
        sustainabilityEvidenceNote: evidenceNote(fixture),
        sustainabilityVerifiedAt: now,
        sustainabilityUpdatedAt: now,
      }).where(eq(products.id, product.id));
      updatedProducts++;
    }
  });

  let createdOrders = 0;
  let existingOrders = 0;
  for (const plan of ORDER_PLANS) {
    const idempotencyKey = `sustainability-demo-v1-${plan.key}`;
    const [existing] = await db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.restaurantId, restaurant.id), eq(orders.supplierId, supplier.id), eq(orders.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) {
      existingOrders++;
      continue;
    }

    const items = plan.productNames.map((name, index) => {
      const product = catalogByName.get(name)!;
      const quantity = plan.quantities[index];
      const unitPrice = Number(product.price);
      return {
        // createOrder replaces this with its newly created order id. The
        // InsertOrderItem type retains it because the same type also supports
        // direct bulk inserts elsewhere.
        orderId: "",
        productId: product.id,
        productName: product.name,
        quantity,
        confirmedQuantity: quantity,
        rejectedQuantity: 0,
        unitPrice: unitPrice.toFixed(2),
        totalPrice: (unitPrice * quantity).toFixed(2),
      };
    });
    const totalAmount = items.reduce((total, item) => total + Number(item.totalPrice), 0).toFixed(2);
    await storage.createOrder({
      restaurantId: restaurant.id,
      supplierId: supplier.id,
      createdByUserId: restaurant.id,
      status: "confirmed",
      totalAmount,
      notes: `Sustainability demo order (${plan.key}); generated through the order snapshot workflow.`,
      idempotencyKey,
      idempotencyFingerprint: "sustainability-demo-v1",
      requestedDeliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }, items, {
      reserveStock: false,
      initialStatusHistory: true,
      queueNotification: false,
    });
    createdOrders++;
  }

  const reportMonth = now.toISOString().slice(0, 7);
  const { payload } = await generateAndStoreMonthlyReport(restaurant.id, reportMonth, { notify: false });
  return {
    updatedProducts,
    alreadySeededProducts,
    createdOrders,
    existingOrders,
    reportMonth,
    reportScore: payload.localImpact?.score ?? null,
    reportItemCount: payload.localImpact?.itemCount ?? 0,
  };
}